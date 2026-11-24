import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

type SnowBulletinReliability = 'verified' | 'suspect' | 'stale';

interface LumiplanSector {
  sector: string;
  altitudeM: number | null;
  snowTotalCm: number | null;
  snowQuality: string | null;
  snowFreshCm: number | null;
  lastSnowfallDate: string | null;
  tempMorningC: number | null;
  tempAfternoonC: number | null;
  windKmh: number | null;
  avalancheRisk: number | null;
  isStaleSector: boolean;
  staleReason: string | null;
}

interface LumiplanBulletin {
  slug: string;
  title: string;
  sourceUrl: string;
  updatedLabel: string | null;
  updatedDate: string | null;
  fetchedAt: string;
  sectors: LumiplanSector[];
  maxSnowCm: number | null;
  minSnowCm: number | null;
  maxFreshCm: number | null;
  pistesOpen: number | null;
  pistesTotal: number | null;
  liftsOpen: number | null;
  liftsTotal: number | null;
  forecastToday: string | null;
  advisoryText: string | null;
  latestSnowfallDate: string | null;
  reliability: SnowBulletinReliability;
  anomalyReasons: string[];
}

interface CacheEntry {
  expiresAt: number;
  data: LumiplanBulletin;
}

const SLUG_REGEX = /^[a-z0-9-]{2,64}$/;
const SKIINFO_REGIONS = new Set([
  'alpes-du-nord',
  'alpes-du-sud',
  'pyrenees',
  'vosges',
  'jura',
  'massif-central',
]);
const CACHE_TTL_MS = 5 * 60 * 1000;
const lumiplanCache = new Map<string, CacheEntry>();

interface SkiinfoResortRow {
  name: string;
  region: string;
  url: string;
  snowLowCm: number | null;
  snowHighCm: number | null;
  liftsOpen: number | null;
  liftsTotal: number | null;
  pistesOpen: number | null;
  pistesTotal: number | null;
  fresh24hCm: number | null;
  fresh7dCm: number | null;
}

const skiinfoCache = new Map<
  string,
  { expiresAt: number; data: { region: string; fetchedAt: string; resorts: SkiinfoResortRow[] } }
>();

interface OpenMeteoSnowReport {
  latitude: number;
  longitude: number;
  elevationM: number;
  fetchedAt: string;
  snowDepthCm: number | null;
  tempC: number | null;
  freezingLevelM: number | null;
  daily: Array<{ date: string; snowfallCm: number | null }>;
}

const openMeteoCache = new Map<string, { expiresAt: number; data: OpenMeteoSnowReport }>();

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#x27;|&apos;/gi, "'")
    .replace(/&eacute;/gi, 'é')
    .replace(/&egrave;/gi, 'è')
    .replace(/&ecirc;/gi, 'ê')
    .replace(/&agrave;/gi, 'à')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePairCount(text: string): [number | null, number | null] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/(\d+|-)\s*\/\s*(\d+|-)/);
  if (!m) return [null, null];
  const a = m[1] === '-' ? null : Number(m[1]);
  const b = m[2] === '-' ? null : Number(m[2]);
  return [Number.isFinite(a) ? a : null, Number.isFinite(b) ? b : null];
}

function parseSnowRange(text: string): [number | null, number | null] {
  const mRange = text.match(/(\d+)\s*-\s*(\d+)\s*cm/i);
  if (mRange) return [Number(mRange[1]), Number(mRange[2])];
  const mSingle = text.match(/(\d+)\s*cm/i);
  if (mSingle) return [Number(mSingle[1]), Number(mSingle[1])];
  return [null, null];
}

function parseSingleCm(text: string): number | null {
  const m = text.match(/(\d+)\s*cm/i);
  return m ? Number(m[1]) : null;
}

