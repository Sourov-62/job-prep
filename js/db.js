/* db.js — IndexedDB এর ওপর একটা ছোট promise-based wrapper।
   কোনো নেটওয়ার্ক লাগে না, পুরোপুরি ব্রাউজারের লোকাল স্টোরেজ ব্যবহার করে,
   তাই অ্যাপটা সম্পূর্ণ অফলাইনে কাজ করে এবং সব ডেটা এই ডিভাইসেই থাকে। */

const DB_NAME = "jobprep_tracker_db";
const DB_VERSION = 4;

const STORES = {
  sectors: "sectors",
  resources: "resources",
  jobs: "jobs",
  routine: "routine",
  focusLogs: "focusLogs",
  settings: "settings",
  folders: "folders",
  stickyNotes: "stickyNotes",
  studyLog: "studyLog",
  customDict: "customDict",
  subjects: "subjects",
  topics: "topics",
  namaj: "namaj",
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(STORES.sectors)) {
        const s = db.createObjectStore(STORES.sectors, { keyPath: "id" });
        s.createIndex("order", "order");
      }
      if (!db.objectStoreNames.contains(STORES.resources)) {
        const s = db.createObjectStore(STORES.resources, { keyPath: "id" });
        s.createIndex("sectorId", "sectorId");
        s.createIndex("type", "type");
      }
      if (!db.objectStoreNames.contains(STORES.jobs)) {
        const s = db.createObjectStore(STORES.jobs, { keyPath: "id" });
        s.createIndex("sectorId", "sectorId");
        s.createIndex("examDate", "examDate");
      }
      if (!db.objectStoreNames.contains(STORES.routine)) {
        const s = db.createObjectStore(STORES.routine, { keyPath: "id" });
        s.createIndex("sectorId", "sectorId");
        s.createIndex("date", "date");
      }
      if (!db.objectStoreNames.contains(STORES.focusLogs)) {
        const s = db.createObjectStore(STORES.focusLogs, { keyPath: "id" });
        s.createIndex("sectorId", "sectorId");
        s.createIndex("date", "date");
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.folders)) {
        const s = db.createObjectStore(STORES.folders, { keyPath: "id" });
        s.createIndex("sectorId", "sectorId");
        s.createIndex("parentId", "parentId");
      }
      if (!db.objectStoreNames.contains(STORES.stickyNotes)) {
        const s = db.createObjectStore(STORES.stickyNotes, { keyPath: "id" });
        s.createIndex("sectorId", "sectorId");
      }
      if (!db.objectStoreNames.contains(STORES.studyLog)) {
        const s = db.createObjectStore(STORES.studyLog, { keyPath: "id" });
        s.createIndex("sectorId", "sectorId");
        s.createIndex("date", "date");
      }
      if (!db.objectStoreNames.contains(STORES.customDict)) {
        const s = db.createObjectStore(STORES.customDict, { keyPath: "id" });
        s.createIndex("word", "word");
      }
      if (!db.objectStoreNames.contains(STORES.subjects)) {
        const s = db.createObjectStore(STORES.subjects, { keyPath: "id" });
        s.createIndex("sectorId", "sectorId");
      }
      if (!db.objectStoreNames.contains(STORES.topics)) {
        const s = db.createObjectStore(STORES.topics, { keyPath: "id" });
        s.createIndex("sectorId", "sectorId");
        s.createIndex("subjectId", "subjectId");
      }
      if (!db.objectStoreNames.contains(STORES.namaj)) {
        const s = db.createObjectStore(STORES.namaj, { keyPath: "id" });
        s.createIndex("date", "date", { unique: true });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

const DB = {
  async put(storeName, value) {
    const store = await tx(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const r = store.put(value);
      r.onsuccess = () => resolve(value);
      r.onerror = () => reject(r.error);
    });
  },

  async get(storeName, id) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const r = store.get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  },

  async delete(storeName, id) {
    const store = await tx(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const r = store.delete(id);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  },

  async all(storeName) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  },

  async byIndex(storeName, indexName, value) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const idx = store.index(indexName);
      const r = idx.getAll(value);
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  },

  async clearAll() {
    const db = await openDB();
    const names = Object.values(STORES);
    return Promise.all(
      names.map(
        (n) =>
          new Promise((resolve, reject) => {
            const r = db.transaction(n, "readwrite").objectStore(n).clear();
            r.onsuccess = () => resolve();
            r.onerror = () => reject(r.error);
          })
      )
    );
  },

  async exportAll() {
    const dump = {};
    for (const key of Object.keys(STORES)) {
      dump[key] = await DB.all(STORES[key]);
    }
    dump.__exportedAt = new Date().toISOString();
    dump.__version = DB_VERSION;
    return dump;
  },

  async importAll(dump) {
    for (const key of Object.keys(STORES)) {
      if (!Array.isArray(dump[key])) continue;
      for (const item of dump[key]) {
        await DB.put(STORES[key], item);
      }
    }
  },

  STORES,
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

window.DB = DB;
window.uid = uid;
