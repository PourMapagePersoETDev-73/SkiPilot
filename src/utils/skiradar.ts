import {
  PriceHistoryEntry,
  SkiRadarFeedCache,
  SkiRadarStation,
  SnowRecord,
  StationRecord,
} from '../types';
import { DEFAULT_VILLAGE_SCORES, fmtTravel, stationKey } from './scoring';

const SKIRADAR_ENDPOINT = 'https://api.skiradar.fr/api/v1/geo-feed?niche=montagne&limit=500';

// La Biolle (73410) coordinates for estimated road time fallback
const LA_BIOLLE_LAT = 45.756;
const LA_BIOLLE_LNG = 5.928;

export const MASSIF_LABELS: Record<string, string> = {
  'alpes-du-nord': 'Alpes du Nord',
  'alpes-du-sud': 'Alpes du Sud',
  pyrenees: 'Pyrénées',
  jura: 'Jura',
  vosges: 'Vosges',
  'massif-central': 'Massif Central',
  corse: 'Corse',
};

const DEPT_MAP: Array<[RegExp, string]> = [
  [/Haute-Savoie/i, '74'],
  [/Savoie/i, '73'],
  [/Is[èe]re/i, '38'],
  [/Hautes-Alpes/i, '05'],
  [/Alpes-de-Haute-Provence/i, '04'],
  [/Alpes-Maritimes/i, '06'],
  [/Dr[ôo]me/i, '26'],
  [/Ain/i, '01'],
  [/Doubs/i, '25'],
  [/Jura/i, '39'],
  [/Vosges/i, '88'],
  [/Haut-Rhin/i, '68'],
  [/Bas-Rhin/i, '67'],
  [/Puy-de-D[ôo]me/i, '63'],
  [/Cantal/i, '15'],
  [/Ari[èe]ge/i, '09'],
  [/Hautes-Pyr[ée]n[ée]es/i, '65'],
  [/Pyr[ée]n[ée]es-Orientales/i, '66'],
  [/Pyr[ée]n[ée]es-Atlantiques/i, '64'],
  [/Haute-Garonne/i, '31'],
  [/Aude/i, '11'],
  [/Corse/i, '20'],
];

function extractDepartment(sr: SkiRadarStation): string {
  const resume = sr.resume ?? '';
  for (const [regex, code] of DEPT_MAP) {
    if (regex.test(resume)) return code;
  }
  return '';
}