function parseSkiinfoHtml(region: string, html: string): SkiinfoResortRow[] {
  const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '');
  const rowMatches = cleanHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);
  const resorts: SkiinfoResortRow[] = [];
  const seen = new Set<string>();

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1];
    const thMatch = rowHtml.match(/<th\b[^>]*>[\s\S]*?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/th>/i);
    if (!thMatch) continue;

    const tds = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      decodeEntities(m[1])
    );
    if (tds.length < 5) continue;

    const href = thMatch[1];
    const name = decodeEntities(thMatch[2]);
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const [snowLowCm, snowHighCm] = parseSnowRange(tds[0]);
    const [liftsOpen, liftsTotal] = parsePairCount(tds[1]);
    const [pistesOpen, pistesTotal] = parsePairCount(tds[2]);
    const fresh24hCm = parseSingleCm(tds[3]);
    const fresh7dCm = parseSingleCm(tds[4]);

    resorts.push({
      name,
      region,
      url: href.startsWith('http') ? href : `https://www.skiinfo.fr${href}`,
      snowLowCm,
      snowHighCm,
      liftsOpen,
      liftsTotal,
      pistesOpen,
      pistesTotal,
      fresh24hCm,
      fresh7dCm,
    });
  }

  return resorts;
}

async function fetchSkiinfoRegionData(region: string) {
  const now = Date.now();
  const cached = skiinfoCache.get(region);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const targetUrl = `https://www.skiinfo.fr/${encodeURIComponent(region)}/bulletin-neige`;
  const response = await fetch(targetUrl, {
    signal: AbortSignal.timeout(5500),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SKI-PILOT/2.5)',
      Accept: 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`Skiinfo a répondu avec le statut ${response.status}`);
  }

  const html = await response.text();
  const resorts = parseSkiinfoHtml(region, html);
  const payload = {
    region,
    fetchedAt: new Date().toISOString(),
    resorts,
  };
  skiinfoCache.set(region, { expiresAt: now + CACHE_TTL_MS, data: payload });
  return payload;
}

async function fetchOpenMeteoData(lat: number, lng: number, elevation: number): Promise<OpenMeteoSnowReport> {
  const key = `${lat.toFixed(3)}_${lng.toFixed(3)}_${Math.round(elevation)}`;
  const now = Date.now();
  const cached = openMeteoCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&elevation=${Math.round(
    elevation
  )}&current=snow_depth,temperature_2m&hourly=freezing_level_height&daily=snowfall_sum&timezone=Europe/Paris&forecast_days=4`;

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    throw new Error(`Open-Meteo a répondu avec le statut ${response.status}`);
  }

  const raw = await response.json();
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

  const daily = dailyDates.map((d, i) => ({
    date: String(d),
    snowfallCm:
      typeof dailySnow[i] === 'number'
        ? Math.round((dailySnow[i] as number) * 10) / 10
        : null,
  }));

  const report: OpenMeteoSnowReport = {
    latitude: Number(raw?.latitude ?? lat),
    longitude: Number(raw?.longitude ?? lng),
    elevationM: Number(raw?.elevation ?? elevation),
    fetchedAt: new Date().toISOString(),
    snowDepthCm:
      snowDepthMeters !== null ? Math.round(snowDepthMeters * 100) : null,
    tempC,
    freezingLevelM:
      typeof freezingVal === 'number' ? Math.round(freezingVal) : null,
    daily,
  };

  openMeteoCache.set(key, { expiresAt: now + 10 * 60 * 1000, data: report });
  return report;
}

interface ArchiveStationInput {
  name: string;
  lat: number;
  lng: number;
  elevation: number;
}

interface ArchiveStationOutput {
  name: string;
  elevationM: number;
  daily: Array<{
    date: string;
    snowDepthCm: number | null;
    snowfallCm: number | null;
  }>;
}

async function fetchOpenMeteoArchiveChunk(
  stations: ArchiveStationInput[],
  startDate: string,
  endDate: string
): Promise<ArchiveStationOutput[]> {
  if (stations.length === 0) return [];
  const lats = stations.map((s) => s.lat.toFixed(4)).join(',');
  const lngs = stations.map((s) => s.lng.toFixed(4)).join(',');
  const elevs = stations.map((s) => Math.round(s.elevation)).join(',');

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lngs}&elevation=${elevs}&start_date=${encodeURIComponent(
    startDate
  )}&end_date=${encodeURIComponent(
    endDate
  )}&daily=snowfall_sum,snow_depth_max&timezone=Europe/Paris`;

  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    throw new Error(`Open-Meteo Archive a répondu avec le statut ${response.status}`);
  }

  const raw = await response.json();
  const entries = Array.isArray(raw) ? raw : [raw];

  return stations.map((st, idx) => {
    const entry = entries[idx] ?? {};
    const times: unknown[] = Array.isArray(entry?.daily?.time) ? entry.daily.time : [];
    const depths: unknown[] = Array.isArray(entry?.daily?.snow_depth_max)
      ? entry.daily.snow_depth_max
      : [];
    const falls: unknown[] = Array.isArray(entry?.daily?.snowfall_sum)
      ? entry.daily.snowfall_sum
      : [];

    const daily = times.map((d, i) => {
      const depthM = typeof depths[i] === 'number' ? (depths[i] as number) : null;
      const fallCm = typeof falls[i] === 'number' ? (falls[i] as number) : null;
      return {
        date: String(d),
        snowDepthCm: depthM !== null ? Math.max(0, Math.round(depthM * 100)) : null,
        snowfallCm: fallCm !== null ? Math.max(0, Math.round(fallCm)) : null,
      };
    });

    return {
      name: st.name,
      elevationM: Math.round(st.elevation),
      daily,
    };
  });
}

