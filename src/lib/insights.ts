/**
 * Domain layer for CARTO-powered neighborhood insights:
 * SQL builders, dataset registry, metric/color definitions, POI taxonomy, formatters.
 */
import type { Feature, FeatureCollection, Geometry, Point } from "geojson";
import { CLUBS, type Club } from "../data";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ZipProps = {
  zip: string;
  city: string;
  lat: number;
  lng: number;
  income: number | null;
  home_value: number | null;
  pop: number | null;
  age: number | null;
  density: number | null;
};

export type PoiProps = {
  club_id: string;
  osm_id: number;
  name: string;
  kind: string;
  dist_m: number;
};

export type ZipFeature = Feature<Geometry, ZipProps>;
export type ZipFC = FeatureCollection<Geometry, ZipProps>;
export type PoiFeature = Feature<Point, PoiProps>;
export type PoiFC = FeatureCollection<Geometry, PoiProps>;

/* ------------------------------------------------------------------ */
/* Datasets & SQL                                                      */
/* ------------------------------------------------------------------ */

export const DATASETS = [
  {
    key: "zips",
    id: "bigquery-public-data.geo_us_boundaries.zip_codes",
    name: "US ZIP code boundaries",
    provider: "US Census Bureau · TIGER/Line",
    use: "ZIP polygons, centroids & land area",
  },
  {
    key: "acs",
    id: "bigquery-public-data.census_bureau_acs.zip_codes_2018_5yr",
    name: "American Community Survey 2018 (5-year)",
    provider: "US Census Bureau",
    use: "Household income, home value, population, age",
  },
  {
    key: "pois",
    id: "carto-demo-data.demo_tables.osm_pois_usa",
    name: "OpenStreetMap points of interest (USA)",
    provider: "OpenStreetMap contributors · CARTO",
    use: "Dining, hotels, culture & parks near each club",
  },
] as const;

export const METRO_BBOX = { minLat: 25.7, maxLat: 25.96, minLng: -80.34, maxLng: -80.1 };
export const NEARBY_RADIUS_M = 2000;
const NEARBY_PER_KIND = 5;

export function zipOf(club: Club): string {
  return club.address.match(/\b(\d{5})\s*$/)?.[1] ?? "";
}

export function zipSql(): string {
  const b = METRO_BBOX;
  return [
    "SELECT z.zip_code AS zip,",
    "REGEXP_REPLACE(z.city, r' (city|village|town|CDP)$', '') AS city,",
    "z.internal_point_lat AS lat, z.internal_point_lon AS lng,",
    "a.median_income AS income,",
    "a.owner_occupied_housing_units_median_value AS home_value,",
    "a.total_pop AS pop, a.median_age AS age,",
    "SAFE_DIVIDE(a.total_pop, z.area_land_meters / 1e6) AS density,",
    "ST_SIMPLIFY(z.zip_code_geom, 45) AS geom",
    `FROM \`${DATASETS[0].id}\` z`,
    `JOIN \`${DATASETS[1].id}\` a ON a.geo_id = z.zip_code`,
    `WHERE z.internal_point_lat BETWEEN ${b.minLat} AND ${b.maxLat}`,
    `AND z.internal_point_lon BETWEEN ${b.minLng} AND ${b.maxLng}`,
  ].join(" ");
}

