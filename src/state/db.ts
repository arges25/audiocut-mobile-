import type { Clip, PersistedProject, PersistedSource } from '../types';

const DB_NAME = 'audiocut-db';
const DB_VERSION = 1;
const PROJECT_KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sources')) db.createObjectStore('sources', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('project')) db.createObjectStore('project');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(data: { clips: Clip[]; activeTrackId: number; magnetEnabled: boolean }): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('project', 'readwrite');
    const record: PersistedProject = { ...data, savedAt: Date.now() };
    tx.objectStore('project').put(record, PROJECT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadProject(): Promise<PersistedProject | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('project', 'readonly');
    const req = tx.objectStore('project').get(PROJECT_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSource(source: PersistedSource): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sources', 'readwrite');
    tx.objectStore('sources').put(source);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAllSources(): Promise<PersistedSource[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sources', 'readonly');
    const req = tx.objectStore('sources').getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearProject(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['project', 'sources'], 'readwrite');
    tx.objectStore('project').clear();
    tx.objectStore('sources').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
