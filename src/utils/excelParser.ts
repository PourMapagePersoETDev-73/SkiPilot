import * as XLSX from 'xlsx';
import { ComputedStation, ImportDiagnostics, SnowRecord, StationRecord } from '../types';
import { fmtTravel, stationKey, travelMinutes } from './scoring';

const META_SHEETS = new Set([
  'Comparaison',
  'Graphique',
  'Classement',
  'UNE station',
  'Données',
  'Légende',
  'Neige fraîche',
  'Couverture',
  'Nb hivers',
]);

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(',', '.').replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatExcelDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const s = String(val).trim();
  // Match YYYY-MM-DD or DD/MM/YYYY
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }
  const fr = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (fr) {
    return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  }
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  return null;
}

function findColumnValue(row: Record<string, unknown>, candidates: string[]): unknown {
  for (const c of candidates) {
    if (c in row && row[c] !== undefined && row[c] !== '') {
      return row[c];
    }
  }
  const keys = Object.keys(row);
  for (const c of candidates) {
    const cNorm = stationKey(c);
    const matched = keys.find((k) => stationKey(k).includes(cNorm));
    if (matched && row[matched] !== undefined && row[matched] !== '') {
      return row[matched];
    }
  }
  return undefined;
}

export function parseStationsWorkbook(buffer: ArrayBuffer): StationRecord[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames.includes('Stations') ? 'Stations' : wb.SheetNames[0];
  if (!sheetName) throw new Error('Aucune feuille trouvée dans le fichier stations.');

  const ws = wb.Sheets[sheetName];
  // Try header at row 2 (range: 1) as in Ski_2026-27.xlsx; fallback to row 1 (range: 0) if needed
  let rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: 1, defval: null });
  const hasExpectedCol =
    rows.length > 0 &&
    Object.keys(rows[0]).some((k) => stationKey(k).includes('stationdomaine') || stationKey(k).includes('station'));

  if (!hasExpectedCol) {
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: 0, defval: null });
  }

  const stations: StationRecord[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    const rawName = findColumnValue(r, [
      'Station / domaine (lien plan des pistes)',
      'Station / domaine',
      'Station',
      'Nom',
    ]);
    if (rawName === null || rawName === undefined) continue;
    const name = String(rawName).trim();
    const lower = name.toLowerCase();
    if (
      !name ||
      lower.includes('bleu =') ||
      lower.includes('vert =') ||
      lower.includes('valeur saisie')
    ) {
      continue;
    }
    if (seen.has(name)) continue;
    seen.add(name);

    const tr = findColumnValue(r, ['Trajet depuis La Biolle', 'Trajet', 'Temps trajet']);
    const trMins = travelMinutes(tr);

    const adult = toNum(findColumnValue(r, ['Jour adulte', 'Prix adulte']));
    const child = toNum(findColumnValue(r, ['Jour enfant', 'Prix enfant']));
    const sixday = toNum(findColumnValue(r, ['6 jours adulte']));
    const child6 = toNum(findColumnValue(r, ['6 jours enfant']));

    stations.push({
      name,
      kind: String(findColumnValue(r, ['Type']) ?? ''),
      department: String(findColumnValue(r, ['Département', 'Dept']) ?? ''),
      domain: String(findColumnValue(r, ['Domaine relié', 'Domaine']) ?? ''),
      travel: fmtTravel(tr, trMins),
      travel_min: trMins,
      low_alt: toNum(findColumnValue(r, ['Alt. basse (m)', 'Alt. basse'])),
      high_alt: toNum(findColumnValue(r, ['Alt. haute (m)', 'Alt. haute'])),
      km: toNum(findColumnValue(r, ['Km de pistes', 'Km'])),
      adult,
      child,
      sixday,
      child6,
      obs_alt: null,
      score_low: toNum(findColumnValue(r, ['Pts alt. basse'])),
      score_high: toNum(findColumnValue(r, ['Pts alt. haute'])),
      score_village: toNum(findColumnValue(r, ['Note village (0-2)', 'Note village'])),
      score_size: toNum(findColumnValue(r, ['Pts taille'])),
      score_excel: toNum(findColumnValue(r, ['Score total'])),
      price_history: [
        {
          season: '2026',
          adult,
          child,
          sixday,
          child6,
          source: 'excel',
        },
      ],
    });
  }

  return stations;
}