export function poiSql(): string {
  const rows = CLUBS.map((c, i) => {
    // Only trusted, validated literals are ever interpolated into SQL.
    if (!/^[a-z0-9_-]+$/.test(c.id) || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) {
      throw new Error(`Refusing to build SQL for invalid club record: ${c.id}`);
    }
    return i === 0
      ? `STRUCT('${c.id}' AS id, ${c.lng} AS lng, ${c.lat} AS lat)`
      : `STRUCT('${c.id}', ${c.lng}, ${c.lat})`;
  }).join(", ");
  const kinds = POI_KINDS.map((k) => `'${k.replace(/[^A-Za-z ]/g, "")}'`).join(",");

  return [
    `WITH c AS (SELECT id, ST_GEOGPOINT(lng, lat) AS p FROM UNNEST([${rows}]))`,
    "SELECT c.id AS club_id, o.osm_id, o.name, o.subgroup_name AS kind,",
    "CAST(ROUND(ST_DISTANCE(ST_CENTROID(o.geom), c.p)) AS INT64) AS dist_m,",
    "ST_CENTROID(o.geom) AS geom",
    `FROM \`${DATASETS[2].id}\` o JOIN c ON ST_DWITHIN(o.geom, c.p, ${NEARBY_RADIUS_M})`,
    `WHERE o.name IS NOT NULL AND o.subgroup_name IN (${kinds})`,
    `QUALIFY ROW_NUMBER() OVER (PARTITION BY c.id, o.subgroup_name ORDER BY dist_m) <= ${NEARBY_PER_KIND}`,
  ].join(" ");
}

/* ------------------------------------------------------------------ */
/* POI taxonomy                                                        */
/* ------------------------------------------------------------------ */

export type PoiGroupKey = "dining" | "cafe" | "nightlife" | "hotels" | "culture" | "outdoors" | "essentials";

export const POI_GROUPS: Record<PoiGroupKey, { label: string; color: string; icon: string; kinds: string[] }> = {
  dining: { label: "Dining", color: "#ea580c", icon: "🍽️", kinds: ["Restaurant"] },
  cafe: { label: "Cafés", color: "#a16207", icon: "☕", kinds: ["Cafe"] },
  nightlife: { label: "Nightlife", color: "#db2777", icon: "🍸", kinds: ["Bar", "Pub", "Nightclub"] },
  hotels: { label: "Hotels", color: "#2563eb", icon: "🏨", kinds: ["Hotel"] },
  culture: {
    label: "Culture",
    color: "#7c3aed",
    icon: "🎭",
    kinds: ["Museum", "Gallery", "Theatre", "Cinema", "Arts centre", "Tourist attraction"],
  },
  outdoors: { label: "Parks & fitness", color: "#059669", icon: "🌿", kinds: ["Park", "Fitness centre", "Sports centre"] },
  essentials: { label: "Essentials", color: "#475569", icon: "🛒", kinds: ["Supermarket", "Pharmacy"] },
};

export const POI_KINDS = Object.values(POI_GROUPS).flatMap((g) => g.kinds);

export function poiGroup(kind: string): PoiGroupKey {
  for (const [key, g] of Object.entries(POI_GROUPS)) {
    if (g.kinds.includes(kind)) return key as PoiGroupKey;
  }
  return "essentials";
}

/** Map natural-language words to POI groups (used by Alfred). */
export const POI_WORDS: [RegExp, PoiGroupKey][] = [
  [/\b(restaurants?|dining|dinner|lunch|brunch|eat|eats|food)\b/, "dining"],
  [/\bcaf(e|é)|\b(coffee|breakfast)\b/, "cafe"],
  [/\b(bars?|pubs?|nightlife|nightclubs?|drinks|cocktails?)\b/, "nightlife"],
  [/\b(hotels?|lodging|resorts?)\b/, "hotels"],
  [/\b(museums?|galler(y|ies)|theat(re|er)s?|cinemas?|culture|arts?|attractions?)\b/, "culture"],
  [/\b(parks?|gyms?|fitness|sports?|outdoors?)\b/, "outdoors"],
  [/\b(pharmac(y|ies)|supermarkets?|grocer(y|ies)|essentials)\b/, "essentials"],
];

/* ------------------------------------------------------------------ */
/* Metrics & color ramps (CARTOColors-inspired)                        */
/* ------------------------------------------------------------------ */

export type MetricKey = "home_value" | "income" | "density";

export const TOP_CODED_HOME = 2_000_000;
export const NO_DATA_COLOR = "#e2e8f0";

