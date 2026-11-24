import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Cloud,
  Compass,
  Database,
  Download,
  FileSpreadsheet,
  History,
  Mountain,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Snowflake,
  Sparkles,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';
import {
  CloudSyncStatus,
  DatasetMeta,
  ImportDiagnostics,
  LumiplanBulletin,
  SkiinfoResortRow,
  SkiRadarFeedCache,
  SnowRecord,
  StationRecord,
} from '../types';
import {
  downloadSnowTemplate,
  downloadStationsTemplate,
  mergeExcelWorkbooks,
} from '../utils/excelParser';
import {
  detectSnowDatabaseAnomalies,
  evaluateLumiplanBulletin,
  LUMIPLAN_CATALOG,
  LumiplanImportResult,
} from '../utils/lumiplan';
import { MASSIF_LABELS } from '../utils/skiradar';
import { SkiinfoCacheMap } from '../utils/storage';
import { KpiItem, KpiStrip } from './KpiStrip';
import { PWAInstallButton } from './PWAInstallButton';

const SKIINFO_REGIONS: Array<{ id: string; label: string }> = [
  { id: 'alpes-du-nord', label: 'Alpes du Nord' },
  { id: 'alpes-du-sud', label: 'Alpes du Sud' },
  { id: 'pyrenees', label: 'Pyrénées' },
  { id: 'vosges', label: 'Vosges' },
  { id: 'jura', label: 'Jura' },
  { id: 'massif-central', label: 'Massif Central' },
];

interface ImportViewProps {
  stations: StationRecord[];
  snow: SnowRecord[];
  meta: DatasetMeta;
  cloudSync: {
    status: CloudSyncStatus;
    revision?: number;
    lastSyncAt?: string;
    error: string | null;
    canWrite: boolean;
    onSyncNow: () => void;
  };
  skiRadar: {
    cache: SkiRadarFeedCache | null;
    loading: boolean;
    onRefresh: () => void;
    onEnrichDatabase: () => {
      updatedCount: number;
      priceAddedCount: number;
      addedSnowCount: number;
      updatedSnowCount: number;
      skippedSnowCount: number;
    };
    onImportMassifToDatabase: (
      massif: string,
      mode: 'merge' | 'replace'
    ) => {
      addedCount: number;
      enrichedCount: number;
      priceAddedCount: number;
      addedSnowCount: number;
    };
  };
  lumiplan: {
    bulletins: LumiplanBulletin[];
    batchLoading: boolean;
    onLoadAll: () => Promise<void>;
    onImportLumiplanSnow: (
      bulletins: LumiplanBulletin[],
      forcedSlugs?: string[]
    ) => LumiplanImportResult;
  };
  skiinfo: {
    byRegion: SkiinfoCacheMap;
    loading: boolean;
    onLoadRegion: (region: string) => Promise<void>;
    onImportSkiinfoSnow: (resorts: SkiinfoResortRow[]) => {
      addedCount: number;
      updatedCount: number;
    };
  };
  onCatchUpArchive: (
    startDate: string,
    endDate: string
  ) => Promise<{
    addedCount: number;
    coveredStations: number;
    skippedExisting: number;
    startDate: string;
    endDate: string;
  }>;
  onPurgeToday: () => number;
  onPurgeRecords: (
    targets: Array<{ station: string; day: string }>,
    label: string
  ) => number;
  onImportComplete: (
    nextStations: StationRecord[],
    nextSnow: SnowRecord[],
    nextMeta: DatasetMeta
  ) => void;
  onRestoreSample: () => void;
  onOpenSkiRadar: () => void;
  onOpenMaintenance: () => void;
}