export function parseSnowWorkbook(buffer: ArrayBuffer): {
  snow: SnowRecord[];
  weatherAltitudes: Record<string, number | null>;
  sheetsProcessed: number;
  ignoredSheets: string[];
} {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const snow: SnowRecord[] = [];
  const weatherAltitudes: Record<string, number | null> = {};
  const ignoredSheets: string[] = [];
  let sheetsProcessed = 0;

  for (const sheet of wb.SheetNames) {
    if (META_SHEETS.has(sheet)) {
      ignoredSheets.push(sheet);
      continue;
    }
    const ws = wb.Sheets[sheet];
    if (!ws) continue;

    // Altitude du poste météo : cellule B3
    const b3 = ws['B3'];
    const obsAlt = b3 ? toNum(b3.v) : null;
    weatherAltitudes[stationKey(sheet)] = obsAlt;

    // Données à partir de la ligne 6 (index 5), colonnes A:E
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      range: 5,
      defval: null,
    });

    let validRowsInSheet = 0;
    for (const row of matrix) {
      if (!Array.isArray(row) || row.length === 0) continue;
      const dayStr = formatExcelDate(row[0]);
      if (!dayStr) continue;
      const yearFallback = parseInt(dayStr.slice(0, 4), 10);
      const rawSeason = toNum(row[1]);
      const season = rawSeason !== null ? Math.round(rawSeason) : yearFallback;
      const ground = toNum(row[2]);
      const max_depth = toNum(row[3]);
      const fresh = toNum(row[4]);

      if (ground === null && max_depth === null && fresh === null) continue;

      snow.push({
        station: sheet,
        day: dayStr,
        season,
        ground,
        max_depth,
        fresh,
        obs_alt: obsAlt,
      });
      validRowsInSheet++;
    }

    if (validRowsInSheet > 0) {
      sheetsProcessed++;
    } else {
      ignoredSheets.push(sheet);
    }
  }

  return { snow, weatherAltitudes, sheetsProcessed, ignoredSheets };
}

export function linkStationsWithWeatherAltitudes(
  stations: StationRecord[],
  weatherAltitudes: Record<string, number | null>
): { linkedStations: StationRecord[]; matchedCount: number } {
  let matchedCount = 0;
  const linkedStations = stations.map((st) => {
    const key = stationKey(st.name);
    let alt = weatherAltitudes[key] ?? null;

    if (alt === null) {
      // L'Alpe d'Huez est parfois nommé sans article
      for (const [wk, wv] of Object.entries(weatherAltitudes)) {
        if (wv !== null && wk.replace(/^l+/, '') === key) {
          alt = wv;
          break;
        }
      }
    }

    if (alt !== null) {
      matchedCount++;
      return { ...st, obs_alt: alt };
    }
    return st;
  });

  return { linkedStations, matchedCount };
}

