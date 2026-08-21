/*
 * store.js — zentrale Datenhaltung mit admin-geschütztem Zugriff.
 *
 * MVP: persistiert lokal in localStorage (Stand-in für das im Konzept
 * beschriebene Backend/Plattform). Die gesamte Lese-/Schreib-API ist hier
 * gekapselt — für echte zentrale Datenhaltung müsste nur dieses Modul gegen
 * REST/Firebase/Supabase o. Ä. ausgetauscht werden, die übrige App bleibt gleich.
 *
 * Zugriffsmodell (laut Konzept):
 *  - Kunden-Modus darf SCHREIBEN (Aufmaß einreichen), aber NICHT lesen.
 *  - Nur das Admin-Konto (Profi-Modus, PIN-geschützt) darf Daten einsehen/exportieren.
 */
(function (global) {
  'use strict';

  var DB_KEY = 'aufmass_db_v1';
  var SESSION_KEY = 'aufmass_admin_session';
  var DEFAULT_PIN = '1234';

  /** Schwacher Hash – NUR Demo. In Produktion: serverseitige Auth + bcrypt o. Ä. */
  function weakHash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(16);
  }

  function uid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  var Store = {};

  Store.load = function () {
    var raw;
    try { raw = localStorage.getItem(DB_KEY); } catch (e) { raw = null; }
    if (!raw) {
      var fresh = {
        version: 1,
        adminPinHash: weakHash(DEFAULT_PIN),
        company: { name: 'Mustermann Fensterbau', contact: '' },
        projects: [],
        inbox: [] // Einreichungen aus dem Kunden-Modus, noch keinem Projekt zugeordnet
      };
      Store._db = fresh;
      Store._persist();
      return fresh;
    }
    try {
      Store._db = JSON.parse(raw);
    } catch (e) {
      Store._db = { version: 1, adminPinHash: weakHash(DEFAULT_PIN), company: {}, projects: [], inbox: [] };
    }
    migrateObjectType(Store._db);
    return Store._db;
  };

  /** Bestandsmessungen ohne objectType stammen alle aus der Fenster-only-Zeit. */
  function migrateObjectType(db) {
    var changed = false;
    function fill(list) {
      (list || []).forEach(function (m) {
        if (!m.objectType) { m.objectType = 'window'; changed = true; }
      });
    }
    (db.projects || []).forEach(function (p) { fill(p.measurements); });
    fill(db.inbox);
    if (changed) {
      Store._db = db;
      Store._persist();
    }
  }

  Store._persist = function () {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(Store._db));
      return true;
    } catch (e) {
      // Wahrscheinlich Speicher-Limit (Bilder). Für MVP: melden.
      console.error('Speichern fehlgeschlagen (evtl. Speicherlimit erreicht):', e);
      return false;
    }
  };

  Store.db = function () {
    if (!Store._db) Store.load();
    return Store._db;
  };

  /* ---------- Admin-Authentifizierung ---------- */

  Store.verifyPin = function (pin) {
    return weakHash(String(pin)) === Store.db().adminPinHash;
  };

  Store.login = function (pin) {
    if (Store.verifyPin(pin)) {
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
      return true;
    }
    return false;
  };

  Store.logout = function () {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  };

  Store.isAdmin = function () {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  };

  Store.changePin = function (newPin) {
    Store.db().adminPinHash = weakHash(String(newPin));
    return Store._persist();
  };

  Store.isDefaultPin = function () {
    return Store.db().adminPinHash === weakHash(DEFAULT_PIN);
  };

  /* ---------- Firmenstammdaten ---------- */

  Store.getCompany = function () { return Store.db().company || {}; };
  Store.setCompany = function (company) {
    Store.db().company = Object.assign({}, Store.db().company, company);
    return Store._persist();
  };

  /* ---------- Projekte / Kunden (nur Admin) ---------- */

  Store.listProjects = function () { return Store.db().projects.slice(); };

  Store.getProject = function (id) {
    return Store.db().projects.filter(function (p) { return p.id === id; })[0] || null;
  };

  Store.addProject = function (data) {
    var p = {
      id: uid(),
      name: data.name || 'Projekt',
      customer: data.customer || { name: '', address: '', phone: '', email: '' },
      note: data.note || '',
      createdAt: new Date().toISOString(),
      measurements: []
    };
    Store.db().projects.unshift(p);
    Store._persist();
    return p;
  };

  Store.updateProject = function (id, data) {
    var p = Store.getProject(id);
    if (!p) return null;
    Object.assign(p, data);
    Store._persist();
    return p;
  };

  Store.deleteProject = function (id) {
    var db = Store.db();
    db.projects = db.projects.filter(function (p) { return p.id !== id; });
    Store._persist();
  };

  /* ---------- Aufmaße ---------- */

  /**
   * Hängt ein Aufmaß an. projectId === null => landet im zentralen Eingang
   * (Inbox) – so reicht der Kunden-Modus Daten ein, ohne lesen zu können.
   */
  Store.addMeasurement = function (projectId, measurement) {
    var m = Object.assign({ id: uid(), createdAt: new Date().toISOString() }, measurement);
    if (projectId) {
      var p = Store.getProject(projectId);
      if (!p) return null;
      p.measurements.unshift(m);
    } else {
      Store.db().inbox.unshift(m);
    }
    Store._persist();
    return m;
  };

  Store.updateMeasurement = function (projectId, measurementId, data) {
    var list = projectId ? (Store.getProject(projectId) || {}).measurements : Store.db().inbox;
    if (!list) return null;
    var m = list.filter(function (x) { return x.id === measurementId; })[0];
    if (!m) return null;
    Object.assign(m, data);
    Store._persist();
    return m;
  };

  Store.deleteMeasurement = function (projectId, measurementId) {
    if (projectId) {
      var p = Store.getProject(projectId);
      if (p) p.measurements = p.measurements.filter(function (x) { return x.id !== measurementId; });
    } else {
      Store.db().inbox = Store.db().inbox.filter(function (x) { return x.id !== measurementId; });
    }
    Store._persist();
  };

  Store.getInbox = function () { return Store.db().inbox.slice(); };

  /** Verschiebt eine Inbox-Einreichung in ein Projekt. */
  Store.assignInboxToProject = function (measurementId, projectId) {
    var db = Store.db();
    var m = db.inbox.filter(function (x) { return x.id === measurementId; })[0];
    var p = Store.getProject(projectId);
    if (!m || !p) return null;
    db.inbox = db.inbox.filter(function (x) { return x.id !== measurementId; });
    p.measurements.unshift(m);
    Store._persist();
    return m;
  };

  /** Alle Aufmaße flach (für Gesamt-Export). */
  Store.allMeasurements = function () {
    var rows = [];
    Store.db().projects.forEach(function (p) {
      p.measurements.forEach(function (m) {
        rows.push({ project: p, measurement: m });
      });
    });
    Store.db().inbox.forEach(function (m) {
      rows.push({ project: null, measurement: m });
    });
    return rows;
  };

  Store.resetAll = function () {
    try { localStorage.removeItem(DB_KEY); } catch (e) {}
    Store._db = null;
    Store.load();
  };

  global.Store = Store;
})(window);