const FRENCH_MONTHS: Record<string, string> = {
  janvier: '01',
  janv: '01',
  fevrier: '02',
  février: '02',
  fevr: '02',
  févr: '02',
  mars: '03',
  avril: '04',
  avr: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  juil: '07',
  aout: '08',
  août: '08',
  septembre: '09',
  sept: '09',
  octobre: '10',
  oct: '10',
  novembre: '11',
  nov: '11',
  decembre: '12',
  décembre: '12',
  dec: '12',
  déc: '12',
};

function frDateToIso(text: string | null, referenceIso?: string): string | null {
  if (!text) return null;
  const clean = text.trim();

  // Standard DD/MM/YYYY
  const numericMatch = clean.match(/(\d{1,2})\/(\d{2})\/(\d{4})/);
  if (numericMatch) {
    const dd = numericMatch[1].padStart(2, '0');
    return `${numericMatch[3]}-${numericMatch[2]}-${dd}`;
  }

  // French textual date e.g. "Mercredi 1 avril", "dimanche 06 avril 2025", "1er avril"
  const textMatch = clean
    .toLowerCase()
    .match(
      /\b(\d{1,2})(?:er)?\s+(janvier|janv\.?|f[eé]vrier|f[eé]vr\.?|mars|avril|avr\.?|mai|juin|juillet|juil\.?|ao[uû]t|septembre|sept\.?|octobre|oct\.?|novembre|nov\.?|d[eé]cembre|d[eé]c\.?)(?:\s+(20\d{2}))?/i
    );
  if (!textMatch) return null;

  const dd = textMatch[1].padStart(2, '0');
  const monthKey = textMatch[2].replace(/\.$/, '').toLowerCase();
  const mm = FRENCH_MONTHS[monthKey];
  if (!mm) return null;

  if (textMatch[3]) {
    return `${textMatch[3]}-${mm}-${dd}`;
  }

  const ref = referenceIso && /^\d{4}-\d{2}-\d{2}$/.test(referenceIso)
    ? referenceIso
    : new Date().toISOString().slice(0, 10);
  const refYear = Number(ref.slice(0, 4));
  const candidateSameYear = `${refYear}-${mm}-${dd}`;
  return candidateSameYear <= ref ? candidateSameYear : `${refYear - 1}-${mm}-${dd}`;
}

