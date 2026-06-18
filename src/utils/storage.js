/**
 * Storage — localStorage persistence for recent files, theme, bookmarks
 * IndexedDB for large file data (>500KB)
 */
window.App = window.App || {};
window.App.storage = (() => {
  const PREFIX = 'jpe_';
  const MAX_RECENT = 50;
  const MAX_DATA_SIZE = 500000; // 500KB max per localStorage entry

  // --- IndexedDB for large files ---
  const DB_NAME = 'jpe_store';
  const DB_VERSION = 1;
  const STORE_NAME = 'large_files';
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function idbPut(key, value) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  function idbGet(key) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function idbDelete(key) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  function idbClear() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  // Build a unique key for IDB storage
  function recentKey(name, size) { return `${name}__${size}`; }

  // --- localStorage helpers ---
  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); }
    catch { /* quota exceeded — silently fail */ }
  }

  function remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch {}
  }

  // --- Theme ---
  function getTheme() { return get('theme', 'light'); }
  function setTheme(theme) { set('theme', theme); }

  // --- Bookmarks ---
  function getBookmarks() { return get('bookmarks', []); }
  function setBookmarks(arr) { set('bookmarks', arr); }

  // --- Recent Files ---
  function getRecent() { return get('recent', []); }

  function addRecent(name, data) {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const entry = {
      name: name || 'Untitled',
      timestamp: Date.now(),
      size: text.length,
      preview: text.substring(0, 120).replace(/\s+/g, ' '),
      data: text.length <= MAX_DATA_SIZE ? text : null
    };
    let list = getRecent().filter(r => r.name !== entry.name || r.size !== entry.size);
    list.unshift(entry);
    if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
    set('recent', list);

    // Store large files in IndexedDB
    if (text.length > MAX_DATA_SIZE) {
      idbPut(recentKey(entry.name, entry.size), text).catch(() => {});
    }
  }

  /** Load data for a recent entry. Returns promise resolving to text string or null. */
  function loadRecentData(entry) {
    if (entry.data) return Promise.resolve(entry.data);
    return idbGet(recentKey(entry.name, entry.size)).then(val => val || null);
  }

  function updateRecentName(oldName, newName) {
    const list = getRecent();
    const entry = list.find(r => r.name === oldName);
    if (!entry) return;
    const oldKey = recentKey(oldName, entry.size);
    entry.name = newName;
    set('recent', list);
    // Update IDB key if stored there
    if (!entry.data) {
      const newKey = recentKey(newName, entry.size);
      idbGet(oldKey).then(val => {
        if (val == null) return;
        return idbPut(newKey, val).then(() => idbDelete(oldKey));
      }).catch(() => {});
    }
  }

  function clearRecent() {
    set('recent', []);
    idbClear().catch(() => {});
  }

  // Delegate to shared format utils
  const formatTime = (ts) => window.App.format.formatTime(ts);
  const formatSize = (bytes) => window.App.format.formatSize(bytes);

  return { get, set, remove, getTheme, setTheme, getBookmarks, setBookmarks, getRecent, addRecent, updateRecentName, loadRecentData, clearRecent, formatTime, formatSize };
})();
