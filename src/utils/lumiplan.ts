import {
  LumiplanBulletin,
  LumiplanSector,
  OpenMeteoArchiveStationResult,
  OpenMeteoSnowReport,
  SkiinfoResortRow,
  SkiRadarStation,
  SnowBulletinReliability,
  SnowRecord,
  StationRecord,
} from '../types';
import { stationKey } from './scoring';
import { getSkiRadarBulletinAnomaly } from './skiradar';

export interface LumiplanCatalogItem {
  slug: string;
  name: string;
  department: string;
}

export const LUMIPLAN_CATALOG: LumiplanCatalogItem[] = [
  { slug: 'la-plagne', name: 'La Plagne', department: '73' },
  { slug: 'les-arcs', name: 'Les Arcs', department: '73' },
  { slug: 'tignes', name: 'Tignes', department: '73' },
  { slug: 'val-d-isere', name: "Val d'Isère", department: '73' },
  { slug: 'val-thorens', name: 'Val Thorens', department: '73' },
  { slug: 'les-menuires', name: 'Les Menuires', department: '73' },
  { slug: 'meribel', name: 'Méribel', department: '73' },
  { slug: 'courchevel', name: 'Courchevel', department: '73' },
  { slug: 'la-rosiere', name: 'La Rosière', department: '73' },
  { slug: 'sainte-foy-tarentaise', name: 'Sainte Foy Tarentaise', department: '73' },
  { slug: 'valmorel', name: 'Valmorel', department: '73' },
  { slug: 'saint-francois-longchamp', name: 'St François Longchamp', department: '73' },
  { slug: 'les-saisies', name: 'Les Saisies', department: '73' },
  { slug: 'areches-beaufort', name: 'Arêches-Beaufort', department: '73' },
  { slug: 'valloire', name: 'Valloire', department: '73' },
  { slug: 'valmeinier', name: 'Valmeinier', department: '73' },
  { slug: 'le-corbier', name: 'Le Corbier', department: '73' },
  { slug: 'la-toussuire', name: 'La Toussuire', department: '73' },
  { slug: 'aussois', name: 'Aussois', department: '73' },
  { slug: 'bonneval-sur-arc', name: 'Bonneval-sur-Arc', department: '73' },
  { slug: 'flaine', name: 'Flaine', department: '74' },
  { slug: 'la-clusaz', name: 'La Clusaz', department: '74' },
  { slug: 'megeve', name: 'Megève', department: '74' },
  { slug: 'chamonix', name: 'Chamonix', department: '74' },
  { slug: 'morzine', name: 'Morzine', department: '74' },
  { slug: 'les-gets', name: 'Les Gets', department: '74' },
  { slug: 'chatel', name: 'Châtel', department: '74' },
  { slug: 'samoens', name: 'Samoëns', department: '74' },
  { slug: 'villard-de-lans', name: 'Villard de Lans', department: '38' },
  { slug: 'vars', name: 'Vars', department: '05' },
  { slug: 'risoul', name: 'Risoul', department: '05' },
];

async function parseJsonOrThrow<T>(res: Response, fallbackMsg: string): Promise<T> {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(
      'Passerelle serveur indisponible sur hébergement statique (GitHub Pages).'
    );
  }
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error || `${fallbackMsg} (${res.status})`);
  }
  return body as T;
}

export async function fetchLumiplanSingle(slug: string): Promise<LumiplanBulletin> {
  const clean = slug.trim().toLowerCase();
  const res = await fetch(`./api/lumiplan?station=${encodeURIComponent(clean)}`);
  return parseJsonOrThrow<LumiplanBulletin>(res, 'Erreur Lumiplan');
}

