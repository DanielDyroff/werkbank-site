/*
 * export.js — Export von Aufmaßdaten als CSV und als druckbares
 * Aufmaßprotokoll (über die Druckfunktion des Browsers -> "Als PDF sichern").
 * Bewusst ohne externe Bibliothek, damit die App offline funktioniert.
 */
(function (global) {
  'use strict';

  var Exporter = {};

  function mm(v) { return (v == null || isNaN(v)) ? '' : Math.round(v) + ''; }
  function esc(s) { return String(s == null ? '' : s); }

  /** Effektives Maß: manuelle Korrektur hat Vorrang vor berechnetem Wert. */
  function effWidth(m) { return (m.manualOverride && m.manualOverride.widthMm) || m.result.widthMm; }
  function effHeight(m) { return (m.manualOverride && m.manualOverride.heightMm) || m.result.heightMm; }

  Exporter.effWidth = effWidth;
  Exporter.effHeight = effHeight;

  /* ---------------- CSV ---------------- */

  function csvCell(v) {
    var s = esc(v);
    if (/[";\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  Exporter.toCsv = function (rows) {
    var header = ['Projekt', 'Kunde', 'Typ', 'Bezeichnung', 'Raum', 'Position',
      'Breite_mm', 'Hoehe_mm', 'Diagonale1_mm', 'Diagonale2_mm',
      'Korrigiert', 'Quelle', 'Erstellt', 'Notiz'];
    var lines = [header.map(csvCell).join(';')];
    rows.forEach(function (r) {
      var p = r.project, m = r.measurement;
      lines.push([
        p ? p.name : 'Eingang (Kunde)',
        p && p.customer ? p.customer.name : '',
        m.objectType === 'door' ? 'Tür' : 'Fenster',
        m.label || '',
        m.room || '',
        m.position || '',
        mm(effWidth(m)),
        mm(effHeight(m)),
        mm(m.result.diag1Mm),
        mm(m.result.diag2Mm),
        m.manualOverride ? 'ja' : 'nein',
        m.source === 'kunde' ? 'Kunde' : 'Profi',
        m.createdAt ? new Date(m.createdAt).toLocaleString('de-DE') : '',
        m.note || ''
      ].map(csvCell).join(';'));
    });
    return '﻿' + lines.join('\r\n'); // BOM für Excel-Umlaute
  };

  Exporter.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/csv') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  /* ---------------- PDF-Protokoll (über Druck) ---------------- */

  Exporter.printProtocol = function (project, measurements, company) {
    var rows = measurements.map(function (m) {
      var check = (global.Geo && global.Geo.checkPlausibility) ? Geo.checkPlausibility(m.result, m.objectType) : { issues: [], score: '' };
      var notes = check.issues.map(function (i) { return '• ' + i.msg; }).join('<br>') || '–';
      var img = m.imageDataUrl
        ? '<img class="foto" src="' + m.imageDataUrl + '" alt="Aufmaßfoto">'
        : '<div class="foto kein">kein Foto</div>';
      var typeLabel = m.objectType === 'door' ? 'Tür' : 'Fenster';
      var df = m.doorFields;
      var doorRows = (m.objectType === 'door' && df) ?
        '<tr><th>Anschlag</th><td>' + esc(df.hinge || '–') + '</td></tr>' +
        '<tr><th>DIN-Richtung</th><td>' + esc(df.dinDirection || '–') + '</td></tr>' +
        '<tr><th>Schwelle</th><td>' + (df.threshold ? 'ja' : 'nein') + '</td></tr>' +
        '<tr><th>Zargentiefe</th><td>' + (df.frameDepthMm != null ? mm(df.frameDepthMm) + ' mm' : '–') + '</td></tr>'
        : '';
      return (
        '<section class="messung">' +
          '<div class="kopf"><h3>' + esc(m.label || 'Aufmaß') + ' <span class="typ">' + typeLabel + '</span></h3>' +
            '<span class="meta">' + esc(m.room || '') + (m.position ? ' · ' + esc(m.position) : '') + '</span></div>' +
          '<div class="grid">' +
            img +
            '<table class="masse">' +
              '<tr><th>Breite</th><td>' + mm(effWidth(m)) + ' mm</td></tr>' +
              '<tr><th>Höhe</th><td>' + mm(effHeight(m)) + ' mm</td></tr>' +
              '<tr><th>Diagonale 1</th><td>' + mm(m.result.diag1Mm) + ' mm</td></tr>' +
              '<tr><th>Diagonale 2</th><td>' + mm(m.result.diag2Mm) + ' mm</td></tr>' +
              '<tr><th>Referenz</th><td>' + esc(m.referenceLabel || 'DIN A4 (Blatt, 4 Ecken)') + '</td></tr>' +
              '<tr><th>Qualität</th><td>' + esc(check.score) + ' / 100' + (m.manualOverride ? ' · manuell korrigiert' : '') + '</td></tr>' +
              doorRows +
            '</table>' +
          '</div>' +
          '<p class="hinweise"><strong>Hinweise:</strong><br>' + notes + '</p>' +
        '</section>'
      );
    }).join('');

    var c = company || {};
    var p = project || { name: 'Eingang', customer: {} };
    var cust = p.customer || {};
    var html =
      '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
      '<title>Aufmaßprotokoll – ' + esc(p.name) + '</title>' +
      '<style>' +
      '@page{margin:16mm;}' +
      'body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#261b33;font-size:12px;line-height:1.45;}' +
      'h1{font-size:20px;margin:0 0 2px;}h3{margin:0;font-size:14px;}' +
      '.firma{color:#5b2d8e;font-weight:700;letter-spacing:.3px;}' +
      '.head{display:flex;justify-content:space-between;border-bottom:3px solid #5b2d8e;padding-bottom:8px;margin-bottom:12px;}' +
      '.head .r{text-align:right;color:#475569;font-size:11px;}' +
      '.kunde{background:#f1f5f9;border-radius:8px;padding:10px 12px;margin-bottom:14px;}' +
      '.kunde b{display:inline-block;min-width:70px;color:#475569;}' +
      '.messung{border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:12px;page-break-inside:avoid;}' +
      '.kopf{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;}' +
      '.kopf .meta{color:#64748b;font-size:11px;}' +
      '.kopf .typ{font-size:10px;font-weight:600;color:#5b2d8e;background:#efe7fb;border-radius:999px;padding:1px 8px;margin-left:6px;vertical-align:middle;}' +
      '.grid{display:flex;gap:12px;align-items:flex-start;}' +
      '.foto{width:200px;max-height:200px;object-fit:contain;border-radius:8px;border:1px solid #e2e8f0;}' +
      '.foto.kein{display:flex;align-items:center;justify-content:center;height:140px;color:#94a3b8;}' +
      'table.masse{border-collapse:collapse;flex:1;}' +
      'table.masse th{text-align:left;color:#475569;font-weight:600;padding:3px 10px 3px 0;white-space:nowrap;}' +
      'table.masse td{font-weight:700;padding:3px 0;}' +
      'table.masse tr{border-bottom:1px solid #f1f5f9;}' +
      '.hinweise{font-size:11px;color:#475569;margin:10px 0 0;}' +
      '.foot{margin-top:24px;display:flex;justify-content:space-between;font-size:11px;color:#475569;}' +
      '.sig{border-top:1px solid #94a3b8;width:200px;text-align:center;padding-top:4px;}' +
      '.disclaimer{margin-top:14px;font-size:10px;color:#94a3b8;}' +
      '</style></head><body>' +
      '<div class="head"><div><div class="firma">' + esc(c.name || 'Handwerksbetrieb') + '</div>' +
        '<h1>Aufmaßprotokoll</h1></div>' +
        '<div class="r">' + esc(c.contact || '') + '<br>Erstellt: ' + new Date().toLocaleString('de-DE') + '</div></div>' +
      '<div class="kunde">' +
        '<div><b>Projekt:</b> ' + esc(p.name) + '</div>' +
        '<div><b>Kunde:</b> ' + esc(cust.name || '') + '</div>' +
        (cust.address ? '<div><b>Adresse:</b> ' + esc(cust.address) + '</div>' : '') +
        (cust.phone ? '<div><b>Telefon:</b> ' + esc(cust.phone) + '</div>' : '') +
        '<div><b>Aufmaße:</b> ' + measurements.length + '</div>' +
      '</div>' +
      rows +
      '<div class="foot"><div class="sig">Datum, Unterschrift Aufmaß</div>' +
        '<div class="sig">Datum, Unterschrift Kunde</div></div>' +
      '<p class="disclaimer">Hinweis: Foto-basiertes Aufmaß mit Referenzobjekt – geeignet für Kostenschätzung. ' +
        'Für die finale Fertigung wird ein abgesichertes Aufmaß (z. B. AR-/LiDAR-Tiefenmessung oder vor Ort) empfohlen.</p>' +
      '<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>' +
      '</body></html>';

    var w = global.open('', '_blank');
    if (!w) { alert('Bitte Pop-ups erlauben, um das Protokoll zu drucken.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  global.Exporter = Exporter;
})(window);