function daysBetweenIso(olderIso: string, newerIso: string): number {
  const t1 = Date.parse(`${olderIso}T00:00:00Z`);
  const t2 = Date.parse(`${newerIso}T00:00:00Z`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0;
  return Math.round((t2 - t1) / 86400000);
}

function parseLumiplanHtml(slug: string, html: string, sourceUrl: string): LumiplanBulletin {
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]) : slug;

  const majMatch = html.match(/<span class="intro_maj">([^<]*)<\/span>/i);
  const updatedLabel = majMatch ? decodeEntities(majMatch[1]) : null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const updatedDate = frDateToIso(updatedLabel, todayIso) ?? todayIso;
  const refMonth = Number(updatedDate.slice(5, 7));
  const isEarlySeason = refMonth >= 9 || refMonth <= 1;

  const cards = html.split(/<div class="meteo_card[^"]*">/i).slice(1);
  const sectors: LumiplanSector[] = [];

  for (const card of cards) {
    const sectorMatch = card.match(/<h2 class="bloc_title_text">([^<]+)<\/h2>/i);
    if (!sectorMatch) continue;
    const sector = decodeEntities(sectorMatch[1]);
    if (/Prévisions|Conseil/i.test(sector)) continue;

    const altMatch = card.match(/<h2>\s*-?\s*(\d{3,4})\s*m\s*<\/h2>/i);
    const altitudeM = altMatch ? Number(altMatch[1]) : null;

    const morningMatch = card.match(/>Matin<\/span>\s*<span class="text">\s*(-?\d+)\s*°C/i);
    const afternoonMatch = card.match(/>Après-midi<\/span>\s*<span class="text">\s*(-?\d+)\s*°C/i);
    const windMatch = card.match(/wind\.svg[^>]*>\s*<span class="subtext">\s*(\d+)\s*km\/h/i);

    const snowMatch = card.match(
      /image_neige\.svg[^>]*>\s*<span class="text">\s*(\d+)\s*cm\s*<\/span>\s*<span class="[^"]*">\s*([^<]*)<\/span>/i
    );
    const freshMatch = card.match(
      /calendrier_neige\.svg[^>]*>\s*<span class="text">\s*(\d+)\s*cm\s*<\/span>\s*<span class="[^"]*">\s*([^<]*)<\/span>/i
    );
    const avMatch = card.match(/avalanche_score[^>]*>\s*<span class="bold">\s*(\d)\s*<\/span>\s*\/5/i);

    const hasMetric =
      altitudeM !== null || snowMatch !== null || freshMatch !== null || morningMatch !== null;
    if (!hasMetric) continue;

    const snowQualityRaw = snowMatch ? decodeEntities(snowMatch[2]) : '';
    const lastFallRaw = freshMatch ? decodeEntities(freshMatch[2]) : '';
    const lastSnowfallIso = frDateToIso(lastFallRaw, updatedDate);
    const snowTotalCm = snowMatch ? Number(snowMatch[1]) : null;
    const snowFreshCm = freshMatch ? Number(freshMatch[1]) : null;

    let isStaleSector = false;
    let staleReason: string | null = null;

    if (
      snowQualityRaw &&
      /printemps/i.test(snowQualityRaw) &&
      isEarlySeason &&
      (snowTotalCm ?? 0) > 0
    ) {
      isStaleSector = true;
      staleReason = `Neige « ${snowQualityRaw} » incompatible avec la période`;
    } else if (lastSnowfallIso && /^\d{4}-\d{2}-\d{2}$/.test(lastSnowfallIso)) {
      const ageDays = daysBetweenIso(lastSnowfallIso, updatedDate);
      if (ageDays > 45) {
        isStaleSector = true;
        staleReason = `Dernière chute ancienne (${lastSnowfallIso}, il y a ${ageDays} j)`;
      } else if (ageDays < -2) {
        isStaleSector = true;
        staleReason = `Date de chute incohérente (${lastSnowfallIso})`;
      }
    }

    sectors.push({
      sector,
      altitudeM,
      snowTotalCm,
      snowQuality: snowQualityRaw || null,
      snowFreshCm,
      lastSnowfallDate: lastSnowfallIso ?? (lastFallRaw || null),
      tempMorningC: morningMatch ? Number(morningMatch[1]) : null,
      tempAfternoonC: afternoonMatch ? Number(afternoonMatch[1]) : null,
      windKmh: windMatch ? Number(windMatch[1]) : null,
      avalancheRisk: avMatch ? Number(avMatch[1]) : null,
      isStaleSector,
      staleReason,
    });
  }

  const poiMatches = html.matchAll(
    /image\/type\/([A-Z0-9_]+)\.svg[\s\S]{0,450}?image\/etats\/([a-z0-9_]+)\.svg/gi
  );
  let pistesOpen = 0;
  let pistesTotal = 0;
  let liftsOpen = 0;
  let liftsTotal = 0;

  for (const m of poiMatches) {
    const typeName = m[1].toUpperCase();
    const statusName = m[2].toLowerCase();
    const isOpen = statusName.includes('opened');

    if (
      /CHAIRLIFT|GONDOLA|TRAM|FUNITEL|FUNICULAR|DRAG_LIFT|MAGIC_CARPET|ROPE_TOW|TELE/.test(
        typeName
      )
    ) {
      liftsTotal++;
      if (isOpen) liftsOpen++;
    } else if (/DOWNHILL_SKIING|CROSS_COUNTRY|FUN_ZONE/.test(typeName)) {
      pistesTotal++;
      if (isOpen) pistesOpen++;
    }
  }

  const forecastMatch = html.match(
    /<div class="titre_prevision">Bulletin du jour<\/div>\s*<div class="text_prevision">([\s\S]*?)<\/div>/i
  );
  const advisoryMatch = html.match(
    /<div class="titre_prevision">Conseil du jour<\/div>\s*<div class="text_prevision">([\s\S]*?)<\/div>/i
  );
  const forecastToday = forecastMatch ? decodeEntities(forecastMatch[1]) : null;
  const advisoryText = advisoryMatch ? decodeEntities(advisoryMatch[1]) : null;

  const snowValues = sectors
    .map((s) => s.snowTotalCm)
    .filter((v): v is number => v !== null);
  const freshValues = sectors
    .map((s) => s.snowFreshCm)
    .filter((v): v is number => v !== null);

  const maxSnowCm = snowValues.length > 0 ? Math.max(...snowValues) : null;
  const minSnowCm = snowValues.length > 0 ? Math.min(...snowValues) : null;
  const maxFreshCm = freshValues.length > 0 ? Math.max(...freshValues) : null;

  const validDates = sectors
    .map((s) => s.lastSnowfallDate)
    .filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)))
    .sort();
  const latestSnowfallDate = validDates.length > 0 ? validDates[validDates.length - 1] : null;

  // Evaluate bulletin-level reliability & collect clear anomaly explanations
  const anomalyReasons: string[] = [];
  const snowSectors = sectors.filter((s) => s.snowTotalCm !== null);
  const freshValidSectors = snowSectors.filter(
    (s) =>
      !s.isStaleSector &&
      s.lastSnowfallDate !== null &&
      /^\d{4}-\d{2}-\d{2}$/.test(s.lastSnowfallDate) &&
      daysBetweenIso(s.lastSnowfallDate, updatedDate) <= 45
  );

  for (const s of snowSectors) {
    if (s.staleReason && !anomalyReasons.includes(s.staleReason)) {
      anomalyReasons.push(`${s.sector} : ${s.staleReason}`);
    }
  }

  let closedSeasonNotice = false;
  if (advisoryText) {
    const advDate = frDateToIso(advisoryText, updatedDate);
    const mentionsClosed = /ferm[ée]|fermeture/i.test(advisoryText);
    if (mentionsClosed && advDate && daysBetweenIso(advDate, updatedDate) > 30) {
      closedSeasonNotice = true;
      anomalyReasons.push(`Conseil du jour périmé (${advDate}) : ${advisoryText.slice(0, 90)}`);
    } else if (/ferm[ée]\s+depuis/i.test(advisoryText)) {
      closedSeasonNotice = true;
      anomalyReasons.push(`Domaine signalé fermé : ${advisoryText.slice(0, 90)}`);
    }
  }

  let reliability: SnowBulletinReliability = 'verified';

  if (freshValidSectors.length === 0) {
    if (
      closedSeasonNotice ||
      snowSectors.some((s) => s.isStaleSector) ||
      (isEarlySeason && (maxSnowCm ?? 0) >= 160 && liftsOpen === 0)
    ) {
      reliability = 'stale';
      if (anomalyReasons.length === 0) {
        anomalyReasons.push(
          `Hauteur de ${maxSnowCm ?? 0} cm sans date de chute récente et remontées fermées`
        );
      }
    } else if ((maxSnowCm ?? 0) >= 30) {
      reliability = 'suspect';
      anomalyReasons.push(
        'Aucune date de dernière chute renseignée pour confirmer ces hauteurs de neige'
      );
    } else if (snowSectors.length === 0) {
      reliability = 'suspect';
      anomalyReasons.push('Aucune hauteur de neige publiée sur ce bulletin');
    }
  }

  return {
    slug,
    title,
    sourceUrl,
    updatedLabel,
    updatedDate,
    fetchedAt: new Date().toISOString(),
    sectors,
    maxSnowCm,
    minSnowCm,
    maxFreshCm,
    pistesOpen: pistesTotal > 0 ? pistesOpen : null,
    pistesTotal: pistesTotal > 0 ? pistesTotal : null,
    liftsOpen: liftsTotal > 0 ? liftsOpen : null,
    liftsTotal: liftsTotal > 0 ? liftsTotal : null,
    forecastToday,
    advisoryText,
    latestSnowfallDate,
    reliability,
    anomalyReasons,
  };
}

