import { ComputedStation, StationRecord, WeightsConfig } from '../types';

export function stationKey(value: string | null | undefined): string {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return normalized.replace(/[^a-z0-9]/g, '');
}

export function calcPtsLow(alt: number | null, s1 = 1500, s2 = 1800): number {
  if (alt === null || Number.isNaN(alt)) return 0;
  return alt < s1 ? 1 : alt < s2 ? 2 : 3;
}

export function calcPtsHigh(alt: number | null, s1 = 2000, s2 = 2500): number {
  if (alt === null || Number.isNaN(alt)) return 0;
  return alt < s1 ? 1 : alt < s2 ? 2 : 3;
}

export function calcPtsSize(km: number | null, s1 = 50, s2 = 150): number {
  if (km === null || Number.isNaN(km)) return 0;
  return km < s1 ? 1 : km <= s2 ? 2 : 3;
}

export const DEFAULT_VILLAGE_SCORES: Record<string, number> = {
  alpedhuez: 2,
  larosiere: 2,
  lesmenuires: 1,
  valdisere: 1,
  espacekillytignesvaldisere: 1,
  espacekilly: 1,
  peiseyvallandry: 2,
  valthorens: 0,
  montgenevre: 0,
  avoriaz: 1,
  bonnevalsurarc: 1,
  tignes: 0,
  les2alpes: 1,
  lesarcs: 1,
  aussois: 2,
  latoussuire: 1,
  saintfrancoislongchamp: 1,
  flaine: 1,
  leskarellis: 1,
  valmeinier: 0,
  valloire: 2,
  valfrejus: 0,
  saintsorlindarves: 0,
  saintmartindebelleville: 1,
  espacesanbernardo: 1,
  lessybelles: 1,
  sybelles: 1,
  champagnyenvanoise: 1,
  laplagne: 1,
  legranddomaine: 1,
  paradiski: 1,
  serrechevaliervallee: 1,
  brideslesbains: 2,
  aurisenoisans: 2,
  lecorbier: 1,
  saintefoytarentaise: 0,
  lagrave: 2,
  meribel: 1,
  lanorma: 1,
  courchevel: 1,
  argentiere: 1,
  argentieregrandsmontets: 1,
  montchavinlescoches: 1,
  ozvaujany: 1,
  les3vallees: 0,
  chamonix: 1,
  legrandmassif: 0,
  orelle: 1,
  lessaisies: 0,
  puysaintvincent: 0,
  les7laux: 2,
  valcenis: 0,
  chatel: 2,
  lesgetsmorzine: 2,
  lescontaminesmontjoiehauteluce: 2,
  ozenoisans: 0,
  laclusaz: 2,
  lesportesdusoleil: 1,
  domaineevasionmontblanc: 1,
  saintgervaismontblanc: 1,
  villardreculas: 0,
  albiezmontrond: 2,
  alpedugrandserre: 1,
  chamrousse: 1,
  pralognanlavanoise: 2,
  villaroger: 0,
  arechesbeaufort: 1,
  morzine: 2,
  espaceliberte: 1,
  espacelibertechatellachapelledabondance: 1,
  villagesdugrandmassif: 1,
  villagesdugrandmassifcarrozsamoensmorillon: 1,
  lecolletdallevard: 1,
  valmorel: 0,
  villarddelanscorrencon: 0,
  megeve: 2,
  saintnicolasdeveroce: 1,
  espacediamant: 1,
  lachapelledabondance: 1,
  legrandbornand: 0,
  manigod: 0,
  prazdelyssommand: 1,
  vallorcine: 0,
  espacerocdenfer: 1,
  hirmentazleshaberes: 1,
  combloux: 1,
  rocdenfer: 1,
  abondance: 2,
  coldornon: 1,
  coldeporte: 1,
  crestvoland: 1,
  lagiettaz: 1,
  notredamedebellecombe: 0,
  autransmeaudreenvercors: 1,
  prazsurarlyvaldarly: 0,
  bernex: 1,
  espacevaldarly: 0,
  leshouches: 0,
  thollonlesmemises: 0,
  lesemnoz: 0,
  lansenvercors: 0,
  coldubarioz: 0,
  lafeclaz: 0,
  passyplainejoux: 0,
  gresseenvercors: 0,
  lasambuypaysdefaverges: 0,
  aillonsmargeriaz: 0,
  cordon: 0,
  flumetsaintnicolaslachapelle: 0,
  lereposoir: 0,
  massifdesbrasses: 0,
  saintpierredechartreuseleplanolet: 0,
};

