import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface KpiItem {
  label: string;
  value: string;
  subtext: string;
  icon: LucideIcon;
  iconColor: string;
  onClick?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

interface KpiStripProps {
  items: KpiItem[];
}

export const KpiStrip: React.FC<KpiStripProps> = ({ items }) => {
  const colsClass =
    items.length === 3
      ? 'grid-cols-1 sm:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4';

  return (
    <div className={`grid ${colsClass} gap-3`}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            onClick={item.onClick}
            className={`flex items-center gap-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-4 py-3.5 transition-colors ${
              item.onClick ? 'cursor-pointer hover:bg-[var(--bg-elevated)]' : ''
            }`}
          >
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-page)]"
              style={{ color: item.iconColor }}
            >
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--text-muted)] truncate">
                  {item.label}
                </span>
                {item.actionLabel && item.onAction && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      item.onAction?.();
                    }}
                    className="text-[11px] font-medium text-[var(--accent)] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {item.actionLabel}
                  </button>
                )}
              </div>
              <div className="mt-0.5 font-display text-lg font-bold text-[var(--text-primary)] font-mono-num tabular-nums truncate">
                {item.value}
              </div>
              <div
                className="mt-0.5 text-[11px] truncate font-mono-num tabular-nums"
                style={{ color: item.iconColor }}
              >
                {item.subtext}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