export function moneyShort(n: number) {
  if (n >= TOP_CODED_HOME) return "$2M+";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

export function moneyFull(n: number) {
  return n >= TOP_CODED_HOME ? "$2,000,000+" : `$${Math.round(n).toLocaleString("en-US")}`;
}

export function compact(n: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export const METRICS: Record<
  MetricKey,
  { label: string; short: string; ramp: string[]; fmt: (n: number) => string; note: string }
> = {
  home_value: {
    label: "Median home value",
    short: "Home values",
    ramp: ["#d1eeea", "#96d0d1", "#68abb8", "#45829b", "#2a5674"],
    fmt: moneyShort,
    note: "Owner-occupied units · Census top-codes at $2M",
  },
  income: {
    label: "Median household income",
    short: "Income",
    ramp: ["#fbe7b5", "#f5c16c", "#e8913a", "#c4602b", "#8a3a1f"],
    fmt: moneyShort,
    note: "Household income in the past 12 months",
  },
  density: {
    label: "Population density",
    short: "Density",
    ramp: ["#f3e0f7", "#d1afe8", "#a585d1", "#7b63b5", "#4f4691"],
    fmt: (n) => `${compact(n)}/km²`,
    note: "Residents per km² of land",
  },
};

export function quantileBreaks(values: number[], classes = 5): number[] {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < classes) return [];
  const out: number[] = [];
  for (let i = 1; i < classes; i++) {
    const idx = (v.length - 1) * (i / classes);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    out.push(v[lo] + (v[hi] - v[lo]) * (idx - lo));
  }
  return out;
}

export function colorFor(value: number | null | undefined, breaks: number[], ramp: string[]) {
  if (value == null || !Number.isFinite(value)) return NO_DATA_COLOR;
  let i = 0;
  while (i < breaks.length && value > breaks[i]) i++;
  return ramp[Math.min(i, ramp.length - 1)];
}

/** Round to 2 significant digits for legend labels. */
export function niceRound(n: number) {
  if (!Number.isFinite(n) || n === 0) return n;
  const mag = 10 ** (Math.floor(Math.log10(Math.abs(n))) - 1);
  return Math.round(n / mag) * mag;
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export type MetroStats = { zips: number; pop: number; income: number; home_value: number; age: number };

/** Population-weighted averages across the metro ZIP set. */
export function computeMetro(fc: ZipFC): MetroStats {
  let pop = 0,
    wi = 0,
    pi = 0,
    wh = 0,
    ph = 0,
    wa = 0,
    pa = 0;
  for (const f of fc.features) {
    const p = f.properties;
    const n = p.pop ?? 0;
    if (n <= 0) continue;
    pop += n;
    if (p.income != null) {
      wi += p.income * n;
      pi += n;
    }
    if (p.home_value != null) {
      wh += p.home_value * n;
      ph += n;
    }
    if (p.age != null) {
      wa += p.age * n;
      pa += n;
    }
  }
  return {
    zips: fc.features.length,
    pop,
    income: pi ? wi / pi : 0,
    home_value: ph ? wh / ph : 0,
    age: pa ? wa / pa : 0,
  };
}

export function rankOf(fc: ZipFC, zip: string, key: MetricKey) {
  const ranked = fc.features
    .filter((f) => f.properties[key] != null)
    .sort((a, b) => (b.properties[key] as number) - (a.properties[key] as number));
  const idx = ranked.findIndex((f) => f.properties.zip === zip);
  return idx < 0 ? null : { rank: idx + 1, of: ranked.length };
}

export function pctDiff(value: number, base: number) {
  return base ? Math.round(((value - base) / base) * 100) : 0;
}

export function fmtDistance(m: number) {
  const mi = m / 1609.344;
  return mi < 0.1 ? `${Math.max(50, Math.round((m * 3.28084) / 50) * 50)} ft` : `${mi.toFixed(1)} mi`;
}

export function walkMinutes(m: number) {
  return Math.max(1, Math.round(m / 80));
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);
}

export function timeAgo(ts: number | null) {
  if (!ts) return "never";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/* ------------------------------------------------------------------ */
/* CARTO basemaps                                                      */
/* ------------------------------------------------------------------ */

export type Basemap = "voyager" | "positron" | "dark";

export type TileSpec = {
  url: string;
  attribution: string;
  subdomains?: string;
  maxNativeZoom?: number;
  maxZoom?: number;
};

export type ResolvedBasemap = {
  provider: "CARTO" | "Esri";
  label: string;
  base: TileSpec;
  /** Label-only tiles rendered in a pane above data layers so street names stay legible. */
  labels?: TileSpec;
};

export const BASEMAP_STYLES: Record<Basemap, { carto: string; esri: string; bg: string; swatch: string }> = {
  voyager: {
    carto: "Voyager",
    esri: "Streets",
    bg: "#e8eef4",
    swatch: "linear-gradient(135deg,#f3efe6 0%,#cfe3ef 55%,#f8d99b 100%)",
  },
  positron: {
    carto: "Positron",
    esri: "Light Gray",
    bg: "#f4f4f2",
    swatch: "linear-gradient(135deg,#fafafa 0%,#e6e6e3 60%,#d4d4d0 100%)",
  },
  dark: {
    carto: "Dark Matter",
    esri: "Dark Gray",
    bg: "#1b1e23",
    swatch: "linear-gradient(135deg,#2b2f36 0%,#15171b 60%,#3a3f47 100%)",
  },
};

const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const ESRI_ATTR = 'Tiles &copy; <a href="https://www.esri.com">Esri</a> — Esri, HERE, Garmin, USGS, &copy; OpenStreetMap contributors';
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

/**
 * Since Aug 2026 CARTO watermarks keyless basemap tiles. With a CARTO Basemaps key we use
 * CARTO's split base/label tiles; without one we fall back to keyless Esri tiles (no watermark).
 */
export function resolveBasemap(style: Basemap, cartoBasemapsKey: string | null): ResolvedBasemap {
  const meta = BASEMAP_STYLES[style];
  if (cartoBasemapsKey) {
    const q = `?key=${encodeURIComponent(cartoBasemapsKey)}`;
    const root = "https://{s}.basemaps.cartocdn.com";
    const [base, labels] = {
      voyager: ["rastertiles/voyager_nolabels", "rastertiles/voyager_only_labels"],
      positron: ["light_nolabels", "light_only_labels"],
      dark: ["dark_nolabels", "dark_only_labels"],
    }[style];
    return {
      provider: "CARTO",
      label: meta.carto,
      base: { url: `${root}/${base}/{z}/{x}/{y}{r}.png${q}`, attribution: CARTO_ATTR, subdomains: "abcd", maxZoom: 20 },
      labels: { url: `${root}/${labels}/{z}/{x}/{y}{r}.png${q}`, attribution: "", subdomains: "abcd", maxZoom: 20 },
    };
  }
  if (style === "voyager") {
    return {
      provider: "Esri",
      label: meta.esri,
      base: { url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, attribution: ESRI_ATTR, maxNativeZoom: 19, maxZoom: 20 },
    };
  }
  const canvas = style === "dark" ? "World_Dark_Gray" : "World_Light_Gray";
  return {
    provider: "Esri",
    label: meta.esri,
    base: { url: `${ESRI}/Canvas/${canvas}_Base/MapServer/tile/{z}/{y}/{x}`, attribution: ESRI_ATTR, maxNativeZoom: 16, maxZoom: 20 },
    labels: { url: `${ESRI}/Canvas/${canvas}_Reference/MapServer/tile/{z}/{y}/{x}`, attribution: "", maxNativeZoom: 16, maxZoom: 20 },
  };
}