export function travelMinutes(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.getHours() * 60 + val.getMinutes();
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    // Excel serial time fraction (0..1)
    if (val >= 0 && val < 1) {
      const totalMins = Math.round(val * 24 * 60);
      return totalMins;
    }
    return Math.round(val);
  }
  const s = String(val).trim().toLowerCase().replace(/\s+/g, '');
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)(?:min|m)?)?$/);
  if (m && (m[1] || m[2])) {
    return parseInt(m[1] || '0', 10) * 60 + parseInt(m[2] || '0', 10);
  }
  const colonMatch = s.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    return parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10);
  }
  return null;
}

export function fmtTravel(val: unknown, mins?: number | null): string {
  const n = mins !== undefined && mins !== null ? mins : travelMinutes(val);
  if (n !== null && !Number.isNaN(n)) {
    const h = Math.floor(n / 60);
    const m = n % 60;
    return `${h}h${String(m).padStart(2, '0')}`;
  }
  if (val !== null && val !== undefined && String(val).trim() !== '') {
    return String(val);
  }
  return '—';
}

export function getStationPriceForSeason(
  station: StationRecord,
  season = '2026'
): {
  adult: number | null;
  child: number | null;
  sixday: number | null;
  child6: number | null;
  seasonUsed: string;
} {
  const history = station.price_history;
  if (history && history.length > 0) {
    if (season === 'latest') {
      const sorted = [...history].sort((a, b) => b.season.localeCompare(a.season));
      const latest = sorted[0];
      return {
        adult: latest.adult,
        child: latest.child,
        sixday: latest.sixday,
        child6: latest.child6,
        seasonUsed: latest.season,
      };
    }
    const exact = history.find((h) => h.season === season);
    if (exact) {
      return {
        adult: exact.adult,
        child: exact.child,
        sixday: exact.sixday,
        child6: exact.child6,
        seasonUsed: exact.season,
      };
    }
  }
  return {
    adult: station.adult,
    child: station.child,
    sixday: station.sixday,
    child6: station.child6,
    seasonUsed: '2026',
  };
}

export function getAvailablePriceSeasons(stations: StationRecord[]): string[] {
  const set = new Set<string>(['2026']);
  for (const s of stations) {
    if (s.price_history) {
      for (const p of s.price_history) {
        if (p.season) set.add(p.season);
      }
    }
  }
  return Array.from(set).sort();
}

export function computePriceScores(
  stations: StationRecord[],
  priceSeason = '2026'
): Record<string, number> {
  const priced = stations
    .map((s) => ({
      name: s.name,
      adult: getStationPriceForSeason(s, priceSeason).adult,
    }))
    .filter(
      (item): item is { name: string; adult: number } =>
        item.adult !== null && !Number.isNaN(item.adult)
    )
    .sort((a, b) => a.adult - b.adult);

  const count = priced.length;
  const scores: Record<string, number> = {};
  priced.forEach((item, idx) => {
    const tier = Math.min(2, Math.floor((idx * 3) / Math.max(count, 1)));
    scores[item.name] = 3 - tier;
  });
  return scores;
}

export function computeStations(
  stations: StationRecord[],
  weights: WeightsConfig,
  priceSeason = '2026'
): ComputedStation[] {
  const priceScores = computePriceScores(stations, priceSeason);

  return stations
    .filter((s) => {
      const n = (s.name || '').trim();
      const low = n.toLowerCase();
      return (
        n !== '' &&
        !low.includes('bleu =') &&
        !low.includes('vert =') &&
        !low.includes('valeur saisie')
      );
    })
    .map((s) => {
      const k = stationKey(s.name);
      const seasonPrices = getStationPriceForSeason(s, priceSeason);
      const pts_low =
        s.score_low !== null && s.score_low > 0
          ? Math.round(s.score_low)
          : calcPtsLow(s.low_alt);
      const pts_high =
        s.score_high !== null && s.score_high > 0
          ? Math.round(s.score_high)
          : calcPtsHigh(s.high_alt);
      const pts_village =
        s.score_village !== null && !Number.isNaN(s.score_village)
          ? Math.round(s.score_village)
          : (DEFAULT_VILLAGE_SCORES[k] ?? 0);
      const pts_size =
        s.score_size !== null && s.score_size > 0
          ? Math.round(s.score_size)
          : calcPtsSize(s.km);
      const pts_price = priceScores[s.name] ?? 0;

      const total =
        weights.alt * (pts_low + pts_high) +
        weights.village * pts_village +
        weights.size * pts_size +
        weights.price * pts_price;

      return {
        ...s,
        adult: seasonPrices.adult,
        child: seasonPrices.child,
        sixday: seasonPrices.sixday,
        child6: seasonPrices.child6,
        pts_low,
        pts_high,
        pts_village,
        pts_size,
        pts_price,
        total,
      };
    });
}

export function getISOWeek(dateStr: string): number | null {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const date = new Date(Date.UTC(y, m, d));
  if (Number.isNaN(date.getTime())) return null;
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
