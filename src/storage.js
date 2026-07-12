/*
 * G7sim - tiny IndexedDB key/value store used to remember the BIOS and the
 * last dropped game archive between sessions (so the user only drops once).
 */
(function (global) {
  'use strict';
  var DB = 'g7sim', STORE = 'kv', VER = 1;
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('no indexedDB')); return; }
      var r = global.indexedDB.open(DB, VER);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
    return dbp;
  }

  function idbSet(key, value) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { /* storage optional */ });
  }

  function idbGet(key) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var rq = tx.objectStore(STORE).get(key);
        rq.onsuccess = function () { resolve(rq.result || null); };
        rq.onerror = function () { reject(rq.error); };
      });
    }).catch(function () { return null; });
  }

  global.G7Store = { get: idbGet, set: idbSet };
})(typeof window !== 'undefined' ? window : this);