async function fetchLumiplanBulletin(slug: string): Promise<LumiplanBulletin> {
  const now = Date.now();
  const cached = lumiplanCache.get(slug);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const sourceUrl = `https://bulletinv3.lumiplan.pro/bulletin.php?station=${encodeURIComponent(
    slug
  )}&isSoir=false&lang=fr`;

  const response = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(4500),
    headers: {
      'User-Agent': 'SKI-PILOT/2.5',
      Accept: 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`Lumiplan a répondu avec le statut ${response.status}`);
  }

  const html = await response.text();
  if (html.length < 1500 || !html.includes('meteo_card')) {
    throw new Error(`Aucun bulletin Lumiplan actif trouvé pour « ${slug} ».`);
  }

  const parsed = parseLumiplanHtml(slug, html, sourceUrl);
  lumiplanCache.set(slug, { expiresAt: now + CACHE_TTL_MS, data: parsed });
  return parsed;
}

function readAppVersion(): { version: string; date: string } {
  try {
    const content = fs.readFileSync(path.resolve(__dirname, 'src/version.ts'), 'utf8');
    const vMatch = content.match(/APP_VERSION\s*=\s*'([^']+)'/);
    const dMatch = content.match(/APP_VERSION_DATE\s*=\s*'([^']+)'/);
    return {
      version: vMatch?.[1] ?? 'v2.5',
      date: dMatch?.[1] ?? '',
    };
  } catch {
    return { version: 'v2.5', date: '' };
  }
}