export function mergeExcelWorkbooks(
  stationsBuffer: ArrayBuffer | null,
  snowBuffer: ArrayBuffer | null,
  existingStations: StationRecord[],
  existingSnow: SnowRecord[]
): {
  stations: StationRecord[];
  snow: SnowRecord[];
  diagnostics: ImportDiagnostics;
} {
  let stations = stationsBuffer ? parseStationsWorkbook(stationsBuffer) : existingStations;
  let snow = existingSnow;
  let snowSheetsProcessed = 0;
  let ignoredSheets: string[] = [];
  let matchedWeatherAltitudes = 0;

  if (snowBuffer) {
    const parsedSnow = parseSnowWorkbook(snowBuffer);
    snow = parsedSnow.snow;
    snowSheetsProcessed = parsedSnow.sheetsProcessed;
    ignoredSheets = parsedSnow.ignoredSheets;

    const linked = linkStationsWithWeatherAltitudes(stations, parsedSnow.weatherAltitudes);
    stations = linked.linkedStations;
    matchedWeatherAltitudes = linked.matchedCount;
  } else if (stationsBuffer && existingSnow.length > 0) {
    // Re-link with existing snow weather altitudes
    const weatherMap: Record<string, number | null> = {};
    for (const s of existingSnow) {
      if (s.obs_alt !== null) {
        weatherMap[stationKey(s.station)] = s.obs_alt;
      }
    }
    const linked = linkStationsWithWeatherAltitudes(stations, weatherMap);
    stations = linked.linkedStations;
    matchedWeatherAltitudes = linked.matchedCount;
  }

  return {
    stations,
    snow,
    diagnostics: {
      stationsImported: stationsBuffer ? stations.length : 0,
      snowRecordsImported: snowBuffer ? snow.length : 0,
      snowSheetsProcessed,
      ignoredSheets,
      matchedWeatherAltitudes,
    },
  };
}

export function exportRankingToExcel(computed: ComputedStation[]): void {
  const rows = computed.map((s, idx) => ({
    Rang: idx + 1,
    'Station / domaine': s.name,
    Département: s.department,
    Type: s.kind,
    'Domaine relié': s.domain,
    'Trajet La Biolle': s.travel,
    'Alt. basse (m)': s.low_alt ?? '',
    'Pts alt. basse': s.pts_low,
    'Alt. haute (m)': s.high_alt ?? '',
    'Pts alt. haute': s.pts_high,
    'Note village (0-2)': s.pts_village,
    'Km pistes': s.km ?? '',
    'Pts taille': s.pts_size,
    'Jour adulte (€)': s.adult ?? '',
    'Pts prix': s.pts_price,
    '6 jours adulte (€)': s.sixday ?? '',
    'Poste météo (m)': s.obs_alt ?? '',
    'Score Total': s.total,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Classement SKI PILOT');
  XLSX.writeFile(wb, `SKI_PILOT_Classement_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function downloadStationsTemplate(stations: StationRecord[]): void {
  const headerNote = ['Modele compatible SKI PILOT (ligne 2 = en-tetes)'];
  const headers = [
    'Station / domaine (lien plan des pistes)',
    'Type',
    'Département',
    'Domaine relié',
    'Trajet depuis La Biolle',
    'Alt. basse (m)',
    'Alt. haute (m)',
    'Km de pistes',
    'Jour adulte',
    'Jour enfant',
    '6 jours adulte',
    '6 jours enfant',
    'Pts alt. basse',
    'Pts alt. haute',
    'Note village (0-2)',
    'Pts taille',
    'Score total',
  ];

  const dataRows = stations.slice(0, 10).map((s) => [
    s.name,
    s.kind,
    s.department,
    s.domain,
    s.travel,
    s.low_alt,
    s.high_alt,
    s.km,
    s.adult,
    s.child,
    s.sixday,
    s.child6,
    s.score_low,
    s.score_high,
    s.score_village,
    s.score_size,
    s.score_excel,
  ]);

  const aoa = [headerNote, headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stations');
  XLSX.writeFile(wb, 'Modele_Ski_2026-27.xlsx');
}

export function downloadSnowTemplate(snow: SnowRecord[]): void {
  const wb = XLSX.utils.book_new();
  const sampleStation = snow[0]?.station || 'Val Thorens';
  const rows = snow.filter((r) => r.station === sampleStation).slice(0, 60);

  const aoa: unknown[][] = [
    ['Station', sampleStation],
    ['Département', '73'],
    ['Altitude poste météo (m)', rows[0]?.obs_alt ?? 2277],
    [],
    ['Relevés quotidiens'],
    ['Date', 'Saison', 'Neige au sol (cm)', 'Epaisseur max (cm)', 'Neige fraîche (cm)'],
    ...rows.map((r) => [r.day, r.season, r.ground, r.max_depth, r.fresh]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, sampleStation);
  XLSX.writeFile(wb, 'Modele_Neige_stations.xlsx');
}
