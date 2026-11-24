export type ThemeName = 'Dark Blue' | 'Light' | 'Alpine Green' | 'Midnight Purple';

export type TabId = 'personal' | 'snow_ranking' | 'stations' | 'history' | 'skiradar' | 'import' | 'access';

export interface PriceHistoryEntry {
  season: string; // "2026", "2027", "2028"...
  adult: number | null;
  child: number | null;
  sixday: number | null;
  child6: number | null;
  source?: string;
  recordedAt?: string;
}

export interface StationRecord {
  name: string;
  kind: string;
  department: string;
  domain: string;
  travel: string;
  travel_min: number | null;
  low_alt: number | null;
  high_alt: number | null;
  km: number | null;
  adult: number | null;
  child: number | null;
  sixday: number | null;
  child6: number | null;
  obs_alt: number | null;
  score_low: number | null;
  score_high: number | null;
  score_village: number | null;
  score_size: number | null;
  score_excel: number | null;
  skiradar_url?: string;
  skiradar_massif?: string;
  price_history?: PriceHistoryEntry[];
}

export interface SnowRecord {
  station: string;
  day: string; // YYYY-MM-DD
  season: number;
  ground: number | null;
  max_depth: number | null;
  fresh: number | null;
  obs_alt: number | null;
}

export interface WeightsConfig {
  alt: number;
  village: number;
  size: number;
  price: number;
}

export interface ComputedStation extends StationRecord {
  pts_low: number;
  pts_high: number;
  pts_village: number;
  pts_size: number;
  pts_price: number;
  total: number;
}

export interface DatasetMeta {
  source: 'sample' | 'excel' | 'skiradar';
  stationsFileName?: string;
  snowFileName?: string;
  importedAt?: string;
  stationCount: number;
  snowCount: number;
  lastSnowDay?: string;
  lastArchiveCatchupAt?: string;
  lastCloudSyncAt?: string;
  cloudRevision?: number;
}

export interface SharedDatasetMetaRecord {
  docId: 'current';
  source: 'sample' | 'excel' | 'skiradar';
  stationsFileName: string;
  snowFileName: string;
  importedAt: string;
  stationCount: number;
  snowCount: number;
  stationChunkCount: number;
  snowChunkCount: number;
  lastSnowDay: string;
  lastArchiveCatchupAt: string;
  revision: number;
  updatedByUid: string;
}

export type CloudSyncStatus = 'idle' | 'loading' | 'syncing' | 'synced' | 'offline' | 'error';

export interface OpenMeteoArchiveStationResult {
  name: string;
  elevationM: number;
  daily: Array<{
    date: string;
    snowDepthCm: number | null;
    snowfallCm: number | null;
  }>;
}

export interface ImportDiagnostics {
  stationsImported: number;
  snowRecordsImported: number;
  snowSheetsProcessed: number;
  ignoredSheets: string[];
  matchedWeatherAltitudes: number;
}

export interface SkiRadarSourceDef {
  nom: string;
  detail?: string;
  licence?: string;
  url?: string;
}

export interface SkiRadarStation {
  id: string;
  name: string;
  url: string;
  wikidata?: string | null;
  massif?: string | null;
  domaine?: string | null;
  commune?: string | null;
  geo?: { lat: number; lng: number } | null;
  altitudes?: {
    village?: number | null;
    bas?: number | null;
    sommet?: number | null;
  } | null;
  pistes?: {
    km?: number | null;
    kmDomaineRelie?: number | null;
    domaineRelie?: string | null;
    vertes?: number | null;
    bleues?: number | null;
    rouges?: number | null;
    noires?: number | null;
    remontees?: number | null;
    nordiqueKm?: number | null;
    snowpark?: boolean | null;
  } | null;
  sourcesChiffres?: Record<
    string,
    { source?: string; url?: string | null; date?: string | null }
  > | null;
  nordique?: {
    km?: number | null;
    kmTrace?: number | null;
    itineraires?: number | null;
    plusLongs?: Array<{ nom: string; km: number }>;
    site?: string | null;
    distanceKm?: number | null;
    source?: string | null;
    releveLe?: string | null;
  } | null;
  snowparks?: {
    zones?: number | null;
    source?: string | null;
  } | null;
  neigeObservee?: {
    statut?: string;
    motif?: string;
    poste?: string;
    posteAltitude?: number | null;
    distanceKm?: number | null;
    hivers?: number | null;
    periode?: string | null;
    joursSkiablesMoyen?: number | null;
    source?: string | null;
    releveLe?: string | null;
  } | null;
  planPistes?: {
    url?: string;
    pageUrl?: string;
    format?: string;
    fichierModifieLe?: string;
    source?: string;
    editeur?: string;
    verifieLe?: string;
  } | null;
  activites?: {
    total?: number;
    parType?: Record<string, number>;
    rayonKm?: number;
    source?: string;
    dateFichier?: string;
  } | null;
  ecoleDeSki?: {
    nom?: string;
    moniteurs?: number | null;
    moniteursAnglophones?: number | null;
    site?: string;
    source?: string;
  } | null;
  forfaits?: {
    jourAdulte?: number | null;
    sixJoursAdulte?: number | null;
    saisonAdulte?: number | null;
    jourEnfant?: number | null;
    nomForfait?: string | null;
    perimetre?: string | null;
    saison?: string | null;
    source?: string | null;
    sourceUrl?: string | null;
    releveLe?: string | null;
    releveSur?: string | null;
    domaineRelie?: string | null;
  } | null;
  neige?: {
    statut?: string | null;
    basCm?: number | null;
    hautCm?: number | null;
    pistesOuvertes?: number | null;
    pistesTotal?: number | null;
    remonteesOuvertes?: number | null;
    remonteesTotal?: number | null;
    derniereChute?: string | null;
    releveLe?: string | null;
    source?: string | null;
    sourceUrl?: string | null;
    editeur?: string | null;
    domaine?: string | null;
  } | null;
  webcams?: number | null;
  siteOfficiel?: string | null;
  resume?: string | null;
  updatedAt?: string | null;
}

export interface SkiRadarFeedCache {
  version: string;
  generatedAt: string;
  licence: string;
  total: number;
  etag?: string;
  fetchedAt: string;
  sources: Record<string, SkiRadarSourceDef>;
  stations: SkiRadarStation[];
}

export interface AllowedUserRecord {
  id: string;
  email: string;
  label: string;
  role: 'friend' | 'admin';
  active: boolean;
  addedByUid: string;
}

export interface UserPrefsRecord {
  uid: string;
  departureLabel: string;
  showDepartureInSidebar: boolean;
}

export type SnowBulletinReliability = 'verified' | 'suspect' | 'stale';

export interface SnowBackupSnapshot {
  id: string;
  createdAt: string;
  label: string;
  snow: SnowRecord[];
  meta: DatasetMeta;
}

export interface LumiplanSector {
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
  isStaleSector?: boolean;
  staleReason?: string | null;
}

export interface LumiplanBulletin {
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
  advisoryText?: string | null;
  latestSnowfallDate?: string | null;
  reliability?: SnowBulletinReliability;
  anomalyReasons?: string[];
}

export interface SkiinfoResortRow {
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

export interface OpenMeteoSnowReport {
  latitude: number;
  longitude: number;
  elevationM: number;
  fetchedAt: string;
  snowDepthCm: number | null;
  tempC: number | null;
  freezingLevelM: number | null;
  daily: Array<{ date: string; snowfallCm: number | null }>;
}

