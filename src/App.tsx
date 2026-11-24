import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { AccessView } from './components/AccessView';
import { AuthGate } from './components/AuthGate';
import { HistoryView } from './components/HistoryView';
import { ImportView } from './components/ImportView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PersonalRankingView } from './components/PersonalRankingView';
import { Sidebar } from './components/Sidebar';
import { SkiRadarView } from './components/SkiRadarView';
import { SnowMaintenanceModal } from './components/SnowMaintenanceModal';
import { SnowRankingView } from './components/SnowRankingView';
import { StationDrawer } from './components/StationDrawer';
import { StationsView } from './components/StationsView';
import { TopBar } from './components/TopBar';
import { SAMPLE_SNOW, SAMPLE_STATIONS } from './data/sampleData';
import { useAppUpdate } from './hooks/useAppUpdate';
import {
  AccessRole,
  auth,
  checkUserAuthorization,
  computeLatestSnowDay,
  loadOrInitUserPrefs,
  loadSharedDatasetChunksFromCloud,
  saveSharedDatasetToCloud,
  subscribeSharedDatasetMeta,
} from './firebase';
import {
  CloudSyncStatus,
  DatasetMeta,
  LumiplanBulletin,
  SkiinfoResortRow,
  SkiRadarFeedCache,
  SnowBackupSnapshot,
  SnowRecord,
  StationRecord,
  TabId,
  ThemeName,
  UserPrefsRecord,
  WeightsConfig,
} from './types';
import {
  catchUpSnowWithOpenMeteoArchive,
  fetchLumiplanBatch,
  fetchLumiplanSingle,
  fetchSkiinfoRegion,
  incrementSnowWithLumiplan,
  incrementSnowWithSkiinfo,
  LUMIPLAN_CATALOG,
} from './utils/lumiplan';
import { computeStations, stationKey } from './utils/scoring';
import {
  enrichStationsWithSkiRadar,
  fetchSkiRadarFeed,
  importSkiRadarToDatabase,
  incrementSnowWithSkiRadar,
} from './utils/skiradar';
import {
  loadLumiplanCache,
  loadPersistedDataset,
  loadSkiinfoCache,
  loadSkiRadarCache,
  loadSnowBackups,
  loadThemePref,
  loadWeightsPref,
  saveLumiplanCache,
  savePersistedDataset,
  saveSkiinfoCache,
  saveSkiRadarCache,
  saveSnowBackup,
  saveThemePref,
  saveWeightsPref,
  SkiinfoCacheMap,
} from './utils/storage';

const CACHE_FRESH_MS = 30 * 60 * 1000;

