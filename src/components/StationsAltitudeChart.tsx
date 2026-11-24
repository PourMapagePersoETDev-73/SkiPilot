import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StationRecord } from '../types';

interface StationsAltitudeChartProps {
  stations: StationRecord[];
  selectedStationName: string | null;
  onSelectStation: (stationName: string) => void;
}

type ChartMode = 'profile' | 'distribution';

interface ProfileDatum {
  name: string;
  shortName: string;
  base: number;
  drop: number;
  lowAlt: number;
  highAlt: number;
  obsAlt: number | null;
  km: number | null;
}

interface BucketDatum {
  tranche: string;
  AltBasse: number;
  AltHaute: number;
  PosteMeteo: number;
}

interface CustomTooltipPayloadItem {
  payload?: ProfileDatum;
}

const ProfileTooltip: React.FC<{
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
}> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-[var(--text-primary)]">{d.name}</div>
      <div className="mt-1 space-y-0.5 font-mono-num tabular-nums text-[var(--text-secondary)]">
        <div>
          Amplitude : <span className="text-[var(--text-primary)]">{d.lowAlt}–{d.highAlt} m</span>
        </div>
        <div>
          Dénivelé : <span className="text-[var(--accent)] font-semibold">{d.drop} m</span>
        </div>
        {d.obsAlt !== null && (
          <div>
            Poste météo : <span className="text-emerald-400">{Math.round(d.obsAlt)} m</span>
          </div>
        )}
        {d.km !== null && (
          <div>
            Domaine : <span className="text-[var(--text-primary)]">{Math.round(d.km)} km</span>
          </div>
        )}
      </div>
    </div>
  );
};

interface DistTooltipPayloadItem {
  name?: string;
  value?: number;
  color?: string;
}

