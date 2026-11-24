import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  AllowedUserRecord,
  DatasetMeta,
  SharedDatasetMetaRecord,
  SnowRecord,
  StationRecord,
  UserPrefsRecord,
} from './types';

export const ADMIN_BOOTSTRAP_EMAIL = 'amottaviani@hotmail.com';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export function emailToDocId(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 128);
}

export async function signInWithGooglePopup(): Promise<void> {
  await signInWithPopup(auth, googleProvider);
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export type AccessRole = 'admin' | 'friend' | 'denied';

export async function checkUserAuthorization(user: User): Promise<AccessRole> {
  if (!user.email || !user.emailVerified) {
    return 'denied';
  }

  const normalizedEmail = user.email.trim().toLowerCase();
  const isBootstrap = normalizedEmail === ADMIN_BOOTSTRAP_EMAIL;

  const adminPath = `admins/${user.uid}`;
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    if (adminSnap.exists()) {
      return 'admin';
    }
    if (isBootstrap) {
      await setDoc(doc(db, 'admins', user.uid), {
        uid: user.uid,
        email: normalizedEmail,
        createdAt: serverTimestamp(),
      });
      return 'admin';
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, adminPath);
  }

  const inviteId = emailToDocId(normalizedEmail);
  const invitePath = `allowed_users/${inviteId}`;
  try {
    const inviteSnap = await getDoc(doc(db, 'allowed_users', inviteId));
    if (inviteSnap.exists()) {
      const data = inviteSnap.data();
      if (data.active === true) {
        return data.role === 'admin' ? 'admin' : 'friend';
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, invitePath);
  }

  return 'denied';
}

export function subscribeAllowedUsers(
  onUpdate: (items: AllowedUserRecord[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = 'allowed_users';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: AllowedUserRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          email: String(data.email ?? ''),
          label: String(data.label ?? ''),
          role: data.role === 'admin' ? 'admin' : 'friend',
          active: Boolean(data.active),
          addedByUid: String(data.addedByUid ?? ''),
        };
      });
      list.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
      onUpdate(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function addAllowedUser(
  adminUid: string,
  emailRaw: string,
  labelRaw: string
): Promise<void> {
  const email = emailRaw.trim().toLowerCase().slice(0, 254);
  const label = (labelRaw.trim() || email.split('@')[0] || 'Ami').slice(0, 80);
  if (!email.includes('@') || email.length < 4) {
    throw new Error('Veuillez saisir une adresse e-mail Google valide.');
  }

  const inviteId = emailToDocId(email);
  const path = `allowed_users/${inviteId}`;
  try {
    const existingSnap = await getDoc(doc(db, 'allowed_users', inviteId));
    if (existingSnap.exists()) {
      await updateDoc(doc(db, 'allowed_users', inviteId), {
        label,
        role: 'friend',
        active: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'allowed_users', inviteId), {
        email,
        label,
        role: 'friend',
        active: true,
        addedByUid: adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function toggleAllowedUserActive(
  inviteId: string,
  nextActive: boolean
): Promise<void> {
  const path = `allowed_users/${inviteId}`;
  try {
    await updateDoc(doc(db, 'allowed_users', inviteId), {
      active: nextActive,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeAllowedUser(inviteId: string): Promise<void> {
  const path = `allowed_users/${inviteId}`;
  try {
    await deleteDoc(doc(db, 'allowed_users', inviteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function loadOrInitUserPrefs(
  uid: string,
  role: 'admin' | 'friend'
): Promise<UserPrefsRecord> {
  const path = `user_prefs/${uid}`;
  const defaultPrefs: UserPrefsRecord = {
    uid,
    departureLabel: role === 'admin' ? 'La Biolle · Savoie' : 'Mon point de départ',
    showDepartureInSidebar: true,
  };

  try {
    const snap = await getDoc(doc(db, 'user_prefs', uid));
    if (snap.exists()) {
      const data = snap.data();
      return {
        uid,
        departureLabel:
          typeof data.departureLabel === 'string'
            ? data.departureLabel.slice(0, 80)
            : defaultPrefs.departureLabel,
        showDepartureInSidebar:
          typeof data.showDepartureInSidebar === 'boolean'
            ? data.showDepartureInSidebar
            : true,
      };
    }

    await setDoc(doc(db, 'user_prefs', uid), {
      uid,
      departureLabel: defaultPrefs.departureLabel,
      showDepartureInSidebar: defaultPrefs.showDepartureInSidebar,
      updatedAt: serverTimestamp(),
    });
    return defaultPrefs;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveUserPrefs(
  uid: string,
  departureLabelRaw: string,
  showDepartureInSidebar: boolean
): Promise<UserPrefsRecord> {
  const departureLabel = departureLabelRaw.trim().slice(0, 80);
  const path = `user_prefs/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'user_prefs', uid));
    if (snap.exists()) {
      await updateDoc(doc(db, 'user_prefs', uid), {
        departureLabel,
        showDepartureInSidebar,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'user_prefs', uid), {
        uid,
        departureLabel,
        showDepartureInSidebar,
        updatedAt: serverTimestamp(),
      });
    }
    return { uid, departureLabel, showDepartureInSidebar };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

const STATION_CHUNK_SIZE = 120;
const SNOW_CHUNK_SIZE = 900;

function stripUndefinedDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function splitIntoChunks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function computeLatestSnowDay(snow: SnowRecord[]): string {
  let latest = '';
  for (const r of snow) {
    if (r.day && r.day > latest) {
      latest = r.day;
    }
  }
  return latest.slice(0, 10);
}

function parseSharedMetaDoc(data: Record<string, unknown>): SharedDatasetMetaRecord {
  const rawSource = data.source;
  const source: DatasetMeta['source'] =
    rawSource === 'excel' || rawSource === 'skiradar' ? rawSource : 'sample';
  return {
    docId: 'current',
    source,
    stationsFileName: String(data.stationsFileName ?? ''),
    snowFileName: String(data.snowFileName ?? ''),
    importedAt: String(data.importedAt ?? ''),
    stationCount: Number(data.stationCount ?? 0),
    snowCount: Number(data.snowCount ?? 0),
    stationChunkCount: Number(data.stationChunkCount ?? 0),
    snowChunkCount: Number(data.snowChunkCount ?? 0),
    lastSnowDay: String(data.lastSnowDay ?? ''),
    lastArchiveCatchupAt: String(data.lastArchiveCatchupAt ?? ''),
    revision: Number(data.revision ?? 1),
    updatedByUid: String(data.updatedByUid ?? ''),
  };
}

export async function fetchSharedDatasetMetaFromCloud(): Promise<SharedDatasetMetaRecord | null> {
  const path = 'shared_meta/current';
  try {
    const snap = await getDoc(doc(db, 'shared_meta', 'current'));
    if (!snap.exists()) return null;
    return parseSharedMetaDoc(snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function loadSharedDatasetChunksFromCloud(
  cloudMeta: SharedDatasetMetaRecord
): Promise<{
  stations: StationRecord[];
  snow: SnowRecord[];
  meta: DatasetMeta;
}> {
  const stations: StationRecord[] = [];
  const snow: SnowRecord[] = [];

  const stationReads = Array.from({ length: cloudMeta.stationChunkCount }, (_, idx) => {
    const chunkId = `stations_${idx}`;
    return getDoc(doc(db, 'shared_chunks', chunkId)).catch((err) => {
      handleFirestoreError(err, OperationType.GET, `shared_chunks/${chunkId}`);
    });
  });

  const snowReads = Array.from({ length: cloudMeta.snowChunkCount }, (_, idx) => {
    const chunkId = `snow_${idx}`;
    return getDoc(doc(db, 'shared_chunks', chunkId)).catch((err) => {
      handleFirestoreError(err, OperationType.GET, `shared_chunks/${chunkId}`);
    });
  });

  const [stationSnaps, snowSnaps] = await Promise.all([
    Promise.all(stationReads),
    Promise.all(snowReads),
  ]);

  for (const snap of stationSnaps) {
    if (snap && snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.items)) {
        stations.push(...(data.items as StationRecord[]));
      }
    }
  }

  for (const snap of snowSnaps) {
    if (snap && snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.items)) {
        snow.push(...(data.items as SnowRecord[]));
      }
    }
  }

  const meta: DatasetMeta = {
    source: cloudMeta.source,
    stationsFileName: cloudMeta.stationsFileName || undefined,
    snowFileName: cloudMeta.snowFileName || undefined,
    importedAt: cloudMeta.importedAt || undefined,
    stationCount: stations.length,
    snowCount: snow.length,
    lastSnowDay: cloudMeta.lastSnowDay || computeLatestSnowDay(snow) || undefined,
    lastArchiveCatchupAt: cloudMeta.lastArchiveCatchupAt || undefined,
    lastCloudSyncAt: new Date().toLocaleString('fr-FR'),
    cloudRevision: cloudMeta.revision,
  };

  return { stations, snow, meta };
}

export function subscribeSharedDatasetMeta(
  onUpdate: (cloudMeta: SharedDatasetMetaRecord | null) => void,
  onError: (err: Error) => void
): () => void {
  const path = 'shared_meta/current';
  return onSnapshot(
    doc(db, 'shared_meta', 'current'),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      onUpdate(parseSharedMetaDoc(snap.data()));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveSharedDatasetToCloud(params: {
  uid: string;
  stations: StationRecord[];
  snow: SnowRecord[];
  meta: DatasetMeta;
  knownPrevRevision?: number;
}): Promise<{ revision: number; syncedAtLabel: string }> {
  const { uid, stations, snow, meta, knownPrevRevision } = params;

  const existingMeta = await fetchSharedDatasetMetaFromCloud();
  const nextRevision =
    Math.max(existingMeta?.revision ?? 0, knownPrevRevision ?? 0) + 1;

  const cleanStations = stripUndefinedDeep(stations).slice(0, 5000);
  const cleanSnow = stripUndefinedDeep(snow).slice(0, 100000);

  const stationChunks = splitIntoChunks(cleanStations, STATION_CHUNK_SIZE).slice(0, 30);
  const snowChunks = splitIntoChunks(cleanSnow, SNOW_CHUNK_SIZE).slice(0, 100);

  const batch = writeBatch(db);

  stationChunks.forEach((items, idx) => {
    const chunkId = `stations_${idx}`;
    batch.set(doc(db, 'shared_chunks', chunkId), {
      kind: 'stations',
      chunkIndex: idx,
      revision: nextRevision,
      items,
      updatedByUid: uid,
      updatedAt: serverTimestamp(),
    });
  });

  if (existingMeta && existingMeta.stationChunkCount > stationChunks.length) {
    for (let i = stationChunks.length; i < existingMeta.stationChunkCount; i++) {
      batch.delete(doc(db, 'shared_chunks', `stations_${i}`));
    }
  }

  snowChunks.forEach((items, idx) => {
    const chunkId = `snow_${idx}`;
    batch.set(doc(db, 'shared_chunks', chunkId), {
      kind: 'snow',
      chunkIndex: idx,
      revision: nextRevision,
      items,
      updatedByUid: uid,
      updatedAt: serverTimestamp(),
    });
  });

  if (existingMeta && existingMeta.snowChunkCount > snowChunks.length) {
    for (let i = snowChunks.length; i < existingMeta.snowChunkCount; i++) {
      batch.delete(doc(db, 'shared_chunks', `snow_${i}`));
    }
  }

  const lastSnowDay = (meta.lastSnowDay ?? computeLatestSnowDay(cleanSnow)).slice(0, 10);
  const metaPayload = {
    docId: 'current',
    source: meta.source,
    stationsFileName: (meta.stationsFileName ?? '').slice(0, 160),
    snowFileName: (meta.snowFileName ?? '').slice(0, 160),
    importedAt: (meta.importedAt ?? '').slice(0, 64),
    stationCount: cleanStations.length,
    snowCount: cleanSnow.length,
    stationChunkCount: stationChunks.length,
    snowChunkCount: snowChunks.length,
    lastSnowDay,
    lastArchiveCatchupAt: (meta.lastArchiveCatchupAt ?? '').slice(0, 40),
    revision: nextRevision,
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };

  batch.set(doc(db, 'shared_meta', 'current'), metaPayload);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'shared_meta/current');
  }

  return {
    revision: nextRevision,
    syncedAtLabel: new Date().toLocaleString('fr-FR'),
  };
}

