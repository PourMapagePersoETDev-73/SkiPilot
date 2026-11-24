import React from 'react';

interface RankBadgeProps {
  rank: number;
}

export const RankBadge: React.FC<RankBadgeProps> = ({ rank }) => {
  const num = String(rank).padStart(2, '0');

  if (rank === 1) {
    return (
      <span
        className="inline-flex w-12 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold font-mono-num tabular-nums"
        style={{ backgroundColor: 'rgba(245, 158, 11, 0.16)', color: '#FBBF24' }}
      >
        <span aria-hidden="true">🥇</span>
        <span>{num}</span>
      </span>
    );
  }

  if (rank === 2) {
    return (
      <span
        className="inline-flex w-12 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold font-mono-num tabular-nums"
        style={{ backgroundColor: 'rgba(148, 163, 184, 0.18)', color: '#E2E8F0' }}
      >
        <span aria-hidden="true">🥈</span>
        <span>{num}</span>
      </span>
    );
  }

  if (rank === 3) {
    return (
      <span
        className="inline-flex w-12 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold font-mono-num tabular-nums"
        style={{ backgroundColor: 'rgba(217, 119, 6, 0.18)', color: '#F59E0B' }}
      >
        <span aria-hidden="true">🥉</span>
        <span>{num}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex w-12 shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold font-mono-num tabular-nums text-[var(--text-muted)]">
      {num}
    </span>
  );
};