const DistributionTooltip: React.FC<{
  active?: boolean;
  label?: string;
  payload?: DistTooltipPayloadItem[];
}> = ({ active, label, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-[var(--text-primary)]">{label}</div>
      <div className="mt-1 space-y-0.5 font-mono-num tabular-nums">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-semibold text-[var(--text-primary)]">
              {entry.value ?? 0} st.
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const StationsAltitudeChart: React.FC<StationsAltitudeChartProps> = ({
  stations,
  selectedStationName,
  onSelectStation,
}) => {
  const [mode, setMode] = useState<ChartMode>('profile');

  const profileData: ProfileDatum[] = useMemo(() => {
    return stations
      .filter((s) => s.low_alt !== null && s.high_alt !== null && s.high_alt >= s.low_alt)
      .sort((a, b) => (b.high_alt ?? 0) - (a.high_alt ?? 0))
      .slice(0, 24)
      .map((s) => {
        const low = Math.round(s.low_alt as number);
        const high = Math.round(s.high_alt as number);
        const raw = s.name.split('(')[0].trim();
        const shortName = raw.length > 14 ? `${raw.slice(0, 13)}…` : raw;
        return {
          name: s.name,
          shortName,
          base: low,
          drop: Math.max(40, high - low),
          lowAlt: low,
          highAlt: high,
          obsAlt: s.obs_alt,
          km: s.km,
        };
      });
  }, [stations]);

  const distributionData: BucketDatum[] = useMemo(() => {
    const brackets: Array<{ label: string; min: number; max: number }> = [
      { label: '< 1200 m', min: 0, max: 1199 },
      { label: '1200–1500 m', min: 1200, max: 1499 },
      { label: '1500–1800 m', min: 1500, max: 1799 },
      { label: '1800–2200 m', min: 1800, max: 2199 },
      { label: '2200–2600 m', min: 2200, max: 2599 },
      { label: '2600–3000 m', min: 2600, max: 2999 },
      { label: '3000+ m', min: 3000, max: 9999 },
    ];

    return brackets.map((b) => {
      let AltBasse = 0;
      let AltHaute = 0;
      let PosteMeteo = 0;
      for (const s of stations) {
        if (s.low_alt !== null && s.low_alt >= b.min && s.low_alt <= b.max) {
          AltBasse++;
        }
        if (s.high_alt !== null && s.high_alt >= b.min && s.high_alt <= b.max) {
          AltHaute++;
        }
        if (s.obs_alt !== null && s.obs_alt >= b.min && s.obs_alt <= b.max) {
          PosteMeteo++;
        }
      }
      return {
        tranche: b.label,
        AltBasse,
        AltHaute,
        PosteMeteo,
      };
    });
  }, [stations]);

  if (profileData.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-6 text-sm text-[var(--text-muted)]">
        Aucune station avec altitudes basse et haute renseignées dans la sélection actuelle.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] pb-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            {mode === 'profile'
              ? 'Profil altimétrique des domaines skiables (Base → Sommet)'
              : 'Distribution des altitudes par tranche (Base, Sommet & Poste météo)'}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {mode === 'profile'
              ? `Top ${profileData.length} sommets filtrés · cliquez sur une barre pour inspecter la station`
              : `Répartition sur ${stations.length} stations filtrées · seuils SKI PILOT (1500, 1800, 2500 m)`}
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-page)] p-1">
          <button
            type="button"
            onClick={() => setMode('profile')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'profile'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Profil Bas → Sommet
          </button>
          <button
            type="button"
            onClick={() => setMode('distribution')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'distribution'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Distribution par tranches
          </button>
        </div>
      </div>

      <div className="h-72 w-full">
        {mode === 'profile' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={profileData}
              margin={{ top: 10, right: 12, left: 0, bottom: 42 }}
            >
              <CartesianGrid
                stroke="var(--border-hairline)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="shortName"
                interval={0}
                angle={-32}
                textAnchor="end"
                height={55}
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                axisLine={{ stroke: 'var(--border-hairline)' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 3800]}
                unit=" m"
                tick={{
                  fill: 'var(--text-muted)',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                cursor={{ fill: 'var(--accent-soft)' }}
                content={<ProfileTooltip />}
              />
              <ReferenceLine
                y={1800}
                stroke="#38BDF8"
                strokeDasharray="4 4"
                strokeOpacity={0.55}
              />
              <ReferenceLine
                y={2500}
                stroke="#64C99A"
                strokeDasharray="4 4"
                strokeOpacity={0.55}
              />
              <Bar dataKey="base" stackId="alt" fill="transparent" isAnimationActive={false} />
              <Bar
                dataKey="drop"
                stackId="alt"
                radius={[4, 4, 4, 4]}
                onClick={(entry) => {
                  const name = (entry as unknown as ProfileDatum)?.name;
                  if (name) onSelectStation(name);
                }}
                className="cursor-pointer"
              >
                {profileData.map((d) => {
                  const isSelected = selectedStationName === d.name;
                  const fill = isSelected
                    ? '#F59E0B'
                    : d.highAlt >= 3000
                      ? '#38BDF8'
                      : d.highAlt >= 2500
                        ? '#2DD4BF'
                        : '#64C99A';
                  return (
                    <Cell
                      key={d.name}
                      fill={fill}
                      fillOpacity={selectedStationName && !isSelected ? 0.65 : 0.92}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={distributionData}
              margin={{ top: 10, right: 12, left: 0, bottom: 12 }}
            >
              <CartesianGrid
                stroke="var(--border-hairline)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="tranche"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border-hairline)' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{
                  fill: 'var(--text-muted)',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                cursor={{ fill: 'var(--accent-soft)' }}
                content={<DistributionTooltip />}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
              />
              <Bar
                dataKey="AltBasse"
                name="Altitude basse"
                fill="#38BDF8"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="AltHaute"
                name="Altitude haute"
                fill="#64C99A"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="PosteMeteo"
                name="Poste météo"
                fill="#A78BFA"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {mode === 'profile' && (
        <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-sky-400" />
            Sommet ≥ 3000 m
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-teal-400" />
            Sommet 2500–2999 m
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-400" />
            Sommet &lt; 2500 m
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-amber-400" />
            Station sélectionnée
          </span>
        </div>
      )}
    </div>
  );
};
