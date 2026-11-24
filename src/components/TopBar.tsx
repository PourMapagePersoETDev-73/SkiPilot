import React from 'react';
import { ArrowUpCircle, Database, Menu } from 'lucide-react';
import { TabId, ThemeName } from '../types';

interface TopBarProps {
  activeTab: TabId;
  theme: ThemeName;
  onChangeTheme: (theme: ThemeName) => void;
  onOpenImport: () => void;
  onOpenMobileMenu: () => void;
  updateInfo?: {
    updateAvailable: boolean;
    remoteVersion: string | null;
    onApplyUpdate: () => void;
  };
}

const TAB_TITLES: Record<TabId, string> = {
  personal: 'Mon classement personnalisé',
  snow_ranking: 'Classement neige historique',
  stations: 'Stations et domaines skiables',
  history: 'Historique et courbe d’enneigement',
  skiradar: 'Enneigement — Bulletins live',
  import: 'Gestion des données',
  access: 'Accès privé, profil & partage amis',
};

const THEMES: ThemeName[] = ['Dark Blue', 'Light', 'Alpine Green', 'Midnight Purple'];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  theme,
  onChangeTheme,
  onOpenImport,
  onOpenMobileMenu,
  updateInfo,
}) => {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-[var(--border-hairline)] bg-[var(--bg-panel)] px-4 sm:px-6 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Ouvrir le menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="hidden sm:inline text-[var(--text-muted)] whitespace-nowrap">
            SKI PILOT
          </span>
          <span className="hidden sm:inline text-[var(--text-muted)]" aria-hidden="true">
            /
          </span>
          <h1 className="font-display text-base sm:text-lg font-semibold text-[var(--text-primary)] truncate">
            {TAB_TITLES[activeTab]}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {updateInfo?.updateAvailable && (
          <button
            type="button"
            onClick={updateInfo.onApplyUpdate}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/45 bg-emerald-500/15 px-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer whitespace-nowrap"
          >
            <ArrowUpCircle className="h-3.5 w-3.5 shrink-0" />
            <span>
              Mettre à jour{updateInfo.remoteVersion ? ` (${updateInfo.remoteVersion})` : ''}
            </span>
          </button>
        )}

        <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="hidden md:inline whitespace-nowrap">Thème</span>
          <select
            value={theme}
            onChange={(e) => onChangeTheme(e.target.value as ThemeName)}
            aria-label="Sélectionner le thème"
            className="h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] px-2.5 text-xs font-medium text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {activeTab !== 'import' && (
          <button
            type="button"
            onClick={onOpenImport}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 sm:px-3.5 text-xs font-semibold transition-opacity hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)',
            }}
          >
            <Database className="h-3.5 w-3.5 shrink-0" />
            <span className="sm:hidden">Données</span>
            <span className="hidden sm:inline">Gestion données</span>
          </button>
        )}
      </div>
    </header>
  );
};
