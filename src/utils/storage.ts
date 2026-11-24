import {
  DatasetMeta,
  LumiplanBulletin,
  SkiinfoResortRow,
  SkiRadarFeedCache,
  SnowBackupSnapshot,
  SnowRecord,
  StationRecord,
  ThemeName,
  WeightsConfig,
} from '../types';

const DB_NAME = 'ski_pilot_db';
const DB_VERSION = 1;
const STORE_STATE = 'app_state';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_STATE, 'readonly');
      const store = tx.objectStore(STORE_STATE);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_STATE, 'readwrite');
      const store = tx.objectStore(STORE_STATE);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Graceful fallback if private browsing blocks IDB
  }
}

export interface PersistedDataset {
  stations: StationRecord[];
  snow: SnowRecord[];
  meta: DatasetMeta;
}

export async function loadPersistedDataset(): Promise<PersistedDataset | null> {
  return idbGet<PersistedDataset>('dataset');
}

export async function savePersistedDataset(data: PersistedDataset): Promise<void> {
  return idbSet('dataset', data);
}

export async function loadSkiRadarCache(): Promise<SkiRadarFeedCache | null> {
  return idbGet<SkiRadarFeedCache>('skiradar_feed');
}

export async function saveSkiRadarCache(cache: SkiRadarFeedCache): Promise<void> {
  return idbSet('skiradar_feed', cache);
}

export async function loadSnowBackups(): Promise<SnowBackupSnapshot[]> {
  return (await idbGet<SnowBackupSnapshot[]>('snow_backups')) ?? [];
}

export async function saveSnowBackup(
  label: string,
  snow: SnowRecord[],
  meta: DatasetMeta
): Promise<SnowBackupSnapshot[]> {
  const existing = await loadSnowBackups();
  const snapshot: SnowBackupSnapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    label,
    snow: [...snow],
    meta: { ...meta },
  };
  const next = [snapshot, ...existing].slice(0, 6);
  await idbSet('snow_backups', next);
  return next;
}

export interface LumiplanCacheData {
  fetchedAt: string;
  bulletins: LumiplanBulletin[];
}

export async function loadLumiplanCache(): Promise<LumiplanCacheData | null> {
  return idbGet<LumiplanCacheData>('lumiplan_cache');
}

export async function saveLumiplanCache(data: LumiplanCacheData): Promise<void> {
  return idbSet('lumiplan_cache', data);
}

export type SkiinfoCacheMap = Record<
  string,
  { fetchedAt: string; resorts: SkiinfoResortRow[] }
>;

export async function loadSkiinfoCache(): Promise<SkiinfoCacheMap | null> {
  return idbGet<SkiinfoCacheMap>('skiinfo_cache');
}

export async function saveSkiinfoCache(data: SkiinfoCacheMap): Promise<void> {
  return idbSet('skiinfo_cache', data);
}

export function loadThemePref(): ThemeName {
  try {
    const val = localStorage.getItem('ski_pilot_theme') as ThemeName | null;
    if (
      val === 'Dark Blue' ||
      val === 'Light' ||
      val === 'Alpine Green' ||
      val === 'Midnight Purple'
    ) {
      return val;
    }
  } catch {
    // ignore
  }
  return 'Dark Blue';
}

export function saveThemePref(theme: ThemeName): void {
  try {
    localStorage.setItem('ski_pilot_theme', theme);
  } catch {
    // ignore
  }
}

export function loadWeightsPref(): WeightsConfig {
  try {
    const raw = localStorage.getItem('ski_pilot_weights');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        alt: Number.isFinite(parsed.alt) ? parsed.alt : 2,
        village: Number.isFinite(parsed.village) ? parsed.village : 1,
        size: Number.isFinite(parsed.size) ? parsed.size : 1,
        price: Number.isFinite(parsed.price) ? parsed.price : 1,
      };
    }
  } catch {
    // ignore
  }
  return { alt: 2, village: 1, size: 1, price: 1 };
}

export function saveWeightsPref(weights: WeightsConfig): void {
  try {
    localStorage.setItem('ski_pilot_weights', JSON.stringify(weights));
  } catch {
    // ignore
  }
}