function estimateTravelMinutesFromLaBiolle(
  geo?: { lat: number; lng: number } | null
): number | null {
  if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return null;
  const R = 6371;
  const dLat = ((geo.lat - LA_BIOLLE_LAT) * Math.PI) / 180;
  const dLng = ((geo.lng - LA_BIOLLE_LNG) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((LA_BIOLLE_LAT * Math.PI) / 180) *
      Math.cos((geo.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightKm = R * c;
  const roadKm = straightKm * 1.42;
  const mins = Math.max(20, Math.round(((roadKm / 58) * 60) / 5) * 5);
  return mins;
}

export async function fetchSkiRadarFeed(
  cached?: SkiRadarFeedCache | null
): Promise<{ cache: SkiRadarFeedCache; fromNotModified: boolean }> {
  const headers: HeadersInit = {};
  if (cached?.etag) {
    headers['If-None-Match'] = cached.etag;
  }

  const res = await fetch(SKIRADAR_ENDPOINT, { headers });

  if (res.status === 304 && cached) {
    return {
      cache: {
        ...cached,
        fetchedAt: new Date().toISOString(),
      },
      fromNotModified: true,
    };
  }

  if (!res.ok) {
    throw new Error(
      res.status === 503
        ? 'Service SkiRadar temporairement indisponible (503). Réessayez dans un instant.'
        : res.status === 429
          ? 'Limite de requêtes SkiRadar atteinte (30 req/min). Patientez quelques secondes.'
          : `Erreur réseau SkiRadar (${res.status}).`
    );
  }

  const data = await res.json();
  const etag = res.headers.get('ETag') ?? undefined;

  const cache: SkiRadarFeedCache = {
    version: String(data.version ?? ''),
    generatedAt: String(data.generatedAt ?? new Date().toISOString()),
    licence: String(
      data.licence ?? 'Données factuelles réutilisables avec attribution « skiradar.fr ».'
    ),
    total: Number(data.total ?? (Array.isArray(data.stations) ? data.stations.length : 0)),
    etag,
    fetchedAt: new Date().toISOString(),
    sources: data.sources ?? {},
    stations: Array.isArray(data.stations) ? data.stations : [],
  };

  return { cache, fromNotModified: false };
}

function parseSkiRadarPriceSeason(
  forfaits?: SkiRadarStation['forfaits']
): string | null {
  if (!forfaits) return null;
  if (forfaits.saison) {
    // e.g. "2026-2027" -> "2027", "2025-2026" -> "2026"
    const match = forfaits.saison.match(/(\d{4})\s*[-/]\s*(\d{4})/);
    if (match) return match[2];
    const single = forfaits.saison.match(/\b(20\d{2})\b/);
    if (single) return single[1];
  }
  if (forfaits.releveLe) {
    const dt = forfaits.releveLe.slice(0, 10);
    const y = parseInt(dt.slice(0, 4), 10);
    const m = parseInt(dt.slice(5, 7), 10);
    if (Number.isFinite(y) && Number.isFinite(m)) {
      return String(m >= 9 ? y + 1 : y);
    }
  }
  return '2027';
}

function ensureBaseline2026(st: StationRecord): PriceHistoryEntry[] {
  const existing = st.price_history ? [...st.price_history] : [];
  if (!existing.some((e) => e.season === '2026')) {
    existing.unshift({
      season: '2026',
      adult: st.adult,
      child: st.child,
      sixday: st.sixday,
      child6: st.child6,
      source: 'base-2026',
    });
  }
  return existing;
}

function mergePriceHistoryFromSkiRadar(
  st: StationRecord,
  sr: SkiRadarStation
): { price_history: PriceHistoryEntry[]; addedSeason: string | null } {
  const history = ensureBaseline2026(st);
  const f = sr.forfaits;
  if (
    !f ||
    (f.jourAdulte == null && f.jourEnfant == null && f.sixJoursAdulte == null)
  ) {
    return { price_history: history, addedSeason: null };
  }

  const targetSeason = parseSkiRadarPriceSeason(f);
  if (!targetSeason) return { price_history: history, addedSeason: null };

  // Never overwrite existing 2026 baseline prices from user's Excel/base
  const existingIdx = history.findIndex((h) => h.season === targetSeason);
  if (targetSeason === '2026' && existingIdx !== -1) {
    const base = history[existingIdx];
    if (base.adult !== null || base.sixday !== null) {
      return { price_history: history, addedSeason: null };
    }
  }

  const entry: PriceHistoryEntry = {
    season: targetSeason,
    adult: f.jourAdulte ?? null,
    child: f.jourEnfant ?? null,
    sixday: f.sixJoursAdulte ?? null,
    child6: null,
    source: f.source ? `skiradar (${f.source})` : 'skiradar',
    recordedAt: f.releveLe ? f.releveLe.slice(0, 10) : undefined,
  };

  if (existingIdx !== -1) {
    history[existingIdx] = entry;
  } else {
    history.push(entry);
  }
  history.sort((a, b) => a.season.localeCompare(b.season));

  return {
    price_history: history,
    addedSeason: targetSeason !== '2026' ? targetSeason : null,
  };
}

function toStationRecord(sr: SkiRadarStation): StationRecord {
  const key = stationKey(sr.name);
  const mins = estimateTravelMinutesFromLaBiolle(sr.geo);
  const km = sr.pistes?.km ?? sr.pistes?.kmDomaineRelie ?? null;
  const lowAlt = sr.altitudes?.bas ?? sr.altitudes?.village ?? null;
  const highAlt = sr.altitudes?.sommet ?? null;
  const obsAlt = sr.neigeObservee?.posteAltitude ?? null;
  const f = sr.forfaits;
  const srSeason = parseSkiRadarPriceSeason(f) ?? '2027';

  const price_history: PriceHistoryEntry[] = [];
  if (f && (f.jourAdulte != null || f.jourEnfant != null || f.sixJoursAdulte != null)) {
    price_history.push({
      season: srSeason,
      adult: f.jourAdulte ?? null,
      child: f.jourEnfant ?? null,
      sixday: f.sixJoursAdulte ?? null,
      child6: null,
      source: f.source ? `skiradar (${f.source})` : 'skiradar',
      recordedAt: f.releveLe ? f.releveLe.slice(0, 10) : undefined,
    });
  }

  return {
    name: sr.name,
    kind: sr.domaine ? 'Station / Domaine' : 'Station',
    department: extractDepartment(sr),
    domain: sr.pistes?.domaineRelie ?? sr.domaine ?? '',
    travel: mins !== null ? fmtTravel(null, mins) : '—',
    travel_min: mins,
    low_alt: lowAlt,
    high_alt: highAlt,
    km,
    adult: f?.jourAdulte ?? null,
    child: f?.jourEnfant ?? null,
    sixday: f?.sixJoursAdulte ?? null,
    child6: null,
    obs_alt: obsAlt,
    score_low: null,
    score_high: null,
    score_village: DEFAULT_VILLAGE_SCORES[key] ?? null,
    score_size: null,
    score_excel: null,
    skiradar_url: sr.url,
    skiradar_massif: sr.massif ?? undefined,
    price_history,
  };
}

function findMatchingSkiRadar(
  name: string,
  srByKey: Map<string, SkiRadarStation>
): SkiRadarStation | undefined {
  const k = stationKey(name);
  if (srByKey.has(k)) return srByKey.get(k);
  const trimmed = k.replace(/^l+/, '');
  if (srByKey.has(trimmed)) return srByKey.get(trimmed);
  for (const [srKey, val] of srByKey.entries()) {
    if (srKey.replace(/^l+/, '') === trimmed) return val;
  }
  return undefined;
}

/**
 * Enrichit les stations existantes SANS jamais écraser leurs altitudes, km, trajets ni tarifs de base 2026.
 * Ajoute les nouveaux tarifs (2027, 2028...) dans price_history pour le suivi historique.
 */
export function enrichStationsWithSkiRadar(
  existing: StationRecord[],
  srStations: SkiRadarStation[]
): { stations: StationRecord[]; updatedCount: number; priceAddedCount: number } {
  const srByKey = new Map<string, SkiRadarStation>();
  for (const sr of srStations) {
    srByKey.set(stationKey(sr.name), sr);
  }

  let updatedCount = 0;
  let priceAddedCount = 0;

  const next = existing.map((st) => {
    const match = findMatchingSkiRadar(st.name, srByKey);
    if (!match) {
      return st.price_history ? st : { ...st, price_history: ensureBaseline2026(st) };
    }

    updatedCount++;
    const { price_history, addedSeason } = mergePriceHistoryFromSkiRadar(st, match);
    if (addedSeason) priceAddedCount++;

    const srObsAlt = match.neigeObservee?.posteAltitude ?? null;

    return {
      ...st,
      // Altitudes, km, trajets, notes village et tarifs 2026 existants sont strictement préservés !
      department: st.department || extractDepartment(match),
      domain: st.domain || match.pistes?.domaineRelie || match.domaine || '',
      obs_alt: st.obs_alt ?? srObsAlt,
      skiradar_url: match.url,
      skiradar_massif: match.massif ?? st.skiradar_massif,
      price_history,
    };
  });

  return { stations: next, updatedCount, priceAddedCount };
}

export function getSkiRadarBulletinAnomaly(sr: SkiRadarStation): string | null {
  const n = sr.neige;
  if (!n || !n.releveLe) return null;
  const releveDay = n.releveLe.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(releveDay)) return null;

  const ground = Math.max(n.basCm ?? 0, n.hautCm ?? 0);
  if (n.derniereChute) {
    const chuteDay = n.derniereChute.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(chuteDay)) {
      const t1 = Date.parse(`${chuteDay}T00:00:00Z`);
      const t2 = Date.parse(`${releveDay}T00:00:00Z`);
      if (Number.isFinite(t1) && Number.isFinite(t2)) {
        const diffDays = Math.round((t2 - t1) / 86400000);
        if (diffDays > 45) {
          return `Dernière chute ancienne (${chuteDay})`;
        }
      }
    }
  } else if (ground >= 40 && n.statut !== 'ouvert') {
    return 'Hauteur non confirmée (station non ouverte et sans date de chute)';
  }

  return null;
}

/**
 * Incrémente l'historique neige avec les nouveaux relevés datés fiables du bulletin SkiRadar
 * sans toucher aux relevés des années passées ni importer de bulletins périmés.
 */
export function incrementSnowWithSkiRadar(
  existingSnow: SnowRecord[],
  existingStations: StationRecord[],
  srStations: SkiRadarStation[]
): {
  snow: SnowRecord[];
  addedSnowCount: number;
  updatedSnowCount: number;
  skippedSnowCount: number;
} {
  const stationNameByKey = new Map<string, string>();
  for (const st of existingStations) {
    stationNameByKey.set(stationKey(st.name).replace(/^l+/, ''), st.name);
  }

  const nextSnow = [...existingSnow];
  const indexByStationDay = new Map<string, number>();
  const latestGroundByStation = new Map<string, { day: string; ground: number }>();

  nextSnow.forEach((row, idx) => {
    const key = `${row.station}__${row.day}`;
    indexByStationDay.set(key, idx);
    if (row.ground !== null) {
      const prev = latestGroundByStation.get(row.station);
      if (!prev || row.day > prev.day) {
        latestGroundByStation.set(row.station, { day: row.day, ground: row.ground });
      }
    }
  });

  let addedSnowCount = 0;
  let updatedSnowCount = 0;
  let skippedSnowCount = 0;

  for (const sr of srStations) {
    const n = sr.neige;
    if (!n || !n.releveLe) continue;

    const day = n.releveLe.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;

    const bas = n.basCm ?? null;
    const haut = n.hautCm ?? null;
    if (bas === null && haut === null) continue;

    const ground = Math.max(bas ?? 0, haut ?? 0);
    if (ground === 0 && n.statut !== 'ouvert') continue;

    if (getSkiRadarBulletinAnomaly(sr) !== null) {
      skippedSnowCount++;
      continue;
    }

    const srNormKey = stationKey(sr.name).replace(/^l+/, '');
    const targetStationName = stationNameByKey.get(srNormKey) ?? sr.name;

    const year = parseInt(day.slice(0, 4), 10);
    const month = parseInt(day.slice(5, 7), 10);
    const season = month >= 9 ? year + 1 : year;
    const obsAlt = sr.neigeObservee?.posteAltitude ?? null;

    const mapKey = `${targetStationName}__${day}`;
    const existingIdx = indexByStationDay.get(mapKey);

    const prevRecord = latestGroundByStation.get(targetStationName);
    const fresh =
      prevRecord && prevRecord.day < day && ground > prevRecord.ground
        ? Math.round(ground - prevRecord.ground)
        : 0;

    if (existingIdx !== undefined) {
      // Met à jour uniquement les relevés récents (à partir de la saison 2026-27)
      if (day >= '2026-09-01' && nextSnow[existingIdx].ground !== ground) {
        nextSnow[existingIdx] = {
          ...nextSnow[existingIdx],
          ground,
          max_depth: Math.max(nextSnow[existingIdx].max_depth ?? 0, ground),
          obs_alt: nextSnow[existingIdx].obs_alt ?? obsAlt,
        };
        updatedSnowCount++;
      }
    } else {
      indexByStationDay.set(mapKey, nextSnow.length);
      nextSnow.push({
        station: targetStationName,
        day,
        season,
        ground,
        max_depth: ground,
        fresh,
        obs_alt: obsAlt,
      });
      addedSnowCount++;
    }
  }

  return { snow: nextSnow, addedSnowCount, updatedSnowCount, skippedSnowCount };
}

export function importSkiRadarToDatabase(
  existing: StationRecord[],
  srStations: SkiRadarStation[],
  massifFilter: string,
  mode: 'merge' | 'replace'
): {
  stations: StationRecord[];
  addedCount: number;
  enrichedCount: number;
  priceAddedCount: number;
} {
  const scoped =
    massifFilter === 'ALL'
      ? srStations
      : srStations.filter((s) => s.massif === massifFilter);

  if (mode === 'replace') {
    const replaced = scoped.map(toStationRecord);
    return {
      stations: replaced,
      addedCount: replaced.length,
      enrichedCount: 0,
      priceAddedCount: 0,
    };
  }

  const { stations: enriched, updatedCount, priceAddedCount } =
    enrichStationsWithSkiRadar(existing, scoped);
  const existingKeys = new Set(
    enriched.map((s) => stationKey(s.name).replace(/^l+/, ''))
  );

  let addedCount = 0;
  const appended: StationRecord[] = [...enriched];
  for (const sr of scoped) {
    const k = stationKey(sr.name).replace(/^l+/, '');
    if (existingKeys.has(k)) continue;
    existingKeys.add(k);
    appended.push(toStationRecord(sr));
    addedCount++;
  }

  return {
    stations: appended,
    addedCount,
    enrichedCount: updatedCount,
    priceAddedCount,
  };
}