export default function App() {
  const [theme, setTheme] = useState<ThemeName>(() => loadThemePref());
  const [activeTab, setActiveTab] = useState<TabId>('skiradar');
  const [weights, setWeights] = useState<WeightsConfig>(() => loadWeightsPref());
  const [priceSeason, setPriceSeason] = useState<string>('2026');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [stations, setStations] = useState<StationRecord[]>(SAMPLE_STATIONS);
  const [snow, setSnow] = useState<SnowRecord[]>(SAMPLE_SNOW);
  const [meta, setMeta] = useState<DatasetMeta>({
    source: 'sample',
    stationCount: SAMPLE_STATIONS.length,
    snowCount: SAMPLE_SNOW.length,
  });
  const [snowBackups, setSnowBackups] = useState<SnowBackupSnapshot[]>([]);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);

  const [skiRadarCache, setSkiRadarCache] = useState<SkiRadarFeedCache | null>(null);
  const [skiRadarLoading, setSkiRadarLoading] = useState(false);
  const [skiRadarError, setSkiRadarError] = useState<string | null>(null);

  const [lumiplanBulletins, setLumiplanBulletins] = useState<LumiplanBulletin[]>([]);
  const [lumiplanLoadingSingle, setLumiplanLoadingSingle] = useState(false);
  const [lumiplanBatchLoading, setLumiplanBatchLoading] = useState(false);
  const [lumiplanError, setLumiplanError] = useState<string | null>(null);

  const [skiinfoByRegion, setSkiinfoByRegion] = useState<SkiinfoCacheMap>({});
  const [skiinfoLoading, setSkiinfoLoading] = useState(false);
  const [skiinfoError, setSkiinfoError] = useState<string | null>(null);

  const preloadStartedRef = useRef(false);
  const appUpdate = useAppUpdate();

  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('idle');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const cloudRevisionRef = useRef<number>(0);
  const cloudBootstrappedRef = useRef(false);
  const datasetLoadedFromIdbRef = useRef(false);
  const latestDatasetRef = useRef({ stations, snow, meta });
  latestDatasetRef.current = { stations, snow, meta };

  const [drawerStationName, setDrawerStationName] = useState<string | null>(null);
  const [historyTargetStation, setHistoryTargetStation] = useState<string | null>(null);

  const [authStatus, setAuthStatus] = useState<
    'checking' | 'unauthenticated' | 'denied' | 'authorized'
  >('checking');
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authRole, setAuthRole] = useState<Exclude<AccessRole, 'denied'>>('friend');
  const [authError, setAuthError] = useState<string | null>(null);
  const [userPrefs, setUserPrefs] = useState<UserPrefsRecord>({
    uid: '',
    departureLabel: '',
    showDepartureInSidebar: false,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthUser(null);
        setAuthStatus('unauthenticated');
        setAuthError(null);
        preloadStartedRef.current = false;
        return;
      }

      setAuthUser(user);
      setAuthStatus('checking');
      setAuthError(null);
      const cacheKey = `ski_pilot_auth_cache_${user.uid}`;

      try {
        const role = await checkUserAuthorization(user);
        if (role === 'denied') {
          localStorage.removeItem(cacheKey);
          setAuthStatus('denied');
          return;
        }
        const prefs = await loadOrInitUserPrefs(user.uid, role);
        setAuthRole(role);
        setUserPrefs(prefs);
        localStorage.setItem(cacheKey, JSON.stringify({ role, prefs }));
        setAuthStatus('authorized');
      } catch (err) {
        if (!navigator.onLine) {
          const cachedRaw = localStorage.getItem(cacheKey);
          if (cachedRaw) {
            try {
              const parsed = JSON.parse(cachedRaw) as {
                role: Exclude<AccessRole, 'denied'>;
                prefs: UserPrefsRecord;
              };
              setAuthRole(parsed.role);
              setUserPrefs(parsed.prefs);
              setAuthStatus('authorized');
              return;
            } catch {
              // ignore invalid cache
            }
          }
        }
        setAuthError(err instanceof Error ? err.message : 'Erreur de vérification des droits.');
        setAuthStatus('denied');
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let active = true;
    loadPersistedDataset().then((persisted) => {
      if (!active) return;
      datasetLoadedFromIdbRef.current = true;
      if (persisted && persisted.stations.length > 0) {
        cloudRevisionRef.current = Math.max(
          cloudRevisionRef.current,
          persisted.meta.cloudRevision ?? 0
        );
        setStations(persisted.stations);
        setSnow(persisted.snow);
        setMeta(persisted.meta);
      }
    });
    loadSkiRadarCache().then((cached) => {
      if (!active || !cached) return;
      setSkiRadarCache(cached);
    });
    loadLumiplanCache().then((cached) => {
      if (!active || !cached?.bulletins?.length) return;
      setLumiplanBulletins((prev) => (prev.length === 0 ? cached.bulletins : prev));
    });
    loadSkiinfoCache().then((cached) => {
      if (!active || !cached) return;
      setSkiinfoByRegion((prev) =>
        Object.keys(prev).length === 0 ? cached : prev
      );
    });
    loadSnowBackups().then((list) => {
      if (!active) return;
      setSnowBackups(list);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === 'Light') {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }
    const themeColors: Record<ThemeName, string> = {
      'Dark Blue': '#0F1926',
      Light: '#F4F7FA',
      'Alpine Green': '#0E1A14',
      'Midnight Purple': '#141022',
    };
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', themeColors[theme]);
    }
    saveThemePref(theme);
  }, [theme]);

  const refreshSkiRadar = useCallback(async () => {
    setSkiRadarLoading(true);
    setSkiRadarError(null);
    try {
      const cached = await loadSkiRadarCache();
      const { cache } = await fetchSkiRadarFeed(cached ?? skiRadarCache);
      setSkiRadarCache(cache);
      await saveSkiRadarCache(cache);
    } catch (err) {
      setSkiRadarError(
        err instanceof Error ? err.message : 'Impossible de joindre l’API SkiRadar.'
      );
    } finally {
      setSkiRadarLoading(false);
    }
  }, [skiRadarCache]);

  const loadSingleLumiplan = useCallback(async (slug: string) => {
    setLumiplanLoadingSingle(true);
    setLumiplanError(null);
    try {
      const data = await fetchLumiplanSingle(slug);
      setLumiplanBulletins((prev) => {
        const next = [data, ...prev.filter((b) => b.slug !== data.slug)];
        void saveLumiplanCache({ fetchedAt: new Date().toISOString(), bulletins: next });
        return next;
      });
    } catch (err) {
      setLumiplanError(
        err instanceof Error ? err.message : 'Erreur de lecture du bulletin Lumiplan.'
      );
    } finally {
      setLumiplanLoadingSingle(false);
    }
  }, []);

  const loadAllLumiplan = useCallback(async () => {
    setLumiplanBatchLoading(true);
    setLumiplanError(null);
    try {
      const slugs = LUMIPLAN_CATALOG.map((c) => c.slug);
      const { bulletins: list, errors } = await fetchLumiplanBatch(slugs);
      if (list.length > 0) {
        setLumiplanBulletins(list);
        await saveLumiplanCache({ fetchedAt: new Date().toISOString(), bulletins: list });
      }
      if (errors.length > 0 && list.length === 0) {
        setLumiplanError('Aucun bulletin Lumiplan n’a répondu pour le moment.');
      }
    } catch (err) {
      setLumiplanError(
        err instanceof Error ? err.message : 'Impossible de contacter le flux Lumiplan.'
      );
    } finally {
      setLumiplanBatchLoading(false);
    }
  }, []);

  const loadSkiinfoRegion = useCallback(async (region: string) => {
    setSkiinfoLoading(true);
    setSkiinfoError(null);
    try {
      const data = await fetchSkiinfoRegion(region);
      setSkiinfoByRegion((prev) => {
        const next: SkiinfoCacheMap = {
          ...prev,
          [region]: { fetchedAt: data.fetchedAt, resorts: data.resorts },
        };
        void saveSkiinfoCache(next);
        return next;
      });
    } catch (err) {
      setSkiinfoError(
        err instanceof Error ? err.message : 'Erreur de lecture Skiinfo.'
      );
    } finally {
      setSkiinfoLoading(false);
    }
  }, []);

  // Silent background preload of SkiRadar, Lumiplan (31 stations), and Skiinfo at startup
  useEffect(() => {
    if (authStatus !== 'authorized') return;
    if (preloadStartedRef.current) return;
    preloadStartedRef.current = true;

    const runSilentPreload = async () => {
      if (!navigator.onLine) return;

      const [srCached, lpCached, siCached] = await Promise.all([
        loadSkiRadarCache(),
        loadLumiplanCache(),
        loadSkiinfoCache(),
      ]);

      const now = Date.now();
      const needsSr =
        !srCached || now - new Date(srCached.fetchedAt).getTime() > CACHE_FRESH_MS;
      const needsLp =
        !lpCached ||
        lpCached.bulletins.length < 10 ||
        now - new Date(lpCached.fetchedAt).getTime() > CACHE_FRESH_MS;
      const alpesNord = siCached?.['alpes-du-nord'];
      const needsSi =
        !alpesNord || now - new Date(alpesNord.fetchedAt).getTime() > CACHE_FRESH_MS;

      if (!needsSr && !needsLp && !needsSi) return;

      await Promise.allSettled([
        needsSr
          ? fetchSkiRadarFeed(srCached)
              .then(async ({ cache }) => {
                setSkiRadarCache(cache);
                await saveSkiRadarCache(cache);
              })
              .catch(() => undefined)
          : Promise.resolve(),
        needsLp
          ? fetchLumiplanBatch(LUMIPLAN_CATALOG.map((c) => c.slug))
              .then(async ({ bulletins }) => {
                if (bulletins.length > 0) {
                  setLumiplanBulletins(bulletins);
                  await saveLumiplanCache({
                    fetchedAt: new Date().toISOString(),
                    bulletins,
                  });
                }
              })
              .catch(() => undefined)
          : Promise.resolve(),
        needsSi
          ? fetchSkiinfoRegion('alpes-du-nord')
              .then((data) => {
                setSkiinfoByRegion((prev) => {
                  const next: SkiinfoCacheMap = {
                    ...prev,
                    'alpes-du-nord': {
                      fetchedAt: data.fetchedAt,
                      resorts: data.resorts,
                    },
                  };
                  void saveSkiinfoCache(next);
                  return next;
                });
              })
              .catch(() => undefined)
          : Promise.resolve(),
      ]);
    };

    void runSilentPreload();
  }, [authStatus]);

  const pushDatasetToCloud = useCallback(
    async (
      targetStations: StationRecord[],
      targetSnow: SnowRecord[],
      targetMeta: DatasetMeta,
      explicitUid?: string
    ) => {
      const uid = explicitUid ?? authUser?.uid;
      if (!uid || authRole !== 'admin') return;
      if (!navigator.onLine) {
        localStorage.setItem('ski_pilot_pending_cloud_push', '1');
        setCloudSyncStatus('offline');
        return;
      }

      setCloudSyncStatus('syncing');
      setCloudSyncError(null);
      try {
        const res = await saveSharedDatasetToCloud({
          uid,
          stations: targetStations,
          snow: targetSnow,
          meta: targetMeta,
          knownPrevRevision: cloudRevisionRef.current,
        });
        localStorage.removeItem('ski_pilot_pending_cloud_push');
        cloudRevisionRef.current = res.revision;
        const syncedMeta: DatasetMeta = {
          ...targetMeta,
          lastSnowDay: targetMeta.lastSnowDay || computeLatestSnowDay(targetSnow) || undefined,
          lastCloudSyncAt: res.syncedAtLabel,
          cloudRevision: res.revision,
        };
        setMeta((prev) => ({
          ...prev,
          lastSnowDay: syncedMeta.lastSnowDay,
          lastCloudSyncAt: res.syncedAtLabel,
          cloudRevision: res.revision,
        }));
        void savePersistedDataset({
          stations: targetStations,
          snow: targetSnow,
          meta: syncedMeta,
        });
        setCloudSyncStatus('synced');
      } catch (err) {
        setCloudSyncStatus('error');
        setCloudSyncError(
          err instanceof Error ? err.message : 'Erreur de synchronisation cloud.'
        );
      }
    },
    [authRole, authUser]
  );

  const persistDatasetAndSync = useCallback(
    (nextStations: StationRecord[], nextSnow: SnowRecord[], nextMeta: DatasetMeta) => {
      const enrichedMeta: DatasetMeta = {
        ...nextMeta,
        stationCount: nextStations.length,
        snowCount: nextSnow.length,
        lastSnowDay: computeLatestSnowDay(nextSnow) || nextMeta.lastSnowDay,
      };
      setStations(nextStations);
      setSnow(nextSnow);
      setMeta(enrichedMeta);
      void savePersistedDataset({
        stations: nextStations,
        snow: nextSnow,
        meta: enrichedMeta,
      });
      if (authRole === 'admin' && authUser) {
        void pushDatasetToCloud(nextStations, nextSnow, enrichedMeta, authUser.uid);
      }
    },
    [authRole, authUser, pushDatasetToCloud]
  );

  // Realtime Cloud Sync (Firebase Firestore): PC <-> Android <-> Authorized Friends
  useEffect(() => {
    if (authStatus !== 'authorized' || !authUser) {
      cloudBootstrappedRef.current = false;
      return;
    }

    let cancelled = false;
    setCloudSyncStatus((prev) => (prev === 'synced' ? 'synced' : 'loading'));

    const unsub = subscribeSharedDatasetMeta(
      async (cloudMeta) => {
        if (cancelled) return;

        if (!cloudMeta) {
          if (!cloudBootstrappedRef.current && authRole === 'admin') {
            cloudBootstrappedRef.current = true;
            // Ensure local IDB finished loading before bootstrapping initial cloud snapshot
            const persisted = await loadPersistedDataset();
            if (cancelled) return;
            const bootData =
              persisted && persisted.stations.length > 0
                ? persisted
                : latestDatasetRef.current;
            await pushDatasetToCloud(
              bootData.stations,
              bootData.snow,
              bootData.meta,
              authUser.uid
            );
          } else {
            setCloudSyncStatus('idle');
          }
          return;
        }

        const hasPendingOfflinePush =
          authRole === 'admin' &&
          localStorage.getItem('ski_pilot_pending_cloud_push') === '1';

        if (hasPendingOfflinePush && navigator.onLine) {
          const cur = latestDatasetRef.current;
          cloudRevisionRef.current = cloudMeta.revision;
          await pushDatasetToCloud(cur.stations, cur.snow, cur.meta, authUser.uid);
          return;
        }

        if (cloudMeta.revision <= cloudRevisionRef.current) {
          setCloudSyncStatus('synced');
          return;
        }

        setCloudSyncStatus('loading');
        try {
          const loaded = await loadSharedDatasetChunksFromCloud(cloudMeta);
          if (cancelled) return;
          cloudRevisionRef.current = cloudMeta.revision;
          setStations(loaded.stations);
          setSnow(loaded.snow);
          setMeta(loaded.meta);
          await savePersistedDataset(loaded);
          setCloudSyncStatus('synced');
          setCloudSyncError(null);
        } catch (err) {
          if (cancelled) return;
          setCloudSyncStatus('error');
          setCloudSyncError(
            err instanceof Error ? err.message : 'Erreur de lecture Cloud.'
          );
        }
      },
      (err) => {
        if (cancelled) return;
        setCloudSyncStatus('error');
        setCloudSyncError(err.message);
      }
    );

    const handleBackOnline = () => {
      if (
        authRole === 'admin' &&
        localStorage.getItem('ski_pilot_pending_cloud_push') === '1'
      ) {
        const cur = latestDatasetRef.current;
        void pushDatasetToCloud(cur.stations, cur.snow, cur.meta, authUser.uid);
      }
    };
    window.addEventListener('online', handleBackOnline);

    return () => {
      cancelled = true;
      unsub();
      window.removeEventListener('online', handleBackOnline);
    };
  }, [authRole, authStatus, authUser, pushDatasetToCloud]);

  const recordSnowBackup = useCallback(
    (label: string, targetSnow: SnowRecord[], targetMeta: DatasetMeta) => {
      void saveSnowBackup(label, targetSnow, targetMeta).then((list) => {
        setSnowBackups(list);
      });
    },
    []
  );

  const handleWeightsChange = (next: WeightsConfig) => {
    setWeights(next);
    saveWeightsPref(next);
  };

  const handleImportComplete = (
    nextStations: StationRecord[],
    nextSnow: SnowRecord[],
    nextMeta: DatasetMeta
  ) => {
    recordSnowBackup('Avant import Excel', snow, meta);
    persistDatasetAndSync(nextStations, nextSnow, {
      ...nextMeta,
      lastArchiveCatchupAt: meta.lastArchiveCatchupAt,
    });
  };

  const handleRestoreSample = () => {
    recordSnowBackup('Avant restauration échantillon', snow, meta);
    const sampleMeta: DatasetMeta = {
      source: 'sample',
      stationCount: SAMPLE_STATIONS.length,
      snowCount: SAMPLE_SNOW.length,
    };
    persistDatasetAndSync(SAMPLE_STATIONS, SAMPLE_SNOW, sampleMeta);
  };

  const handleUpdateVillageScore = (stationName: string, score: number) => {
    const updated = stations.map((s) =>
      s.name === stationName ? { ...s, score_village: score } : s
    );
    persistDatasetAndSync(updated, snow, meta);
  };

  const handleEnrichFromSkiRadar = () => {
    recordSnowBackup('Avant enrichissement SkiRadar', snow, meta);
    const srStations = skiRadarCache?.stations ?? [];
    const { stations: enriched, updatedCount, priceAddedCount } =
      enrichStationsWithSkiRadar(stations, srStations);
    const { snow: nextSnow, addedSnowCount, updatedSnowCount, skippedSnowCount } =
      incrementSnowWithSkiRadar(snow, enriched, srStations);

    const nextMeta: DatasetMeta = {
      ...meta,
      source: meta.source === 'excel' ? 'excel' : 'skiradar',
      importedAt: meta.importedAt ?? new Date().toLocaleString('fr-FR'),
      stationCount: enriched.length,
      snowCount: nextSnow.length,
    };
    persistDatasetAndSync(enriched, nextSnow, nextMeta);
    return {
      updatedCount,
      priceAddedCount,
      addedSnowCount,
      updatedSnowCount,
      skippedSnowCount,
    };
  };

  const handleImportMassifFromSkiRadar = (
    massif: string,
    mode: 'merge' | 'replace'
  ) => {
    recordSnowBackup(`Avant import SkiRadar (${massif})`, snow, meta);
    const srStations = skiRadarCache?.stations ?? [];
    const { stations: nextStations, addedCount, enrichedCount, priceAddedCount } =
      importSkiRadarToDatabase(stations, srStations, massif, mode);
    const scopedSr =
      massif === 'ALL'
        ? srStations
        : srStations.filter((s) => s.massif === massif);
    const { snow: nextSnow, addedSnowCount } = incrementSnowWithSkiRadar(
      snow,
      nextStations,
      scopedSr
    );

    const nextMeta: DatasetMeta = {
      ...meta,
      source: 'skiradar',
      importedAt: new Date().toLocaleString('fr-FR'),
      stationCount: nextStations.length,
      snowCount: nextSnow.length,
    };
    persistDatasetAndSync(nextStations, nextSnow, nextMeta);
    return { addedCount, enrichedCount, priceAddedCount, addedSnowCount };
  };

  const handleImportLumiplanSnow = (
    bulletins: LumiplanBulletin[],
    forcedSlugs?: string[]
  ) => {
    recordSnowBackup('Avant mise à jour Lumiplan', snow, meta);
    const result = incrementSnowWithLumiplan(
      snow,
      stations,
      bulletins,
      forcedSlugs ? { forcedSlugs } : undefined
    );
    const nextMeta: DatasetMeta = {
      ...meta,
      snowCount: result.snow.length,
    };
    persistDatasetAndSync(stations, result.snow, nextMeta);
    return result;
  };

  const handleImportSkiinfoSnow = (resorts: SkiinfoResortRow[]) => {
    recordSnowBackup('Avant mise à jour Skiinfo', snow, meta);
    const { snow: nextSnow, addedCount, updatedCount } = incrementSnowWithSkiinfo(
      snow,
      stations,
      resorts
    );
    const nextMeta: DatasetMeta = {
      ...meta,
      snowCount: nextSnow.length,
    };
    persistDatasetAndSync(stations, nextSnow, nextMeta);
    return { addedCount, updatedCount };
  };

  const handleCatchUpOpenMeteoArchive = async (
    startDate: string,
    endDate: string
  ) => {
    let srStations = skiRadarCache?.stations ?? [];
    if (srStations.length === 0) {
      const { cache } = await fetchSkiRadarFeed(skiRadarCache);
      srStations = cache.stations;
      setSkiRadarCache(cache);
      await saveSkiRadarCache(cache);
    }

    const result = await catchUpSnowWithOpenMeteoArchive({
      existingSnow: snow,
      existingStations: stations,
      skiRadarStations: srStations,
      startDate,
      endDate,
    });

    if (result.addedCount > 0) {
      recordSnowBackup(`Avant rattrapage Open-Meteo (${startDate} -> ${endDate})`, snow, meta);
    }

    const nextMeta: DatasetMeta = {
      ...meta,
      snowCount: result.snow.length,
      lastArchiveCatchupAt: new Date().toISOString(),
    };
    persistDatasetAndSync(stations, result.snow, nextMeta);
    return {
      addedCount: result.addedCount,
      coveredStations: result.coveredStations,
      skippedExisting: result.skippedExisting,
      startDate,
      endDate,
    };
  };

  const handlePurgeSnowRecords = (
    targets: Array<{ station: string; day: string }>,
    label: string
  ): number => {
    if (targets.length === 0) return 0;
    const keySet = new Set(targets.map((t) => `${t.station}__${t.day}`));
    const nextSnow = snow.filter((r) => !keySet.has(`${r.station}__${r.day}`));
    const removedCount = snow.length - nextSnow.length;
    if (removedCount === 0) return 0;
    recordSnowBackup(label, snow, meta);
    const nextMeta: DatasetMeta = {
      ...meta,
      snowCount: nextSnow.length,
    };
    persistDatasetAndSync(stations, nextSnow, nextMeta);
    return removedCount;
  };

  const handlePurgeSnowSince = (cutoffDay: string, label: string): number => {
    const removedCount = snow.filter((r) => r.day >= cutoffDay).length;
    if (removedCount === 0) return 0;
    recordSnowBackup(label, snow, meta);
    const nextSnow = snow.filter((r) => r.day < cutoffDay);
    const nextMeta: DatasetMeta = {
      ...meta,
      snowCount: nextSnow.length,
    };
    persistDatasetAndSync(stations, nextSnow, nextMeta);
    return removedCount;
  };

  const handleRestoreSnowBackup = (snapshotId: string) => {
    const snap = snowBackups.find((b) => b.id === snapshotId);
    if (!snap) return;
    recordSnowBackup('Avant restauration sauvegarde', snow, meta);
    const nextMeta: DatasetMeta = {
      ...meta,
      snowCount: snap.snow.length,
    };
    persistDatasetAndSync(stations, snap.snow, nextMeta);
  };

  const handleUpdateSnowRecord = (
    station: string,
    day: string,
    ground: number | null,
    fresh: number | null
  ) => {
    recordSnowBackup(`Avant correction ${station}`, snow, meta);
    const nextSnow = snow.map((r) =>
      r.station === station && r.day === day
        ? {
            ...r,
            ground,
            fresh,
            max_depth: ground !== null ? Math.max(r.max_depth ?? 0, ground) : r.max_depth,
          }
        : r
    );
    persistDatasetAndSync(stations, nextSnow, meta);
  };

  const handleDeleteSnowRecord = (station: string, day: string) => {
    recordSnowBackup(`Avant suppression ${station} (${day})`, snow, meta);
    const nextSnow = snow.filter((r) => !(r.station === station && r.day === day));
    const nextMeta: DatasetMeta = {
      ...meta,
      snowCount: nextSnow.length,
    };
    persistDatasetAndSync(stations, nextSnow, nextMeta);
  };

  const handleAddManualSnowRecord = (
    station: string,
    day: string,
    ground: number,
    fresh: number
  ) => {
    recordSnowBackup(`Avant saisie manuelle ${station}`, snow, meta);
    const matched = stations.find((s) => s.name === station);
    const year = parseInt(day.slice(0, 4), 10);
    const month = parseInt(day.slice(5, 7), 10);
    const season = month >= 9 ? year + 1 : year;
    const obsAlt = matched?.obs_alt ?? matched?.high_alt ?? null;

    const idx = snow.findIndex((r) => r.station === station && r.day === day);
    const nextSnow = [...snow];
    if (idx !== -1) {
      nextSnow[idx] = {
        ...nextSnow[idx],
        ground,
        fresh,
        max_depth: Math.max(nextSnow[idx].max_depth ?? 0, ground),
      };
    } else {
      nextSnow.push({
        station,
        day,
        season,
        ground,
        max_depth: ground,
        fresh,
        obs_alt: obsAlt,
      });
    }
    const nextMeta: DatasetMeta = {
      ...meta,
      snowCount: nextSnow.length,
    };
    persistDatasetAndSync(stations, nextSnow, nextMeta);
  };

  const computedStations = useMemo(
    () => computeStations(stations, weights, priceSeason),
    [priceSeason, stations, weights]
  );

  const drawerStation = useMemo(
    () => computedStations.find((s) => s.name === drawerStationName) ?? null,
    [computedStations, drawerStationName]
  );

  const resolveSnowStationName = (stationName: string): string | null => {
    const exact = snow.find((r) => r.station === stationName);
    if (exact) return exact.station;
    const key = stationKey(stationName);
    const fuzzy = snow.find(
      (r) =>
        stationKey(r.station) === key ||
        stationKey(r.station).replace(/^l+/, '') === key
    );
    return fuzzy ? fuzzy.station : null;
  };

  const handleOpenHistoryForStation = (stationName: string) => {
    const matched = resolveSnowStationName(stationName);
    if (matched) {
      setHistoryTargetStation(matched);
      setDrawerStationName(null);
      setActiveTab('history');
    }
  };

  if (authStatus !== 'authorized' || !authUser) {
    return (
      <AuthGate
        status={authStatus === 'authorized' ? 'checking' : authStatus}
        user={authUser}
        errorMessage={authError}
      />
    );
  }

  const departureSubtitle =
    userPrefs.showDepartureInSidebar && userPrefs.departureLabel.trim()
      ? userPrefs.departureLabel.trim()
      : null;

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)]">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        meta={meta}
        departureSubtitle={departureSubtitle}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        cloudSync={{
          status: cloudSyncStatus,
          revision: meta.cloudRevision,
          lastSyncAt: meta.lastCloudSyncAt,
          error: cloudSyncError,
          canWrite: authRole === 'admin',
          onSyncNow: () => void pushDatasetToCloud(stations, snow, meta),
        }}
        updateInfo={{
          updateAvailable: appUpdate.updateAvailable,
          remoteVersion: appUpdate.remoteVersion,
          checking: appUpdate.checking,
          statusMessage: appUpdate.statusMessage,
          onCheckUpdates: appUpdate.checkForUpdates,
          onApplyUpdate: appUpdate.applyUpdate,
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          activeTab={activeTab}
          theme={theme}
          onChangeTheme={setTheme}
          onOpenImport={() => setActiveTab('import')}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          updateInfo={{
            updateAvailable: appUpdate.updateAvailable,
            remoteVersion: appUpdate.remoteVersion,
            onApplyUpdate: appUpdate.applyUpdate,
          }}
        />

        <OfflineIndicator />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          <div className="mx-auto max-w-[1280px]">
            {activeTab === 'personal' && (
              <PersonalRankingView
                stations={stations}
                weights={weights}
                priceSeason={priceSeason}
                onChangePriceSeason={setPriceSeason}
                onChangeWeights={handleWeightsChange}
                onInspectStation={(name) => setDrawerStationName(name)}
              />
            )}

            {activeTab === 'snow_ranking' && (
              <SnowRankingView
                snow={snow}
                onSelectStationHistory={(name) => handleOpenHistoryForStation(name)}
              />
            )}

            {activeTab === 'stations' && (
              <StationsView
                stations={stations}
                priceSeason={priceSeason}
                onChangePriceSeason={setPriceSeason}
                onSelectStation={(name) => setDrawerStationName(name)}
              />
            )}

            {activeTab === 'history' && (
              <HistoryView
                snow={snow}
                initialStation={historyTargetStation}
                onOpenMaintenance={() => setMaintenanceOpen(true)}
              />
            )}

            {activeTab === 'skiradar' && (
              <SkiRadarView
                cache={skiRadarCache}
                loading={skiRadarLoading}
                error={skiRadarError}
                onRefresh={refreshSkiRadar}
                lumiplanBulletins={lumiplanBulletins}
                lumiplanLoadingSingle={lumiplanLoadingSingle}
                lumiplanBatchLoading={lumiplanBatchLoading}
                lumiplanError={lumiplanError}
                onLoadSingleLumiplan={loadSingleLumiplan}
                onLoadAllLumiplan={loadAllLumiplan}
                skiinfoByRegion={skiinfoByRegion}
                skiinfoLoading={skiinfoLoading}
                skiinfoError={skiinfoError}
                onLoadSkiinfoRegion={loadSkiinfoRegion}
                onOpenDataManagement={() => setActiveTab('import')}
              />
            )}

            {activeTab === 'import' && (
              <ImportView
                stations={stations}
                snow={snow}
                meta={meta}
                cloudSync={{
                  status: cloudSyncStatus,
                  revision: meta.cloudRevision,
                  lastSyncAt: meta.lastCloudSyncAt,
                  error: cloudSyncError,
                  canWrite: authRole === 'admin',
                  onSyncNow: () => void pushDatasetToCloud(stations, snow, meta),
                }}
                skiRadar={{
                  cache: skiRadarCache,
                  loading: skiRadarLoading,
                  onRefresh: refreshSkiRadar,
                  onEnrichDatabase: handleEnrichFromSkiRadar,
                  onImportMassifToDatabase: handleImportMassifFromSkiRadar,
                }}
                lumiplan={{
                  bulletins: lumiplanBulletins,
                  batchLoading: lumiplanBatchLoading,
                  onLoadAll: loadAllLumiplan,
                  onImportLumiplanSnow: handleImportLumiplanSnow,
                }}
                skiinfo={{
                  byRegion: skiinfoByRegion,
                  loading: skiinfoLoading,
                  onLoadRegion: loadSkiinfoRegion,
                  onImportSkiinfoSnow: handleImportSkiinfoSnow,
                }}
                onCatchUpArchive={handleCatchUpOpenMeteoArchive}
                onPurgeToday={() =>
                  handlePurgeSnowSince(todayIso, `Avant purge du ${todayIso}`)
                }
                onPurgeRecords={handlePurgeSnowRecords}
                onImportComplete={handleImportComplete}
                onRestoreSample={handleRestoreSample}
                onOpenSkiRadar={() => setActiveTab('skiradar')}
                onOpenMaintenance={() => setMaintenanceOpen(true)}
              />
            )}

            {activeTab === 'access' && (
              <AccessView
                user={authUser}
                role={authRole}
                userPrefs={userPrefs}
                cloudSync={{
                  status: cloudSyncStatus,
                  revision: meta.cloudRevision,
                  lastSyncAt: meta.lastCloudSyncAt,
                  stationCount: meta.stationCount,
                  snowCount: meta.snowCount,
                  error: cloudSyncError,
                  onSyncNow: () => void pushDatasetToCloud(stations, snow, meta),
                }}
                onPrefsChange={(next) => {
                  setUserPrefs(next);
                  localStorage.setItem(
                    `ski_pilot_auth_cache_${authUser.uid}`,
                    JSON.stringify({ role: authRole, prefs: next })
                  );
                }}
              />
            )}
          </div>
        </main>
      </div>

      <StationDrawer
        station={drawerStation}
        hasSnowHistory={
          drawerStation ? resolveSnowStationName(drawerStation.name) !== null : false
        }
        onClose={() => setDrawerStationName(null)}
        onUpdateVillageScore={handleUpdateVillageScore}
        onOpenHistory={handleOpenHistoryForStation}
      />

      <SnowMaintenanceModal
        open={maintenanceOpen}
        onClose={() => setMaintenanceOpen(false)}
        snow={snow}
        stations={stations}
        lumiplanBulletins={lumiplanBulletins}
        skiRadarStations={skiRadarCache?.stations ?? []}
        backups={snowBackups}
        onPurgeSince={handlePurgeSnowSince}
        onPurgeRecords={handlePurgeSnowRecords}
        onRestoreBackup={handleRestoreSnowBackup}
        onUpdateRecord={handleUpdateSnowRecord}
        onDeleteRecord={handleDeleteSnowRecord}
        onAddManualRecord={handleAddManualSnowRecord}
      />
    </div>
  );
}