export const ImportView: React.FC<ImportViewProps> = ({
  stations,
  snow,
  meta,
  cloudSync,
  skiRadar,
  lumiplan,
  skiinfo,
  onCatchUpArchive,
  onPurgeToday,
  onPurgeRecords,
  onImportComplete,
  onRestoreSample,
  onOpenSkiRadar,
  onOpenMaintenance,
}) => {
  const [stationsFile, setStationsFile] = useState<File | null>(null);
  const [snowFile, setSnowFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<ImportDiagnostics | null>(null);

  const [selectedMassif, setSelectedMassif] = useState<string>('alpes-du-nord');
  const [skiinfoRegion, setSkiinfoRegion] = useState<string>('alpes-du-nord');
  const [archiveRange, setArchiveRange] = useState<'since_last' | '7d' | '30d' | 'season'>('since_last');
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [maintenanceFeedback, setMaintenanceFeedback] = useState<string | null>(null);

  const stationsInputRef = useRef<HTMLInputElement>(null);
  const snowInputRef = useRef<HTMLInputElement>(null);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const latestSnowDay = useMemo(() => {
    let latest = meta.lastSnowDay ?? '';
    for (const r of snow) {
      if (r.day && r.day > latest) latest = r.day;
    }
    return latest || null;
  }, [meta.lastSnowDay, snow]);

  const missingDaysCount = useMemo(() => {
    if (!latestSnowDay || latestSnowDay >= todayIso) return 0;
    const t1 = Date.parse(`${latestSnowDay}T00:00:00Z`);
    const t2 = Date.parse(`${todayIso}T00:00:00Z`);
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0;
    return Math.max(0, Math.round((t2 - t1) / 86400000));
  }, [latestSnowDay, todayIso]);

  const resolvedArchiveDates = useMemo(() => {
    const endDate = todayIso;
    const addDays = (iso: string, delta: number) => {
      const dt = new Date(`${iso}T00:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() + delta);
      return dt.toISOString().slice(0, 10);
    };

    if (archiveRange === '7d') return { startDate: addDays(endDate, -7), endDate };
    if (archiveRange === '30d') return { startDate: addDays(endDate, -30), endDate };
    if (archiveRange === 'season') return { startDate: '2026-09-01', endDate };

    let latestCurrentSeason = '';
    for (const r of snow) {
      if (r.day >= '2026-09-01' && r.day > latestCurrentSeason) {
        latestCurrentSeason = r.day;
      }
    }
    const startDate = latestCurrentSeason ? latestCurrentSeason : addDays(endDate, -14);
    return {
      startDate: startDate <= endDate ? startDate : endDate,
      endDate,
    };
  }, [archiveRange, snow, todayIso]);

  const analyzedSnow = useMemo(
    () =>
      detectSnowDatabaseAnomalies(
        snow,
        lumiplan.bulletins,
        skiRadar.cache?.stations ?? []
      ),
    [lumiplan.bulletins, skiRadar.cache?.stations, snow]
  );

  const anomalyRows = useMemo(
    () => analyzedSnow.filter((r) => r.severity !== 'ok'),
    [analyzedSnow]
  );
  const anomalyCount = anomalyRows.length;
  const okCount = Math.max(0, analyzedSnow.length - anomalyCount);
  const todaySnowCount = useMemo(
    () => snow.filter((r) => r.day >= todayIso).length,
    [snow, todayIso]
  );

  const lumiplanVerifiedCount = useMemo(
    () =>
      lumiplan.bulletins.filter(
        (b) => evaluateLumiplanBulletin(b).reliability === 'verified'
      ).length,
    [lumiplan.bulletins]
  );
  const lumiplanAnomalyCount = Math.max(
    0,
    lumiplan.bulletins.length - lumiplanVerifiedCount
  );

  const skiRadarStations = skiRadar.cache?.stations ?? [];
  const skiRadarMassifs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of skiRadarStations) {
      const m = s.massif || 'autre';
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [skiRadarStations]);

  const skiinfoResorts = useMemo(
    () => skiinfo.byRegion[skiinfoRegion]?.resorts ?? [],
    [skiinfo.byRegion, skiinfoRegion]
  );

  const kpis: KpiItem[] = useMemo(() => {
    const matchedAltCount = stations.filter((s) => s.obs_alt !== null).length;
    return [
      {
        label: 'Stations en base',
        value: `${meta.stationCount}`,
        subtext: `${matchedAltCount} postes météo reliés`,
        icon: Mountain,
        iconColor: '#64C99A',
      },
      {
        label: 'Relevés quotidiens',
        value: meta.snowCount.toLocaleString('fr-FR'),
        subtext: latestSnowDay
          ? missingDaysCount > 0
            ? `Dernier : ${latestSnowDay} (${missingDaysCount} j d’écart)`
            : `Dernier : ${latestSnowDay} (à jour)`
          : 'Aucun relevé',
        icon: Snowflake,
        iconColor: '#38BDF8',
      },
      {
        label: 'Contrôle saison 2026-27',
        value: anomalyCount > 0 ? `${anomalyCount} anomalie${anomalyCount > 1 ? 's' : ''}` : `${okCount} OK`,
        subtext:
          anomalyCount > 0
            ? `${okCount} relevé(s) OK · nettoyage prêt`
            : 'Aucune anomalie détectée',
        icon: ShieldAlert,
        iconColor: anomalyCount > 0 ? '#F59E0B' : '#64C99A',
      },
      {
        label: 'Cloud Firebase (PC ↔ Android)',
        value:
          cloudSync.status === 'synced'
            ? `OK${cloudSync.revision ? ` #${cloudSync.revision}` : ''}`
            : cloudSync.status === 'offline'
              ? 'Hors-ligne'
              : cloudSync.status === 'syncing' || cloudSync.status === 'loading'
                ? 'Synchro...'
                : cloudSync.status === 'error'
                  ? 'Erreur'
                  : 'Prêt',
        subtext: cloudSync.lastSyncAt
          ? `Dernière synchro : ${cloudSync.lastSyncAt}`
          : 'Partage temps réel activé',
        icon: Cloud,
        iconColor: cloudSync.status === 'error' ? '#F87171' : '#35C6D0',
      },
    ];
  }, [
    anomalyCount,
    cloudSync.lastSyncAt,
    cloudSync.revision,
    cloudSync.status,
    latestSnowDay,
    meta.snowCount,
    meta.stationCount,
    missingDaysCount,
    okCount,
    stations,
  ]);

  const handleLumiplanUpdate = () => {
    if (lumiplan.bulletins.length === 0) return;
    const { addedCount, updatedCount, skippedAnomalies } =
      lumiplan.onImportLumiplanSnow(lumiplan.bulletins);
    const skippedNames = skippedAnomalies.slice(0, 4).map((s) => s.name).join(', ');
    const more = skippedAnomalies.length > 4 ? ` (+${skippedAnomalies.length - 4})` : '';
    setUpdateFeedback({
      type: 'ok',
      text: `Lumiplan (${lumiplanVerifiedCount} fiables) : ${addedCount} relevé(s) ajouté(s), ${updatedCount} mis à jour. ${skippedAnomalies.length} bulletin(s) périmé(s)/suspect(s) écarté(s)${
        skippedNames ? ` (${skippedNames}${more})` : ''
      }.`,
    });
  };

  const handleSkiRadarEnrich = () => {
    const {
      updatedCount,
      priceAddedCount,
      addedSnowCount,
      updatedSnowCount,
      skippedSnowCount,
    } = skiRadar.onEnrichDatabase();
    setUpdateFeedback({
      type: 'ok',
      text: `SkiRadar : ${updatedCount} stations rapprochées · ${priceAddedCount} tarifs ≥ 2027 archivés · ${addedSnowCount} relevés neige ajoutés (${updatedSnowCount} mis à jour, ${skippedSnowCount} périmés ignorés).`,
    });
  };

  const handleSkiRadarImportMassif = () => {
    const { addedCount, enrichedCount, priceAddedCount, addedSnowCount } =
      skiRadar.onImportMassifToDatabase(selectedMassif, 'merge');
    const label =
      selectedMassif === 'ALL'
        ? 'tous les massifs'
        : MASSIF_LABELS[selectedMassif] ?? selectedMassif;
    setUpdateFeedback({
      type: 'ok',
      text: `Massif ${label} : ${addedCount} nouvelle(s) station(s), ${enrichedCount} enrichie(s) (${priceAddedCount} tarifs ≥ 2027) et ${addedSnowCount} relevé(s) neige incrémenté(s).`,
    });
  };

  const handleSkiinfoUpdate = () => {
    if (skiinfoResorts.length === 0) return;
    const { addedCount, updatedCount } = skiinfo.onImportSkiinfoSnow(skiinfoResorts);
    const regionLabel =
      SKIINFO_REGIONS.find((r) => r.id === skiinfoRegion)?.label ?? skiinfoRegion;
    setUpdateFeedback({
      type: 'ok',
      text: `Skiinfo (${regionLabel}) : ${addedCount} relevé(s) ajouté(s), ${updatedCount} mis à jour.`,
    });
  };

  const handleRunArchiveCatchup = async () => {
    setArchiveBusy(true);
    setUpdateFeedback(null);
    try {
      const res = await onCatchUpArchive(
        resolvedArchiveDates.startDate,
        resolvedArchiveDates.endDate
      );
      setUpdateFeedback({
        type: 'ok',
        text:
          res.addedCount > 0
            ? `Open-Meteo Archive (${res.startDate} → ${res.endDate}) : ${res.addedCount} relevé(s) manquant(s) ajouté(s) sur ${res.coveredStations} station(s) (${res.skippedExisting} existants préservés).`
            : `Aucun jour manquant entre ${res.startDate} et ${res.endDate} : votre base est déjà complète.`,
      });
    } catch (err) {
      setUpdateFeedback({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Erreur lors du rattrapage Open-Meteo Archive.',
      });
    } finally {
      setArchiveBusy(false);
    }
  };

  const handleImport = async () => {
    if (!stationsFile && !snowFile) {
      setErrorMsg('Sélectionnez au moins un fichier Excel (.xlsx) à importer.');
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      const stationsBuf = stationsFile ? await stationsFile.arrayBuffer() : null;
      const snowBuf = snowFile ? await snowFile.arrayBuffer() : null;

      const result = mergeExcelWorkbooks(stationsBuf, snowBuf, stations, snow);

      const nextMeta: DatasetMeta = {
        source: 'excel',
        stationsFileName: stationsFile?.name ?? meta.stationsFileName,
        snowFileName: snowFile?.name ?? meta.snowFileName,
        importedAt: new Date().toLocaleString('fr-FR'),
        stationCount: result.stations.length,
        snowCount: result.snow.length,
      };

      onImportComplete(result.stations, result.snow, nextMeta);
      setDiagnostics(result.diagnostics);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `Erreur d'import : ${err.message}`
          : 'Erreur lors de la lecture du fichier Excel.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <KpiStrip items={kpis} />

      {/* 1. Cloud Sync & Status strip */}
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Cloud className="h-4 w-4 text-[var(--accent)] shrink-0" />
            <span>Synchronisation Cloud PC ↔ Android & État de la base</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Toute mise à jour effectuée ici (Lumiplan, SkiRadar, Archive, nettoyage ou Excel) est enregistrée hors-ligne puis synchronisée automatiquement sur vos appareils et ceux de vos amis autorisés.
          </p>
          {cloudSync.error && (
            <p className="text-xs text-red-300">{cloudSync.error}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {cloudSync.canWrite && (
            <button
              type="button"
              disabled={cloudSync.status === 'syncing'}
              onClick={cloudSync.onSyncNow}
              className="inline-flex min-h-9 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${cloudSync.status === 'syncing' ? 'animate-spin' : ''}`}
              />
              <span>Synchroniser Cloud</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSkiRadar}
            className="inline-flex min-h-9 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <Compass className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
            <span>Consulter Enneigement</span>
          </button>
        </div>
      </div>

      {/* 2. Centralized Automatic Snow Updates */}
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
              Mises à jour de la base neige (toutes sources)
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Centralisez toutes vos mises à jour au même endroit : bulletins officiels (1×/semaine conseillé) ou rattrapage historique Open-Meteo Archive (1×/mois ou 1×/an).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* A. Lumiplan */}
          <div className="flex flex-col justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-4 space-y-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Snowflake className="h-4 w-4 text-sky-400 shrink-0" />
                  <span>Bulletins officiels Lumiplan</span>
                </div>
                <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                  {lumiplanVerifiedCount} fiables / {lumiplan.bulletins.length || LUMIPLAN_CATALOG.length}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Importe uniquement les relevés vérifiés ({lumiplanAnomalyCount} périmé{lumiplanAnomalyCount > 1 ? 's' : ''}/suspect{lumiplanAnomalyCount > 1 ? 's' : ''} écarté{lumiplanAnomalyCount > 1 ? 's' : ''} automatiquement).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={lumiplan.batchLoading}
                onClick={() => void lumiplan.onLoadAll()}
                className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${lumiplan.batchLoading ? 'animate-spin' : ''}`} />
                <span>Actualiser ({LUMIPLAN_CATALOG.length})</span>
              </button>
              <button
                type="button"
                disabled={lumiplanVerifiedCount === 0}
                onClick={handleLumiplanUpdate}
                className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-center text-xs font-semibold disabled:opacity-45 cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                <Snowflake className="h-3.5 w-3.5 shrink-0" />
                <span>Incrémenter ({lumiplanVerifiedCount} fiables)</span>
              </button>
            </div>
          </div>

          {/* B. SkiRadar */}
          <div className="flex flex-col justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-4 space-y-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Sparkles className="h-4 w-4 text-[var(--accent)] shrink-0" />
                  <span>Flux SkiRadar (315+ stations)</span>
                </div>
                <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                  {skiRadarStations.length} stations chargées
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Met à jour les hauteurs de neige, altitudes, tarifs ≥ 2027 et permet d’ajouter un massif complet à votre base.
              </p>
            </div>

            <div className="space-y-2">
              <select
                value={selectedMassif}
                onChange={(e) => setSelectedMassif(e.target.value)}
                aria-label="Choisir un massif SkiRadar à importer"
                className="h-9 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-3 text-xs text-[var(--text-primary)]"
              >
                <option value="ALL">Tous les massifs ({skiRadarStations.length})</option>
                {skiRadarMassifs.map(([key, count]) => (
                  <option key={key} value={key}>
                    {MASSIF_LABELS[key] ?? key} ({count})
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={skiRadar.loading}
                  onClick={skiRadar.onRefresh}
                  className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${skiRadar.loading ? 'animate-spin' : ''}`} />
                  <span>Actualiser</span>
                </button>
                <button
                  type="button"
                  disabled={skiRadarStations.length === 0}
                  onClick={handleSkiRadarEnrich}
                  className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-45 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                  <span>Enrichir ma base</span>
                </button>
                <button
                  type="button"
                  disabled={skiRadarStations.length === 0}
                  onClick={handleSkiRadarImportMassif}
                  className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-45 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-contrast)',
                  }}
                >
                  <Database className="h-3.5 w-3.5 shrink-0" />
                  <span>Ajouter ce massif</span>
                </button>
              </div>
            </div>
          </div>

          {/* C. Skiinfo */}
          <div className="flex flex-col justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-4 space-y-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Mountain className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Skiinfo / OnTheSnow</span>
                </div>
                <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                  {skiinfoResorts.length} ouverte(s)
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Récupère les hauteurs bas–sommet et chutes 24h des stations officiellement ouvertes par massif.
              </p>
            </div>

            <div className="space-y-2">
              <select
                value={skiinfoRegion}
                onChange={(e) => setSkiinfoRegion(e.target.value)}
                aria-label="Choisir un massif Skiinfo"
                className="h-9 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-3 text-xs text-[var(--text-primary)]"
              >
                {SKIINFO_REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={skiinfo.loading}
                  onClick={() => void skiinfo.onLoadRegion(skiinfoRegion)}
                  className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${skiinfo.loading ? 'animate-spin' : ''}`} />
                  <span>Charger ce massif</span>
                </button>
                <button
                  type="button"
                  disabled={skiinfoResorts.length === 0}
                  onClick={handleSkiinfoUpdate}
                  className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold disabled:opacity-45 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-contrast)',
                  }}
                >
                  <Snowflake className="h-3.5 w-3.5 shrink-0" />
                  <span>Incrémenter ({skiinfoResorts.length})</span>
                </button>
              </div>
            </div>
          </div>

          {/* D. Open-Meteo Archive Catchup (Mobile-safe sizing) */}
          <div className="flex flex-col justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)] p-4 space-y-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <History className="h-4 w-4 text-[var(--accent)] shrink-0" />
                  <span>Rattrapage Open-Meteo Archive</span>
                </div>
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] font-mono-num tabular-nums">
                Dernier rattrapage :{' '}
                <strong className="text-[var(--text-primary)]">
                  {meta.lastArchiveCatchupAt
                    ? new Date(meta.lastArchiveCatchupAt).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Jamais lancé'}
                </strong>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Comble uniquement les jours manquants (1×/mois ou 1×/an suffit) sans jamais écraser vos relevés existants.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-2.5 h-9 text-xs text-[var(--text-secondary)]">
                <CalendarRange className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                <select
                  value={archiveRange}
                  onChange={(e) =>
                    setArchiveRange(
                      e.target.value as 'since_last' | '7d' | '30d' | 'season'
                    )
                  }
                  aria-label="Période de rattrapage Open-Meteo Archive"
                  className="w-full min-w-0 bg-transparent text-xs text-[var(--text-primary)] focus:outline-none"
                >
                  <option value="since_last">Depuis la dernière MàJ</option>
                  <option value="7d">7 derniers jours</option>
                  <option value="30d">30 derniers jours</option>
                  <option value="season">Toute la saison 2026-27</option>
                </select>
              </div>

              <button
                type="button"
                disabled={archiveBusy}
                onClick={() => void handleRunArchiveCatchup()}
                className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-center text-xs font-semibold leading-snug disabled:opacity-50 cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${archiveBusy ? 'animate-spin' : ''}`} />
                <span>
                  {archiveBusy
                    ? 'Rattrapage en cours...'
                    : 'Combler les jours manquants (Archive)'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {updateFeedback && (
          <div
            className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-xs ${
              updateFeedback.type === 'ok'
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/40 bg-red-500/10 text-red-300'
            }`}
          >
            <div className="flex items-start gap-2 min-w-0">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="break-words">{updateFeedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setUpdateFeedback(null)}
              className="shrink-0 text-[11px] underline cursor-pointer"
            >
              Fermer
            </button>
          </div>
        )}
      </div>

      {/* 3. Control, Anomalies & Maintenance */}
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-amber-400 shrink-0" />
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Contrôle, anomalies & réparation de la base neige
              </h2>
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {anomalyCount > 0 ? (
                <>
                  <strong className="text-amber-300">{anomalyCount} anomalie(s)</strong> détectée(s) sur la saison 2026-27 ·{' '}
                  <strong className="text-emerald-400">{okCount} relevé(s) OK</strong> · {todaySnowCount} enregistré(s) aujourd’hui.
                </>
              ) : (
                <>
                  Base saine ({okCount} relevé(s) OK sur 2026-27 · {todaySnowCount} enregistré(s) aujourd’hui). Chaque action crée une sauvegarde automatique avant modification.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenMaintenance}
            className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-amber-500/45 bg-amber-500/15 px-3.5 py-1.5 text-center text-xs font-semibold leading-snug text-amber-200 hover:bg-amber-500/25 cursor-pointer"
          >
            <Wrench className="h-3.5 w-3.5 shrink-0" />
            <span>Ouvrir l’inspecteur & éditeur</span>
          </button>

          <button
            type="button"
            disabled={anomalyCount === 0}
            onClick={() => {
              const removed = onPurgeRecords(
                anomalyRows.map((r) => ({ station: r.station, day: r.day })),
                `Avant suppression de ${anomalyCount} anomalie(s)`
              );
              setMaintenanceFeedback(
                `${removed} relevé(s) avec anomalies supprimé(s) d’un coup. Les ${okCount} relevé(s) OK sont conservés.`
              );
            }}
            className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-orange-500/50 bg-orange-500/15 px-3.5 py-1.5 text-center text-xs font-semibold leading-snug text-orange-200 hover:bg-orange-500/25 disabled:opacity-40 cursor-pointer"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              Supprimer les anomalies ({anomalyCount}) · Garder {okCount} OK
            </span>
          </button>

          <button
            type="button"
            disabled={todaySnowCount === 0}
            onClick={() => {
              const removed = onPurgeToday();
              setMaintenanceFeedback(
                `${removed} relevé(s) du ${todayIso} supprimé(s). Votre base neige est revenue comme avant aujourd’hui.`
              );
            }}
            className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3.5 py-1.5 text-center text-xs font-medium leading-snug text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span>Revenir avant aujourd’hui ({todaySnowCount})</span>
          </button>
        </div>

        {maintenanceFeedback && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
            <div className="flex items-start gap-2 min-w-0">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{maintenanceFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setMaintenanceFeedback(null)}
              className="shrink-0 text-[11px] underline cursor-pointer"
            >
              Fermer
            </button>
          </div>
        )}
      </div>

      {/* 4. Excel Import / Export */}
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-4 sm:p-6">
        <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
          Import & export Excel (.xlsx)
        </h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed max-w-3xl">
          Les classeurs (<span className="font-mono-num">Ski_2026-27.xlsx</span> et{' '}
          <span className="font-mono-num">Neige_stations_Savoie_Hte-Savoie_Isère.xlsx</span>) sont lus localement dans votre navigateur, enregistrés hors-ligne et synchronisés sur votre Cloud Firebase.
        </p>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) setStationsFile(f);
            }}
            className="flex flex-col justify-between rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-page)] p-4 sm:p-5"
          >
            <div>
              <div className="flex items-center gap-2.5 text-sm font-semibold text-[var(--text-primary)]">
                <FileSpreadsheet className="h-4 w-4 text-[var(--accent)] shrink-0" />
                <span>Classeur Stations (Ski_2026-27.xlsx)</span>
              </div>
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                Feuille « Stations » (en-têtes ligne 2) : noms, départements, temps de trajet, altitudes, km de pistes, tarifs jour/6j et notes.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <input
                ref={stationsInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setStationsFile(f);
                }}
              />
              <button
                type="button"
                onClick={() => stationsInputRef.current?.click()}
                className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-[220px]">
                  {stationsFile ? stationsFile.name : 'Choisir le fichier Stations'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => downloadStationsTemplate(stations)}
                className="inline-flex h-9 items-center gap-1.5 text-xs text-[var(--accent)] hover:underline cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Modèle .xlsx</span>
              </button>
            </div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) setSnowFile(f);
            }}
            className="flex flex-col justify-between rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-page)] p-4 sm:p-5"
          >
            <div>
              <div className="flex items-center gap-2.5 text-sm font-semibold text-[var(--text-primary)]">
                <FileSpreadsheet className="h-4 w-4 text-sky-400 shrink-0" />
                <span>Classeur Neige (Neige_stations_...xlsx)</span>
              </div>
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                Une feuille par station : cellule B3 pour l’altitude du poste météo, puis relevés quotidiens dès la ligne 6 (Date, Saison, Sol, Max, Fraîche).
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <input
                ref={snowInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setSnowFile(f);
                }}
              />
              <button
                type="button"
                onClick={() => snowInputRef.current?.click()}
                className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-[220px]">
                  {snowFile ? snowFile.name : 'Choisir le fichier Neige'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => downloadSnowTemplate(snow)}
                className="inline-flex h-9 items-center gap-1.5 text-xs text-[var(--accent)] hover:underline cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Modèle .xlsx</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--border-hairline)] pt-4">
          <button
            type="button"
            disabled={busy || (!stationsFile && !snowFile)}
            onClick={handleImport}
            className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-2 rounded-lg px-4 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-45 cursor-pointer"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)',
            }}
          >
            <Upload className="h-3.5 w-3.5 shrink-0" />
            <span>{busy ? 'Analyse en cours...' : 'Importer les fichiers sélectionnés'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onRestoreSample();
              setStationsFile(null);
              setSnowFile(null);
              setDiagnostics(null);
              setErrorMsg(null);
            }}
            className="inline-flex min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            <span>Restaurer le jeu alpin préchargé</span>
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
            {errorMsg}
          </div>
        )}

        {diagnostics && (
          <div className="mt-4 rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-4 text-xs text-[var(--text-primary)]">
            <div className="flex items-center gap-2 font-semibold text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>Import Excel terminé et enregistré localement</span>
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono-num tabular-nums text-[var(--text-secondary)]">
              <div>Stations importées : {diagnostics.stationsImported || stations.length}</div>
              <div>Feuilles neige lues : {diagnostics.snowSheetsProcessed}</div>
              <div>Relevés quotidiens : {diagnostics.snowRecordsImported.toLocaleString('fr-FR')}</div>
              <div>Postes météo reliés : {diagnostics.matchedWeatherAltitudes}</div>
            </div>
            {diagnostics.ignoredSheets.length > 0 && (
              <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                Feuilles de synthèse ignorées : {diagnostics.ignoredSheets.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. PWA Install */}
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-4 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Smartphone className="h-4 w-4 text-[var(--accent)] shrink-0" />
            <span>Application mobile Android 16 & ordinateur (PWA hors-ligne)</span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Installez SKI PILOT directement sur votre smartphone Android 16 (Chrome &gt; Ajouter à l’écran d’accueil) ou sur PC Windows (Chrome / Edge) pour l’utiliser en plein écran sans connexion réseau en montagne.
          </p>
        </div>

        <PWAInstallButton compact />
      </div>
    </div>
  );
};
