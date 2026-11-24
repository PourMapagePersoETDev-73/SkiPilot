import React from 'react';
import {
  ArrowUpCircle,
  BarChart3,
  Cloud,
  Compass,
  Database,
  Mountain,
  RefreshCw,
  ShieldCheck,
  Snowflake,
  TrendingUp,
} from 'lucide-react';
import { APP_VERSION, APP_VERSION_DATE } from '../version';
import { CloudSyncStatus, DatasetMeta, TabId } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface SidebarProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  meta: DatasetMeta;
  departureSubtitle?: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  cloudSync?: {
    status: CloudSyncStatus;
    revision?: number;
    lastSyncAt?: string;
    error: string | null;
    canWrite: boolean;
    onSyncNow: () => void;
  };
  updateInfo?: {
    updateAvailable: boolean;
    remoteVersion: string | null;
    checking: boolean;
    statusMessage: string | null;
    onCheckUpdates: () => void;
    onApplyUpdate: () => void;
  };
}

const NAV_ITEMS: Array<{ id: TabId; label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'skiradar', label: 'Enneigement', description: 'Bulletins live & SkiRadar', icon: Compass },
  { id: 'stations', label: 'Stations', description: 'Répertoire & comparateur', icon: Mountain },
  { id: 'snow_ranking', label: 'Classement neige', description: 'TOP 20 par date / semaine', icon: Snowflake },
  { id: 'personal', label: 'Mon classement', description: 'Scores & pondérations', icon: BarChart3 },
  { id: 'history', label: 'Historique', description: 'Courbe d’enneigement', icon: TrendingUp },
  { id: 'import', label: 'Gestion des données', description: 'MàJ neige, Archive, Cloud & Excel', icon: Database },
  { id: 'access', label: 'Accès & Amis', description: 'Protection & partage', icon: ShieldCheck },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  meta,
  departureSubtitle,
  mobileOpen,
  onCloseMobile,
  cloudSync,
  updateInfo,
}) => {
  const navContent = (
    <div className="flex h-full flex-col justify-between overflow-y-auto p-4">
      <div>
        <div className="mb-6 flex items-center gap-3 px-2 pt-1">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
            style={{
              backgroundColor: 'var(--accent-soft)',
              borderColor: 'var(--border-hairline)',
              color: 'var(--accent)',
            }}
          >
            <Mountain className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap">
              SKI PILOT
            </div>
            <div className="text-xs text-[var(--text-muted)] whitespace-nowrap truncate max-w-[160px]">
              {departureSubtitle || 'Comparateur alpin'}
            </div>
          </div>
        </div>

        <nav className="space-y-1" aria-label="Navigation principale">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  isActive
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-tight whitespace-nowrap truncate">
                    {item.label}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] leading-tight truncate mt-0.5">
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3 border-t border-[var(--border-hairline)] pt-4 px-2">
        <div className="space-y-1.5">
          <PWAInstallButton />
          <div className="flex items-center justify-between px-1 text-[11px] text-[var(--text-muted)] font-mono-num tabular-nums">
            <span>Version {APP_VERSION}</span>
            <span>{APP_VERSION_DATE}</span>
          </div>

          {updateInfo && (
            <div className="pt-0.5 space-y-1">
              {updateInfo.updateAvailable ? (
                <button
                  type="button"
                  onClick={updateInfo.onApplyUpdate}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/45 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
                >
                  <ArrowUpCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Installer MàJ{updateInfo.remoteVersion ? ` (${updateInfo.remoteVersion})` : ''}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={updateInfo.checking}
                  onClick={updateInfo.onCheckUpdates}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`h-3 w-3 ${updateInfo.checking ? 'animate-spin' : ''}`} />
                  <span>
                    {updateInfo.checking ? 'Vérification...' : 'Vérifier les mises à jour'}
                  </span>
                </button>
              )}

              {updateInfo.statusMessage && (
                <div className="px-1 text-center text-[10px] text-[var(--text-muted)]">
                  {updateInfo.statusMessage}
                </div>
              )}
            </div>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-[var(--text-secondary)]">
            {meta.source === 'excel'
              ? 'Base Excel importée'
              : meta.source === 'skiradar'
                ? 'Base enrichie SkiRadar'
                : 'Jeu de données alpin'}
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)] font-mono-num tabular-nums">
            {meta.stationCount} stations · {meta.snowCount.toLocaleString('fr-FR')} relevés
          </div>
          {cloudSync && (
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1 truncate">
                <Cloud
                  className={`h-3 w-3 shrink-0 ${
                    cloudSync.status === 'synced'
                      ? 'text-emerald-400'
                      : cloudSync.status === 'error'
                        ? 'text-red-400'
                        : 'text-[var(--accent)]'
                  }`}
                />
                <span className="truncate">
                  {cloudSync.status === 'synced'
                    ? `Cloud OK${cloudSync.revision ? ` (#${cloudSync.revision})` : ''}`
                    : cloudSync.status === 'syncing' || cloudSync.status === 'loading'
                      ? 'Synchro Cloud...'
                      : cloudSync.status === 'offline'
                        ? 'Hors-ligne'
                        : cloudSync.status === 'error'
                          ? 'Erreur Cloud'
                          : 'Cloud prêt'}
                </span>
              </span>
              {cloudSync.canWrite && (
                <button
                  type="button"
                  onClick={cloudSync.onSyncNow}
                  className="shrink-0 text-[10px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Synchro
                </button>
              )}
            </div>
          )}
          {meta.stationsFileName && (
            <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]" title={meta.stationsFileName}>
              {meta.stationsFileName}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:flex md:sticky md:top-0 md:h-screen md:flex-col w-64 shrink-0 border-r border-[var(--border-hairline)] bg-[var(--bg-panel)]">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[80vw] border-r border-[var(--border-hairline)] bg-[var(--bg-panel)]">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
};
