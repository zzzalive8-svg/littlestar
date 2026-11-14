/* 本地小仓库：IndexedDB 优先，失败退 localStorage，再失败只存内存。
   file:// 下 localStorage 不一定可用，所以所有读写都兜底、绝不抛错。 */
window.Store = (function () {
  "use strict";

  var PREFIX = "love-album:";
  var mem = Object.create(null);
  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var settled = false;
      function fail(err) {
        if (settled) return;
        settled = true;
        reject(err);
      }
      var timer = setTimeout(function () {
        fail(new Error("indexedDB timeout"));
      }, 900);
      try {
        if (!("indexedDB" in window) || !window.indexedDB) {
          clearTimeout(timer);
          return fail(new Error("indexedDB unavailable"));
        }
        var req = window.indexedDB.open("love-album", 1);
        req.onupgradeneeded = function () {
          try {
            var db = req.result;
            if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
          } catch (e) {}
        };
        req.onsuccess = function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(req.result);
        };
        req.onerror = function () {
          clearTimeout(timer);
          fail(req.error || new Error("indexedDB error"));
        };
        req.onblocked = function () {
          clearTimeout(timer);
          fail(new Error("indexedDB blocked"));
        };
      } catch (e) {
        clearTimeout(timer);
        fail(e);
      }
    });
    return dbPromise;
  }

  function idbRequest(mode, work) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req;
        try {
          var store = db.transaction("kv", mode).objectStore("kv");
          req = work(store);
        } catch (e) {
          return reject(e);
        }
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error || new Error("indexedDB request error"));
        };
      });
    });
  }

  function readLocal(key) {
    try {
      var raw = window.localStorage.getItem(PREFIX + key);
      return raw === null ? undefined : JSON.parse(raw);
    } catch (e) {
      return undefined;
    }
  }

  function writeLocal(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {}
  }

  function dropLocal(key) {
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch (e) {}
  }

  function getSync(key) {
    if (Object.prototype.hasOwnProperty.call(mem, key)) return mem[key];
    var local = readLocal(key);
    return local === undefined ? null : local;
  }

  function get(key) {
    return idbRequest("readonly", function (store) {
      return store.get(key);
    })
      .then(function (value) {
        if (value !== undefined) {
          mem[key] = value;
          return value;
        }
        throw new Error("miss");
      })
      .catch(function () {
        var local = readLocal(key);
        if (local !== undefined) {
          mem[key] = local;
          return local;
        }
        return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
      });
  }

  function set(key, value) {
    mem[key] = value;
    writeLocal(key, value);
    return idbRequest("readwrite", function (store) {
      return store.put(value, key);
    })
      .then(function () {
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function del(key) {
    delete mem[key];
    dropLocal(key);
    return idbRequest("readwrite", function (store) {
      return store.delete(key);
    })
      .then(function () {
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  return {
    get: get,
    getSync: getSync,
    set: set,
    del: del,
  };
})();
