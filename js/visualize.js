/*
 * visualize.js — reine SVG-Erzeugung für die Fenster-Visualisierung
 * (Öffnungsart, Bänder-/Griffseite, Sprossen). Keine DOM-Abhängigkeit außer
 * der reinen String-Erzeugung; kann wie geometry.js auch in Node geprüft
 * werden (module.exports am Ende).
 *
 * Zwei Ausgabeformen aus denselben Rohdaten (Visualize.buildLayout):
 *  - renderSchemaSvg: eigenständiges technisches Schema mit Maßlinien/Zahlen
 *    (für den Profi-Ausdruck/PDF-Protokoll).
 *  - renderPhotoOverlaySvg: nur Linien/Punkte ohne Zahlen, zum Überlagern des
 *    Aufmaß-Fotos (auch im Kunden-Modus zeigbar, da keine Messwerte sichtbar
 *    werden).
 */
(function (global) {
  'use strict';

  var Visualize = {};

  Visualize.OPENING_TYPES = {
    fest:        { label: 'Festverglasung' },
    dreh:        { label: 'Dreh' },
    kipp:        { label: 'Kipp' },
    drehkipp:    { label: 'Dreh-Kipp' },
    schiebe:     { label: 'Schiebe' },
    hebeschiebe: { label: 'Hebe-Schiebe' }
  };

  Visualize.DEFAULT_WINDOW_FIELDS = {
    sashCount: 1,
    openingType: 'drehkipp',
    hingeSide: 'links',
    handleSide: 'rechts',
    mullions: { h: 0, v: 0 }
  };

  Visualize.hasWindowSchema = function (m) {
    return !!(m && m.objectType === 'window' && m.windowFields);
  };

  function normalizeFields(wf) {
    var d = Visualize.DEFAULT_WINDOW_FIELDS;
    wf = wf || {};
    var sashCount = [1, 2, 3].indexOf(wf.sashCount) >= 0 ? wf.sashCount : d.sashCount;
    return {
      sashCount: sashCount,
      openingType: Visualize.OPENING_TYPES[wf.openingType] ? wf.openingType : d.openingType,
      hingeSide: wf.hingeSide === 'rechts' ? 'rechts' : 'links',
      handleSide: wf.handleSide === 'links' ? 'links' : 'rechts',
      mullions: {
        h: Math.max(0, parseInt(wf.mullions && wf.mullions.h, 10) || 0),
        v: Math.max(0, parseInt(wf.mullions && wf.mullions.v, 10) || 0)
      }
    };
  }

  /**
   * Baut die reine Linien-/Punkt-Geometrie im Einheitsquadrat [0,1]x[0,1]
   * (x nach rechts, y nach unten — wie Bildkoordinaten). sashCount teilt das
   * Quadrat in gleich breite, nebeneinanderliegende Flügel; bei zwei Flügeln
   * wird die Bänder-/Griffseite des zweiten Flügels automatisch gespiegelt
   * (rein clientseitige Darstellung, kein zusätzliches Datenfeld).
   */
  Visualize.buildLayout = function (windowFields) {
    var wf = normalizeFields(windowFields);
    var n = wf.sashCount;
    var sashRects = [];
    for (var i = 0; i < n; i++) {
      sashRects.push({ x0: i / n, y0: 0, x1: (i + 1) / n, y1: 1 });
    }

    var mullionLines = [];
    sashRects.forEach(function (r) {
      for (var k = 1; k <= wf.mullions.h; k++) {
        var y = r.y0 + (r.y1 - r.y0) * k / (wf.mullions.h + 1);
        mullionLines.push({ x1: r.x0, y1: y, x2: r.x1, y2: y });
      }
      for (var j = 1; j <= wf.mullions.v; j++) {
        var x = r.x0 + (r.x1 - r.x0) * j / (wf.mullions.v + 1);
        mullionLines.push({ x1: x, y1: r.y0, x2: x, y2: r.y1 });
      }
    });

    var symbolLines = [], arrows = [], handleDots = [];
    sashRects.forEach(function (r, i) {
      // Bei zwei Flügeln nebeneinander wird der zweite spiegelbildlich beschlagen.
      var mirror = (n === 2 && i === 1);
      var hinge = mirror ? (wf.hingeSide === 'links' ? 'rechts' : 'links') : wf.hingeSide;
      var handle = mirror ? (wf.handleSide === 'links' ? 'rechts' : 'links') : wf.handleSide;

      var midX = (r.x0 + r.x1) / 2, midY = (r.y0 + r.y1) / 2;

      if (wf.openingType === 'schiebe' || wf.openingType === 'hebeschiebe') {
        var pad = (r.x1 - r.x0) * 0.15;
        arrows.push({ x1: r.x0 + pad, y1: midY, x2: r.x1 - pad, y2: midY });
      } else if (wf.openingType !== 'fest') {
        var hingeIsLeft = hinge === 'links';
        var hingeMid = { x: hingeIsLeft ? r.x0 : r.x1, y: midY };
        var oppTop = { x: hingeIsLeft ? r.x1 : r.x0, y: r.y0 };
        var oppBottom = { x: hingeIsLeft ? r.x1 : r.x0, y: r.y1 };

        if (wf.openingType === 'dreh' || wf.openingType === 'drehkipp') {
          symbolLines.push({ x1: oppTop.x, y1: oppTop.y, x2: hingeMid.x, y2: hingeMid.y });
          symbolLines.push({ x1: oppBottom.x, y1: oppBottom.y, x2: hingeMid.x, y2: hingeMid.y });
        }
        if (wf.openingType === 'kipp' || wf.openingType === 'drehkipp') {
          var bottomMid = { x: midX, y: r.y1 };
          symbolLines.push({ x1: r.x0, y1: r.y0, x2: bottomMid.x, y2: bottomMid.y });
          symbolLines.push({ x1: r.x1, y1: r.y0, x2: bottomMid.x, y2: bottomMid.y });
        }
      }

      var hx = handle === 'links' ? r.x0 + (r.x1 - r.x0) * 0.08 : r.x1 - (r.x1 - r.x0) * 0.08;
      handleDots.push({ x: hx, y: midY });
    });

    return { sashRects: sashRects, mullionLines: mullionLines, symbolLines: symbolLines, handleDots: handleDots, arrows: arrows, fields: wf };
  };

  /** Bildet einen Punkt des Einheitsquadrats bilinear auf ein Viereck ab (Perspektiv-Näherung). quad = [TL, TR, BR, BL]. */
  Visualize.quadPoint = function (u, v, quad) {
    var TL = quad[0], TR = quad[1], BR = quad[2], BL = quad[3];
    var a = (1 - u) * (1 - v), b = u * (1 - v), c = u * v, d = (1 - u) * v;
    return {
      x: a * TL.x + b * TR.x + c * BR.x + d * BL.x,
      y: a * TL.y + b * TR.y + c * BR.y + d * BL.y
    };
  };

  function svgLine(x1, y1, x2, y2, stroke, width, dash) {
    return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"' +
      ' stroke="' + stroke + '" stroke-width="' + width + '" stroke-linecap="round"' +
      (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
  }
  function svgRect(x, y, w, h, stroke, width) {
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '"' +
      ' fill="none" stroke="' + stroke + '" stroke-width="' + width + '"/>';
  }
  function svgDot(x, y, r, fill) {
    return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '" fill="' + fill + '"/>';
  }
  function svgArrowLine(x1, y1, x2, y2, stroke, width) {
    var out = svgLine(x1, y1, x2, y2, stroke, width);
    var ah = 6;
    out += svgLine(x1, y1, x1 + ah, y1 - ah / 2, stroke, width);
    out += svgLine(x1, y1, x1 + ah, y1 + ah / 2, stroke, width);
    out += svgLine(x2, y2, x2 - ah, y2 - ah / 2, stroke, width);
    out += svgLine(x2, y2, x2 - ah, y2 + ah / 2, stroke, width);
    return out;
  }

  /**
   * Eigenständiges technisches Schema (Draufsicht der Fensteransicht von innen)
   * mit Maßlinien und Zahlen, für den Profi-Ausdruck. widthMm/heightMm sind die
   * bereits final anzuzeigenden Maße (inkl. evtl. manueller Korrektur).
   */
  Visualize.renderSchemaSvg = function (widthMm, heightMm, windowFields, opts) {
    opts = opts || {};
    var stroke = opts.stroke || '#5b2d8e';
    var dim = opts.dimStroke || '#6c6480';
    var boxW = 260;
    var ratio = (widthMm > 0 && heightMm > 0) ? heightMm / widthMm : 0.75;
    ratio = Math.max(0.28, Math.min(3, ratio));
    var boxH = Math.round(boxW * ratio);
    var mLeft = 46, mTop = 30, mRight = 14, mBottom = 14;
    var w = mLeft + boxW + mRight, h = mTop + boxH + mBottom;

    var layout = Visualize.buildLayout(windowFields);
    function px(u, v) { return { x: mLeft + u * boxW, y: mTop + v * boxH }; }

    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width:340px">';

    // Rahmen
    svg += svgRect(mLeft, mTop, boxW, boxH, stroke, 2.5);
    // Flügeltrennungen
    layout.sashRects.forEach(function (r, i) {
      if (i > 0) {
        var p1 = px(r.x0, 0), p2 = px(r.x0, 1);
        svg += svgLine(p1.x, p1.y, p2.x, p2.y, stroke, 2);
      }
    });
    // Sprossen
    layout.mullionLines.forEach(function (l) {
      var p1 = px(l.x1, l.y1), p2 = px(l.x2, l.y2);
      svg += svgLine(p1.x, p1.y, p2.x, p2.y, stroke, 1.3);
    });
    // Öffnungssymbole
    layout.symbolLines.forEach(function (l) {
      var p1 = px(l.x1, l.y1), p2 = px(l.x2, l.y2);
      svg += svgLine(p1.x, p1.y, p2.x, p2.y, stroke, 1.3, '4,3');
    });
    layout.arrows.forEach(function (l) {
      var p1 = px(l.x1, l.y1), p2 = px(l.x2, l.y2);
      svg += svgArrowLine(p1.x, p1.y, p2.x, p2.y, stroke, 1.3);
    });
    // Griff
    layout.handleDots.forEach(function (d) {
      var p = px(d.x, d.y);
      svg += svgDot(p.x, p.y, 4, stroke);
    });

    // Maßlinie oben (Breite)
    var dy = mTop - 14;
    svg += svgArrowLine(mLeft, dy, mLeft + boxW, dy, dim, 1.2);
    svg += '<text x="' + (mLeft + boxW / 2) + '" y="' + (dy - 5) + '" text-anchor="middle" font-size="10" fill="' + dim + '">' + Math.round(widthMm) + ' mm</text>';
    // Maßlinie links (Höhe)
    var dx = mLeft - 30;
    svg += '<g transform="rotate(-90 ' + dx + ' ' + (mTop + boxH / 2) + ')">' +
      svgArrowLine(dx, mTop + boxH, dx, mTop, dim, 1.2) +
      '</g>';
    svg += '<text x="' + dx + '" y="' + (mTop + boxH / 2) + '" text-anchor="middle" font-size="10" fill="' + dim + '" ' +
      'transform="rotate(-90 ' + dx + ' ' + (mTop + boxH / 2) + ')" dy="-5">' + Math.round(heightMm) + ' mm</text>';

    svg += '</svg>';
    return svg;
  };

  /**
   * Overlay-SVG in Bildpixel-Koordinatenraum (viewBox = imgW x imgH), OHNE
   * Zahlen/Text — nur Linien/Punkte, damit es auch im Kunden-Modus gezeigt
   * werden darf (keine Messwerte sichtbar). orderedCorners = [TL,TR,BR,BL],
   * wie von Geo.measure(...).orderedCorners geliefert.
   */
  Visualize.renderPhotoOverlaySvg = function (imgW, imgH, orderedCorners, windowFields, opts) {
    if (!imgW || !imgH || !orderedCorners || orderedCorners.length !== 4) return '';
    opts = opts || {};
    var stroke = opts.stroke || '#a472f0';
    var quad = orderedCorners;
    var avgSide = (
      Geo_dist(quad[0], quad[1]) + Geo_dist(quad[1], quad[2]) +
      Geo_dist(quad[2], quad[3]) + Geo_dist(quad[3], quad[0])
    ) / 4;
    var lw = Math.max(2, avgSide * 0.012);

    var layout = Visualize.buildLayout(windowFields);
    function px(u, v) { return Visualize.quadPoint(u, v, quad); }

    var svg = '<svg viewBox="0 0 ' + imgW + ' ' + imgH + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">';

    layout.sashRects.forEach(function (r, i) {
      if (i > 0) {
        var p1 = px(r.x0, 0), p2 = px(r.x0, 1);
        svg += svgLine(p1.x, p1.y, p2.x, p2.y, stroke, lw);
      }
    });
    layout.mullionLines.forEach(function (l) {
      var p1 = px(l.x1, l.y1), p2 = px(l.x2, l.y2);
      svg += svgLine(p1.x, p1.y, p2.x, p2.y, stroke, lw * 0.7);
    });
    layout.symbolLines.forEach(function (l) {
      var p1 = px(l.x1, l.y1), p2 = px(l.x2, l.y2);
      svg += svgLine(p1.x, p1.y, p2.x, p2.y, stroke, lw * 0.7, (lw * 2.5) + ',' + (lw * 1.8));
    });
    layout.arrows.forEach(function (l) {
      var p1 = px(l.x1, l.y1), p2 = px(l.x2, l.y2);
      svg += svgArrowLine(p1.x, p1.y, p2.x, p2.y, stroke, lw * 0.7);
    });
    layout.handleDots.forEach(function (d) {
      var p = px(d.x, d.y);
      svg += svgDot(p.x, p.y, lw * 1.8, stroke);
    });

    svg += '</svg>';
    return svg;
  };

  // Kleine lokale Distanzfunktion, damit visualize.js unabhängig von der
  // Ladereihenfolge/Existenz von Geo funktioniert (gleiche Formel wie Geo.dist).
  function Geo_dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  global.Visualize = Visualize;
  if (typeof module !== 'undefined' && module.exports) module.exports = Visualize;
})(typeof window !== 'undefined' ? window : this);
