/*
 * geometry.js — reine Geometrie-/Maßberechnung (keine DOM-Abhängigkeit).
 * Kann auch in Node geprüft werden (module.exports am Ende).
 *
 * Annahme MVP: Das Handy wird möglichst parallel zur Fensterfläche gehalten
 * und das Referenzblatt (DIN A4) liegt in derselben Ebene wie das Fenster. Dann gilt
 * eine einheitliche mm-pro-Pixel-Skalierung. Schiefe Aufnahmen erzeugen
 * Abweichungen, die der Plausibilitätscheck als Warnung meldet.
 */
(function (global) {
  'use strict';

  var Geo = {};

  // Referenzobjekte. type 'rect' => 4 Ecken antippen (dims = [kurz, lang] in mm),
  // type 'line' => zwei Punkte entlang einer bekannten Länge (mm).
  Geo.REFERENCES = {
    'a4':   { label: 'DIN A4 (Blatt, 4 Ecken)', type: 'rect', dims: [210, 297] },
    'a3':   { label: 'DIN A3 (Blatt, 4 Ecken)', type: 'rect', dims: [297, 420] },
    'a5':   { label: 'DIN A5 (Blatt, 4 Ecken)', type: 'rect', dims: [148, 210] },
    'card': { label: 'EC-/Kreditkarte (lange Seite)', type: 'line', mm: 85.60 }
  };
  Geo.DEFAULT_REFERENCE = 'a4';

  // Plausibilitäts-Größengrenzen je Objekttyp. Fenster: ein kombinierter
  // Min/Max-Korridor über Breite und Höhe. Türen: getrennte Grenzen je
  // Dimension, weil Türbreite (~600-1100mm) und Türhöhe (~1900-2100mm) in
  // sehr unterschiedlichen Bereichen liegen - ein einzelner Korridor würde
  // sonst normale Breiten oder Höhen fälschlich als unplausibel markieren.
  // Praxis-Schätzwerte, nach echten Türaufmaßen nachjustierbar.
  Geo.SIZE_LIMITS = {
    window: { minMm: 100, maxMm: 4000 },
    door: {
      widthMm: { minMm: 400, maxMm: 2200 },
      heightMm: { minMm: 1800, maxMm: 2600 }
    }
  };

  Geo.dist = function (a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  /** mm-pro-Pixel aus zwei Punkten auf dem Referenzobjekt (gemessene Strecke). */
  Geo.mmPerPx = function (refP1, refP2, referenceMm) {
    var dpx = Geo.dist(refP1, refP2);
    if (!dpx || dpx <= 0) return null;
    return referenceMm / dpx;
  };

  /**
   * mm-pro-Pixel aus den 4 Ecken eines bekannten Rechtecks (z. B. DIN A4 210×297 mm).
   * Mittelt zwei unabhängige Schätzungen (lange + kurze Seite) und ist damit
   * robuster als eine einzelne Strecke (z. B. eine Kartenlänge).
   * dims = [a, b] in mm, Reihenfolge egal.
   */
  Geo.mmPerPxFromRect = function (cornersUnordered, dims) {
    if (!cornersUnordered || cornersUnordered.length !== 4 || !dims) return null;
    var c = Geo.orderCorners(cornersUnordered); // [TL, TR, BR, BL]
    var horizPx = (Geo.dist(c[0], c[1]) + Geo.dist(c[3], c[2])) / 2; // Ober-/Unterkante
    var vertPx = (Geo.dist(c[0], c[3]) + Geo.dist(c[1], c[2])) / 2;  // linke/rechte Kante
    if (horizPx <= 0 || vertPx <= 0) return null;
    var small = Math.min(dims[0], dims[1]);
    var large = Math.max(dims[0], dims[1]);
    // Die im Bild längere Kante entspricht der größeren realen Kante.
    var rH = (horizPx >= vertPx) ? large / horizPx : small / horizPx;
    var rV = (horizPx >= vertPx) ? small / vertPx : large / vertPx;
    return (rH + rV) / 2;
  };

  /**
   * Sortiert 4 beliebig getippte Punkte in die Reihenfolge
   * TL, TR, BR, BL (Oben-Links, Oben-Rechts, Unten-Rechts, Unten-Links).
   * Standard-Trick: Summe x+y ist minimal bei TL, maximal bei BR;
   * Differenz x-y ist maximal bei TR, minimal bei BL.
   */
  Geo.orderCorners = function (pts) {
    if (!pts || pts.length !== 4) return pts ? pts.slice() : [];
    var byArr = pts.map(function (p) { return { p: p, s: p.x + p.y, d: p.x - p.y }; });
    var tl = byArr[0], br = byArr[0], tr = byArr[0], bl = byArr[0];
    byArr.forEach(function (o) {
      if (o.s < tl.s) tl = o;
      if (o.s > br.s) br = o;
      if (o.d > tr.d) tr = o;
      if (o.d < bl.d) bl = o;
    });
    return [tl.p, tr.p, br.p, bl.p];
  };

  /**
   * Berechnet Fenstermaße aus 4 Eckpunkten und der mm/px-Skalierung.
   * Breite = Mittel aus Ober- und Unterkante, Höhe = Mittel aus linker und
   * rechter Kante (mittelt leichte Perspektive aus).
   */
  Geo.measure = function (cornersUnordered, mmPerPx) {
    var c = Geo.orderCorners(cornersUnordered);
    var TL = c[0], TR = c[1], BR = c[2], BL = c[3];

    var topPx = Geo.dist(TL, TR);
    var bottomPx = Geo.dist(BL, BR);
    var leftPx = Geo.dist(TL, BL);
    var rightPx = Geo.dist(TR, BR);
    var diag1Px = Geo.dist(TL, BR);
    var diag2Px = Geo.dist(TR, BL);

    return {
      widthMm: ((topPx + bottomPx) / 2) * mmPerPx,
      heightMm: ((leftPx + rightPx) / 2) * mmPerPx,
      topMm: topPx * mmPerPx,
      bottomMm: bottomPx * mmPerPx,
      leftMm: leftPx * mmPerPx,
      rightMm: rightPx * mmPerPx,
      diag1Mm: diag1Px * mmPerPx,
      diag2Mm: diag2Px * mmPerPx,
      orderedCorners: c
    };
  };

  Geo.pctDiff = function (a, b) {
    var avg = (a + b) / 2;
    if (avg === 0) return 0;
    return Math.abs(a - b) / avg * 100;
  };

  /**
   * Plausibilitätscheck. Liefert Liste von Hinweisen, Schiefe-Kennzahlen und
   * einen Qualitäts-Score (0–100). Grenzwerte sind bewusst konservativ.
   */
  Geo.checkPlausibility = function (m, objectType) {
    var issues = [];
    var widthSkew = Geo.pctDiff(m.topMm, m.bottomMm);
    var heightSkew = Geo.pctDiff(m.leftMm, m.rightMm);
    var diagSkew = Geo.pctDiff(m.diag1Mm, m.diag2Mm);

    if (diagSkew > 3) {
      issues.push({
        level: diagSkew > 8 ? 'error' : 'warn',
        msg: 'Diagonalen weichen um ' + diagSkew.toFixed(1) +
             ' % ab – Aufnahme vermutlich schräg. Handy parallel zur Fensterfläche halten und neu fotografieren.'
      });
    }
    if (widthSkew > 4) {
      issues.push({ level: 'warn', msg: 'Ober- und Unterkante unterschiedlich lang (' + widthSkew.toFixed(1) + ' %) – Verkippung nach oben/unten.' });
    }
    if (heightSkew > 4) {
      issues.push({ level: 'warn', msg: 'Linke und rechte Kante unterschiedlich lang (' + heightSkew.toFixed(1) + ' %) – Verkippung zur Seite.' });
    }

    if (objectType === 'door') {
      var dw = Geo.SIZE_LIMITS.door.widthMm, dh = Geo.SIZE_LIMITS.door.heightMm;
      if (m.widthMm < dw.minMm || m.widthMm > dw.maxMm) {
        issues.push({ level: 'error', msg: 'Breite (' + Math.round(m.widthMm) + ' mm) liegt außerhalb des üblichen Türbereichs (' + dw.minMm + '–' + dw.maxMm + ' mm) – Referenzobjekt korrekt markiert?' });
      }
      if (m.heightMm < dh.minMm || m.heightMm > dh.maxMm) {
        issues.push({ level: 'error', msg: 'Höhe (' + Math.round(m.heightMm) + ' mm) liegt außerhalb des üblichen Türbereichs (' + dh.minMm + '–' + dh.maxMm + ' mm) – Referenzobjekt korrekt markiert?' });
      }
    } else {
      var limits = Geo.SIZE_LIMITS.window;
      var minMm = Math.min(m.widthMm, m.heightMm);
      var maxMm = Math.max(m.widthMm, m.heightMm);
      if (minMm < limits.minMm) {
        issues.push({ level: 'error', msg: 'Maß unter 10 cm – Referenzobjekt korrekt markiert? Wert wirkt unrealistisch klein.' });
      }
      if (maxMm > limits.maxMm) {
        issues.push({ level: 'error', msg: 'Maß über 4 m – Referenzobjekt korrekt markiert? Wert wirkt unrealistisch groß.' });
      }
    }

    // Score: startet bei 100, Abzug je nach Schiefe.
    var penalty = Math.min(60, diagSkew * 4 + widthSkew * 2 + heightSkew * 2);
    var score = Math.max(0, Math.round(100 - penalty));
    if (issues.some(function (i) { return i.level === 'error'; })) score = Math.min(score, 40);

    return {
      issues: issues,
      widthSkew: widthSkew,
      heightSkew: heightSkew,
      diagSkew: diagSkew,
      score: score,
      ok: !issues.some(function (i) { return i.level === 'error'; })
    };
  };

  global.Geo = Geo;
  if (typeof module !== 'undefined' && module.exports) module.exports = Geo;
})(typeof window !== 'undefined' ? window : this);