async function startServer() {
  const app = express();

  app.get('/api/version', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(readAppVersion());
  });

  app.get('/api/lumiplan', async (req: Request, res: Response) => {
    const rawSlug = typeof req.query.station === 'string' ? req.query.station.trim().toLowerCase() : '';
    if (!SLUG_REGEX.test(rawSlug)) {
      res.status(400).json({
        error: 'Identifiant de station Lumiplan invalide (lettres minuscules, chiffres et tirets uniquement).',
      });
      return;
    }

    try {
      const data = await fetchLumiplanBulletin(rawSlug);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Erreur lors de la lecture du bulletin Lumiplan.',
      });
    }
  });

  app.get('/api/lumiplan/batch', async (req: Request, res: Response) => {
    const rawList = typeof req.query.stations === 'string' ? req.query.stations : '';
    const slugs = Array.from(
      new Set(
        rawList
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter((s) => SLUG_REGEX.test(s))
      )
    ).slice(0, 35);

    if (slugs.length === 0) {
      res.status(400).json({ error: 'Aucune station valide fournie.' });
      return;
    }

    const results = await Promise.allSettled(
      slugs.map((slug) => fetchLumiplanBulletin(slug))
    );

    const bulletins: LumiplanBulletin[] = [];
    const errors: Array<{ slug: string; error: string }> = [];

    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        bulletins.push(r.value);
      } else {
        errors.push({
          slug: slugs[idx],
          error: r.reason instanceof Error ? r.reason.message : 'Indisponible',
        });
      }
    });

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ bulletins, errors });
  });

  app.get('/api/skiinfo', async (req: Request, res: Response) => {
    const region = typeof req.query.region === 'string' ? req.query.region.trim().toLowerCase() : 'alpes-du-nord';
    if (!SKIINFO_REGIONS.has(region)) {
      res.status(400).json({ error: 'Massif Skiinfo invalide.' });
      return;
    }

    try {
      const data = await fetchSkiinfoRegionData(region);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Erreur réseau Skiinfo.',
      });
    }
  });

  app.get('/api/openmeteo', async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const elevation = Number(req.query.elevation ?? 1800);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180 ||
      !Number.isFinite(elevation) ||
      elevation < 0 ||
      elevation > 4810
    ) {
      res.status(400).json({ error: 'Coordonnées ou altitude invalides.' });
      return;
    }

    try {
      const data = await fetchOpenMeteoData(lat, lng, elevation);
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Erreur réseau Open-Meteo.',
      });
    }
  });

  app.post(
    '/api/openmeteo/archive',
    express.json({ limit: '256kb' }),
    async (req: Request, res: Response) => {
      const startDate =
        typeof req.body?.startDate === 'string' ? req.body.startDate.trim() : '';
      const endDate =
        typeof req.body?.endDate === 'string' ? req.body.endDate.trim() : '';

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
        startDate > endDate
      ) {
        res.status(400).json({ error: 'Plage de dates invalide (format AAAA-MM-JJ).' });
        return;
      }

      const spanDays = daysBetweenIso(startDate, endDate);
      if (spanDays < 0 || spanDays > 400) {
        res
          .status(400)
          .json({ error: 'La plage maximale par appel archive est de 400 jours.' });
        return;
      }

      const rawStations: unknown[] = Array.isArray(req.body?.stations)
        ? req.body.stations
        : [];
      const cleanStations: ArchiveStationInput[] = [];
      for (const item of rawStations.slice(0, 120)) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 120) : '';
        const lat = Number(obj.lat);
        const lng = Number(obj.lng);
        const elevation = Number(obj.elevation ?? 1800);
        if (
          !name ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180 ||
          !Number.isFinite(elevation) ||
          elevation < 0 ||
          elevation > 4810
        ) {
          continue;
        }
        cleanStations.push({ name, lat, lng, elevation });
      }

      if (cleanStations.length === 0) {
        res.status(400).json({ error: 'Aucune station géolocalisée valide fournie.' });
        return;
      }

      try {
        const results: ArchiveStationOutput[] = [];
        for (let i = 0; i < cleanStations.length; i += 35) {
          const chunk = cleanStations.slice(i, i + 35);
          const part = await fetchOpenMeteoArchiveChunk(chunk, startDate, endDate);
          results.push(...part);
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json({ startDate, endDate, results });
      } catch (err) {
        res.status(502).json({
          error:
            err instanceof Error
              ? err.message
              : 'Erreur réseau Open-Meteo Archive.',
        });
      }
    }
  );

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const setNoCacheHeaders = (res: Response) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    };

    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          const baseName = path.basename(filePath);
          if (
            baseName === 'index.html' ||
            baseName === 'sw.js' ||
            baseName === 'registerSW.js' ||
            baseName === 'manifest.webmanifest' ||
            baseName.startsWith('workbox-')
          ) {
            setNoCacheHeaders(res);
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );

    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Route API introuvable.' });
        return;
      }
      setNoCacheHeaders(res);
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SKI PILOT server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