export async function fetchLumiplanBatch(
  slugs: string[]
): Promise<{ bulletins: LumiplanBulletin[]; errors: Array<{ slug: string; error: string }> }> {
  const clean = Array.from(new Set(slugs.map((s) => s.trim().toLowerCase()).filter(Boolean)));
  if (clean.length === 0) return { bulletins: [], errors: [] };

  const allBulletins: LumiplanBulletin[] = [];
  const allErrors: Array<{ slug: string; error: string }> = [];

  for (let i = 0; i < clean.length; i += 32) {
    const chunk = clean.slice(i, i + 32);
    const res = await fetch(
      `./api/lumiplan/batch?stations=${encodeURIComponent(chunk.join(','))}`
    );
    const body = await parseJsonOrThrow<{
      bulletins?: LumiplanBulletin[];
      errors?: Array<{ slug: string; error: string }>;
    }>(res, 'Erreur réseau Lumiplan');
    if (Array.isArray(body.bulletins)) {
      allBulletins.push(...body.bulletins);
    }
    if (Array.isArray(body.errors)) {
      allErrors.push(...body.errors);
    }
  }

  return { bulletins: allBulletins, errors: allErrors };
}

function daysBetweenIso(olderIso: string, newerIso: string): number {
  const t1 = Date.parse(`${olderIso}T00:00:00Z`);
  const t2 = Date.parse(`${newerIso}T00:00:00Z`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0;
  return Math.round((t2 - t1) / 86400000);
}

export function evaluateLumiplanBulletin(b: LumiplanBulletin): {
  reliability: SnowBulletinReliability;
  reasons: string[];
} {
  if (b.reliability) {
    return {
      reliability: b.reliability,
      reasons: b.anomalyReasons ?? [],
    };
  }

  const refDate = b.updatedDate ?? new Date().toISOString().slice(0, 10);
  const refMonth = Number(refDate.slice(5, 7));
  const isEarlySeason = refMonth >= 9 || refMonth <= 1;
  const reasons: string[] = [];

  const freshSectors = b.sectors.filter((s) => {
    if (s.snowTotalCm === null || s.isStaleSector) return false;
    if (s.snowQuality && /printemps/i.test(s.snowQuality) && isEarlySeason && s.snowTotalCm > 0) {
      return false;
    }
    if (s.lastSnowfallDate && /^\d{4}-\d{2}-\d{2}$/.test(s.lastSnowfallDate)) {
      return daysBetweenIso(s.lastSnowfallDate, refDate) <= 45;
    }
    return false;
  });

  if (freshSectors.length > 0) {
    return { reliability: 'verified', reasons };
  }

  const hasSpring = b.sectors.some(
    (s) => s.snowQuality && /printemps/i.test(s.snowQuality) && isEarlySeason && (s.snowTotalCm ?? 0) > 0
  );
  if (hasSpring) {
    reasons.push('Qualité « De printemps » incohérente avec la saison');
    return { reliability: 'stale', reasons };
  }

  const hasOldFall = b.sectors.some(
    (s) =>
      s.lastSnowfallDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(s.lastSnowfallDate) &&
      daysBetweenIso(s.lastSnowfallDate, refDate) > 45
  );
  if (hasOldFall) {
    reasons.push('Date de dernière chute ancienne (> 45 jours)');
    return { reliability: 'stale', reasons };
  }

  if ((b.maxSnowCm ?? 0) >= 30) {
    reasons.push('Aucune date de dernière chute renseignée pour valider la hauteur');
    return { reliability: 'suspect', reasons };
  }

  return { reliability: 'suspect', reasons: ['Aucune hauteur de neige vérifiable'] };
}

function pickBestSector(
  sectors: LumiplanSector[],
  targetAlt: number | null,
  onlyFresh = true
): LumiplanSector | null {
  const valid = sectors.filter((s) => {
    if (s.snowTotalCm === null) return false;
    if (onlyFresh && s.isStaleSector) return false;
    return true;
  });
  const pool = valid.length > 0 ? valid : sectors.filter((s) => s.snowTotalCm !== null);
  if (pool.length === 0) return sectors[0] ?? null;

  // Prefer sectors that actually carry a snowfall date when filtering to valid sectors
  const datedPool = onlyFresh
    ? pool.filter((s) => s.lastSnowfallDate && /^\d{4}-\d{2}-\d{2}$/.test(s.lastSnowfallDate))
    : pool;
  const activePool = datedPool.length > 0 ? datedPool : pool;

  if (targetAlt === null) {
    return [...activePool].sort((a, b) => (b.altitudeM ?? 0) - (a.altitudeM ?? 0))[0];
  }
  return [...activePool].sort(
    (a, b) =>
      Math.abs((a.altitudeM ?? targetAlt) - targetAlt) -
      Math.abs((b.altitudeM ?? targetAlt) - targetAlt)
  )[0];
}

export interface LumiplanImportResult {
  snow: SnowRecord[];
  addedCount: number;
  updatedCount: number;
  skippedAnomalies: Array<{
    name: string;
    slug: string;
    reliability: SnowBulletinReliability;
    reasons: string[];
  }>;
}

export function incrementSnowWithLumiplan(
  existingSnow: SnowRecord[],
  existingStations: StationRecord[],
  bulletins: LumiplanBulletin[],
  options?: { forcedSlugs?: string[] }
): LumiplanImportResult {
  const forcedSet = new Set((options?.forcedSlugs ?? []).map((s) => s.toLowerCase()));
  const stationByKey = new Map<string, StationRecord>();
  for (const st of existingStations) {
    stationByKey.set(stationKey(st.name).replace(/^l+/, ''), st);
  }

  const catalogNameBySlug = new Map<string, string>();
  for (const c of LUMIPLAN_CATALOG) {
    catalogNameBySlug.set(c.slug, c.name);
  }

  const nextSnow = [...existingSnow];
  const indexByStationDay = new Map<string, number>();
  nextSnow.forEach((row, idx) => {
    indexByStationDay.set(`${row.station}__${row.day}`, idx);
  });

  let addedCount = 0;
  let updatedCount = 0;
  const skippedAnomalies: LumiplanImportResult['skippedAnomalies'] = [];

  for (const b of bulletins) {
    const day = b.updatedDate;
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;

    const catalogName = catalogNameBySlug.get(b.slug) ?? b.slug;
    const normSlugKey = stationKey(catalogName).replace(/^l+/, '');
    const matchedStation = stationByKey.get(normSlugKey);
    const targetName = matchedStation?.name ?? catalogName;

    const { reliability, reasons } = evaluateLumiplanBulletin(b);
    if (reliability !== 'verified' && !forcedSet.has(b.slug.toLowerCase())) {
      skippedAnomalies.push({
        name: targetName,
        slug: b.slug,
        reliability,
        reasons,
      });
      continue;
    }

    const targetAlt = matchedStation?.obs_alt ?? matchedStation?.high_alt ?? null;
    const chosen = pickBestSector(b.sectors, targetAlt, !forcedSet.has(b.slug.toLowerCase()));
    const ground = chosen?.snowTotalCm ?? b.maxSnowCm;
    if (ground === null) continue;

    const fresh =
      chosen?.snowFreshCm != null && chosen.lastSnowfallDate === day
        ? chosen.snowFreshCm
        : 0;
    const obsAlt = chosen?.altitudeM ?? matchedStation?.obs_alt ?? null;

    const year = parseInt(day.slice(0, 4), 10);
    const month = parseInt(day.slice(5, 7), 10);
    const season = month >= 9 ? year + 1 : year;

    const key = `${targetName}__${day}`;
    const existingIdx = indexByStationDay.get(key);

    if (existingIdx !== undefined) {
      if (day >= '2026-09-01' && nextSnow[existingIdx].ground !== ground) {
        nextSnow[existingIdx] = {
          ...nextSnow[existingIdx],
          ground,
          max_depth: Math.max(nextSnow[existingIdx].max_depth ?? 0, ground),
          fresh: fresh > 0 ? fresh : nextSnow[existingIdx].fresh,
          obs_alt: nextSnow[existingIdx].obs_alt ?? obsAlt,
        };
        updatedCount++;
      }
    } else {
      indexByStationDay.set(key, nextSnow.length);
      nextSnow.push({
        station: targetName,
        day,
        season,
        ground,
        max_depth: ground,
        fresh,
        obs_alt: obsAlt,
      });
      addedCount++;
    }
  }

  return { snow: nextSnow, addedCount, updatedCount, skippedAnomalies };
}

export interface SnowRecordAnomaly {
  station: string;
  day: string;
  ground: number | null;
  fresh: number | null;
  obs_alt: number | null;
  severity: 'critical' | 'warning' | 'ok';
  reason: string | null;
}

export function detectSnowDatabaseAnomalies(
  snow: SnowRecord[],
  lumiplanBulletins: LumiplanBulletin[],
  srStations: SkiRadarStation[]
): SnowRecordAnomaly[] {
  const lumiByStationKey = new Map<string, LumiplanBulletin>();
  const catalogNameBySlug = new Map(LUMIPLAN_CATALOG.map((c) => [c.slug, c.name]));

  for (const b of lumiplanBulletins) {
    const name = catalogNameBySlug.get(b.slug) ?? b.title ?? b.slug;
    lumiByStationKey.set(stationKey(name).replace(/^l+/, ''), b);
  }

  const srByKey = new Map<string, SkiRadarStation>();
  for (const sr of srStations) {
    srByKey.set(stationKey(sr.name).replace(/^l+/, ''), sr);
  }

  const recent = snow.filter((r) => r.day >= '2026-09-01');
  const results: SnowRecordAnomaly[] = recent.map((r) => {
    const norm = stationKey(r.station).replace(/^l+/, '');
    const lumi = lumiByStationKey.get(norm);
    if (lumi) {
      const { reliability, reasons } = evaluateLumiplanBulletin(lumi);
      if (reliability === 'stale') {
        return {
          station: r.station,
          day: r.day,
          ground: r.ground,
          fresh: r.fresh,
          obs_alt: r.obs_alt,
          severity: 'critical',
          reason: reasons[0] ?? 'Bulletin Lumiplan périmé (saison précédente)',
        };
      }
      if (reliability === 'suspect') {
        return {
          station: r.station,
          day: r.day,
          ground: r.ground,
          fresh: r.fresh,
          obs_alt: r.obs_alt,
          severity: 'warning',
          reason: reasons[0] ?? 'Bulletin Lumiplan sans date de dernière chute',
        };
      }
    }

    const sr = srByKey.get(norm);
    if (sr) {
      const srAnomaly = getSkiRadarBulletinAnomaly(sr);
      if (srAnomaly && r.day === sr.neige?.releveLe?.slice(0, 10)) {
        return {
          station: r.station,
          day: r.day,
          ground: r.ground,
          fresh: r.fresh,
          obs_alt: r.obs_alt,
          severity: 'critical',
          reason: `SkiRadar : ${srAnomaly}`,
        };
      }
    }

    if (
      r.day >= '2026-09-01' &&
      r.day <= '2026-12-05' &&
      (r.ground ?? 0) >= 165 &&
      (r.fresh ?? 0) === 0 &&
      !lumi
    ) {
      return {
        station: r.station,
        day: r.day,
        ground: r.ground,
        fresh: r.fresh,
        obs_alt: r.obs_alt,
        severity: 'warning',
        reason: `Hauteur élevée (${r.ground} cm) en début de saison sans neige fraîche`,
      };
    }

    return {
      station: r.station,
      day: r.day,
      ground: r.ground,
      fresh: r.fresh,
      obs_alt: r.obs_alt,
      severity: 'ok',
      reason: null,
    };
  });

  const order = { critical: 0, warning: 1, ok: 2 } as const;
  return results.sort((a, b) => {
    const diff = order[a.severity] - order[b.severity];
    if (diff !== 0) return diff;
    if (a.day !== b.day) return b.day.localeCompare(a.day);
    return a.station.localeCompare(b.station, 'fr');
  });
}

export async function fetchSkiinfoRegion(region: string): Promise<{
  region: string;
  fetchedAt: string;
  resorts: SkiinfoResortRow[];
}> {
  const res = await fetch(`./api/skiinfo?region=${encodeURIComponent(region)}`);
  return parseJsonOrThrow(res, 'Erreur Skiinfo');
}

export async function fetchOpenMeteoSnow(
  lat: number,
  lng: number,
  elevationM: number
): Promise<OpenMeteoSnowReport> {
  const elev = Math.round(elevationM);
  try {
    const res = await fetch(
      `./api/openmeteo?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(
        lng
      )}&elevation=${encodeURIComponent(elev)}`
    );
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      return (await res.json()) as OpenMeteoSnowReport;
    }
  } catch {
    // Fallback to direct Open-Meteo CORS API on static hosting (GitHub Pages)
  }

  const directRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&elevation=${elev}&current=snow_depth,temperature_2m&hourly=freezing_level_height&daily=snowfall_sum&timezone=Europe/Paris&forecast_days=4`
  );
  if (!directRes.ok) {
    throw new Error(`Erreur Open-Meteo (${directRes.status})`);
  }
  const raw = await directRes.json();
  const snowDepthMeters =
    typeof raw?.current?.snow_depth === 'number' ? raw.current.snow_depth : null;
  const tempC =
    typeof raw?.current?.temperature_2m === 'number'
      ? Math.round(raw.current.temperature_2m * 10) / 10
      : null;
  const freezingArr: unknown[] = Array.isArray(raw?.hourly?.freezing_level_height)
    ? raw.hourly.freezing_level_height
    : [];
  const freezingVal = freezingArr.find((v) => typeof v === 'number');
  const dailyDates: string[] = Array.isArray(raw?.daily?.time) ? raw.daily.time : [];
  const dailySnow: unknown[] = Array.isArray(raw?.daily?.snowfall_sum)
    ? raw.daily.snowfall_sum
    : [];
  return {
    latitude: Number(raw?.latitude ?? lat),
    longitude: Number(raw?.longitude ?? lng),
    elevationM: Number(raw?.elevation ?? elev),
    fetchedAt: new Date().toISOString(),
    snowDepthCm: snowDepthMeters !== null ? Math.round(snowDepthMeters * 100) : null,
    tempC,
    freezingLevelM: typeof freezingVal === 'number' ? Math.round(freezingVal) : null,
    daily: dailyDates.map((d, i) => ({
      date: String(d),
      snowfallCm:
        typeof dailySnow[i] === 'number'
          ? Math.round((dailySnow[i] as number) * 10) / 10
          : null,
    })),
  };
}

export function incrementSnowWithSkiinfo(
  existingSnow: SnowRecord[],
  existingStations: StationRecord[],
  resorts: SkiinfoResortRow[]
): { snow: SnowRecord[]; addedCount: number; updatedCount: number } {
  const stationByKey = new Map<string, StationRecord>();
  for (const st of existingStations) {
    stationByKey.set(stationKey(st.name).replace(/^l+/, ''), st);
  }

  const nextSnow = [...existingSnow];
  const indexByStationDay = new Map<string, number>();
  nextSnow.forEach((row, idx) => {
    indexByStationDay.set(`${row.station}__${row.day}`, idx);
  });

  const day = new Date().toISOString().slice(0, 10);
  const year = parseInt(day.slice(0, 4), 10);
  const month = parseInt(day.slice(5, 7), 10);
  const season = month >= 9 ? year + 1 : year;

  let addedCount = 0;
  let updatedCount = 0;

  for (const r of resorts) {
    const ground = r.snowHighCm ?? r.snowLowCm;
    if (ground === null) continue;

    const normKey = stationKey(r.name).replace(/^l+/, '');
    const matched = stationByKey.get(normKey);
    const targetName = matched?.name ?? r.name;
    const obsAlt = matched?.obs_alt ?? matched?.high_alt ?? null;
    const fresh = r.fresh24hCm ?? 0;

    const mapKey = `${targetName}__${day}`;
    const existingIdx = indexByStationDay.get(mapKey);

    if (existingIdx !== undefined) {
      if (day >= '2026-09-01' && nextSnow[existingIdx].ground !== ground) {
        nextSnow[existingIdx] = {
          ...nextSnow[existingIdx],
          ground,
          max_depth: Math.max(nextSnow[existingIdx].max_depth ?? 0, ground),
          fresh: fresh > 0 ? fresh : nextSnow[existingIdx].fresh,
          obs_alt: nextSnow[existingIdx].obs_alt ?? obsAlt,
        };
        updatedCount++;
      }
    } else {
      indexByStationDay.set(mapKey, nextSnow.length);
      nextSnow.push({
        station: targetName,
        day,
        season,
        ground,
        max_depth: ground,
        fresh,
        obs_alt: obsAlt,
      });
      addedCount++;
    }
  }

  return { snow: nextSnow, addedCount, updatedCount };
}

export async function catchUpSnowWithOpenMeteoArchive(params: {
  existingSnow: SnowRecord[];
  existingStations: StationRecord[];
  skiRadarStations: SkiRadarStation[];
  startDate: string;
  endDate: string;
}): Promise<{
  snow: SnowRecord[];
  addedCount: number;
  coveredStations: number;
  skippedExisting: number;
}> {
  const { existingSnow, existingStations, skiRadarStations, startDate, endDate } = params;

  const srByNormKey = new Map<string, SkiRadarStation>();
  for (const sr of skiRadarStations) {
    if (sr.geo && Number.isFinite(sr.geo.lat) && Number.isFinite(sr.geo.lng)) {
      srByNormKey.set(stationKey(sr.name).replace(/^l+/, ''), sr);
    }
  }

  // Match all stations in the user's database (plus any tracked in snow history) to coordinates
  const targetsMap = new Map<
    string,
    { name: string; lat: number; lng: number; elevation: number }
  >();

  for (const st of existingStations) {
    const norm = stationKey(st.name).replace(/^l+/, '');
    const sr = srByNormKey.get(norm);
    if (!sr?.geo) continue;
    const elev =
      st.obs_alt ??
      st.high_alt ??
      sr.neigeObservee?.posteAltitude ??
      sr.altitudes?.sommet ??
      sr.altitudes?.bas ??
      1800;
    targetsMap.set(st.name, {
      name: st.name,
      lat: sr.geo.lat,
      lng: sr.geo.lng,
      elevation: Math.max(300, Math.min(4000, Math.round(elev))),
    });
  }

  for (const row of existingSnow) {
    if (targetsMap.has(row.station)) continue;
    const norm = stationKey(row.station).replace(/^l+/, '');
    const sr = srByNormKey.get(norm);
    if (!sr?.geo) continue;
    const elev =
      row.obs_alt ??
      sr.neigeObservee?.posteAltitude ??
      sr.altitudes?.sommet ??
      sr.altitudes?.bas ??
      1800;
    targetsMap.set(row.station, {
      name: row.station,
      lat: sr.geo.lat,
      lng: sr.geo.lng,
      elevation: Math.max(300, Math.min(4000, Math.round(elev))),
    });
  }

  const targets = Array.from(targetsMap.values());
  if (targets.length === 0) {
    throw new Error(
      'Aucune station géolocalisée trouvée : actualisez d’abord le flux SkiRadar.'
    );
  }

  const archiveResults: OpenMeteoArchiveStationResult[] = [];
  for (let i = 0; i < targets.length; i += 100) {
    const batch = targets.slice(i, i + 100);
    let handledViaBackend = false;
    try {
      const res = await fetch('./api/openmeteo/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stations: batch,
          startDate,
          endDate,
        }),
      });
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body?.error || `Erreur Open-Meteo Archive (${res.status})`);
        }
        if (Array.isArray(body.results)) {
          archiveResults.push(...(body.results as OpenMeteoArchiveStationResult[]));
        }
        handledViaBackend = true;
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Erreur Open-Meteo Archive')) {
        throw err;
      }
    }

    if (!handledViaBackend) {
      for (let j = 0; j < batch.length; j += 45) {
        const sub = batch.slice(j, j + 45);
        const lats = sub.map((s) => s.lat.toFixed(4)).join(',');
        const lngs = sub.map((s) => s.lng.toFixed(4)).join(',');
        const elevs = sub.map((s) => Math.round(s.elevation)).join(',');
        const directRes = await fetch(
          `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lngs}&elevation=${elevs}&start_date=${encodeURIComponent(
            startDate
          )}&end_date=${encodeURIComponent(
            endDate
          )}&daily=snowfall_sum,snow_depth_max&timezone=Europe/Paris`
        );
        if (!directRes.ok) {
          throw new Error(`Erreur Open-Meteo Archive (${directRes.status})`);
        }
        const raw = await directRes.json();
        const entries = Array.isArray(raw) ? raw : [raw];
        sub.forEach((st, idx) => {
          const entry = entries[idx] ?? {};
          const times: unknown[] = Array.isArray(entry?.daily?.time) ? entry.daily.time : [];
          const depths: unknown[] = Array.isArray(entry?.daily?.snow_depth_max)
            ? entry.daily.snow_depth_max
            : [];
          const falls: unknown[] = Array.isArray(entry?.daily?.snowfall_sum)
            ? entry.daily.snowfall_sum
            : [];
          archiveResults.push({
            name: st.name,
            elevationM: Math.round(st.elevation),
            daily: times.map((d, k) => {
              const depthM = typeof depths[k] === 'number' ? (depths[k] as number) : null;
              const fallCm = typeof falls[k] === 'number' ? (falls[k] as number) : null;
              return {
                date: String(d),
                snowDepthCm: depthM !== null ? Math.max(0, Math.round(depthM * 100)) : null,
                snowfallCm: fallCm !== null ? Math.max(0, Math.round(fallCm)) : null,
              };
            }),
          });
        });
      }
    }
  }

  const existingKeys = new Set<string>();
  for (const row of existingSnow) {
    existingKeys.add(`${row.station}__${row.day}`);
  }

  const nextSnow = [...existingSnow];
  let addedCount = 0;
  let skippedExisting = 0;
  const coveredSet = new Set<string>();

  for (const entry of archiveResults) {
    for (const d of entry.daily) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
      if (d.snowDepthCm === null && d.snowfallCm === null) continue;

      const key = `${entry.name}__${d.date}`;
      if (existingKeys.has(key)) {
        skippedExisting++;
        continue;
      }

      const year = parseInt(d.date.slice(0, 4), 10);
      const month = parseInt(d.date.slice(5, 7), 10);
      const season = month >= 9 ? year + 1 : year;
      const ground = d.snowDepthCm ?? 0;
      const fresh = d.snowfallCm ?? 0;

      existingKeys.add(key);
      nextSnow.push({
        station: entry.name,
        day: d.date,
        season,
        ground,
        max_depth: ground,
        fresh,
        obs_alt: entry.elevationM,
      });
      addedCount++;
      coveredSet.add(entry.name);
    }
  }

  return {
    snow: nextSnow,
    addedCount,
    coveredStations: coveredSet.size > 0 ? coveredSet.size : archiveResults.length,
    skippedExisting,
  };
}


