/**
 * CARTO platform client — Maps API v3 over the CARTO Data Warehouse.
 *
 * Flow (same as @deck.gl/carto): instantiate a SQL source → receive format URLs →
 * fetch the GeoJSON payload. Adds timeouts, retry w/ backoff, request de-duplication,
 * a localStorage cache with stale-on-error fallback, diagnostics and a request log.
 */
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export type CartoConfig = {
  apiBaseUrl: string;
  accessToken: string;
  connection: string;
};

export type ResolvedCartoConfig = CartoConfig & { source: "env" | "custom" };

export const CARTO_CLIENT_ID = "meridian-clubs";

/** Provisioned project credentials; `.env` (VITE_CARTO_*) takes precedence. */
const PROVISIONED: CartoConfig = {
  apiBaseUrl: "https://gcp-us-east1.api.carto.com",
  accessToken:
    "eyJhbGciOiJIUzI1NiJ9.eyJhIjoiYWNfd2Y1Mzk1aXkiLCJqdGkiOiI5OTFjMTg4MiJ9.JxHsEbWhoW_9eua-xcEF0-GGLZ3ZdNT6H8yqydQFyzM",
  connection: "carto_dw",
};

export function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

export const ENV_CARTO_CONFIG: CartoConfig = {
  apiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_CARTO_API_BASE_URL || PROVISIONED.apiBaseUrl),
  accessToken: (import.meta.env.VITE_CARTO_ACCESS_TOKEN || PROVISIONED.accessToken).trim(),
  connection: (import.meta.env.VITE_CARTO_CONNECTION || PROVISIONED.connection).trim(),
};

const OVERRIDE_KEY = "mc-carto-override";

export function getCartoConfig(): ResolvedCartoConfig {
  try {
    const raw = window.localStorage.getItem(OVERRIDE_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<CartoConfig>;
      if (o.apiBaseUrl && o.accessToken) {
        return {
          apiBaseUrl: normalizeBaseUrl(o.apiBaseUrl),
          accessToken: o.accessToken.trim(),
          connection: (o.connection || "carto_dw").trim(),
          source: "custom",
        };
      }
    }
  } catch {
    /* corrupted override — fall back to env */
  }
  return { ...ENV_CARTO_CONFIG, source: "env" };
}

export function saveCartoOverride(config: CartoConfig | null) {
  try {
    if (config) {
      window.localStorage.setItem(
        OVERRIDE_KEY,
        JSON.stringify({
          apiBaseUrl: normalizeBaseUrl(config.apiBaseUrl),
          accessToken: config.accessToken.trim(),
          connection: config.connection.trim(),
        })
      );
    } else {
      window.localStorage.removeItem(OVERRIDE_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

export function validateCartoConfig(c: CartoConfig) {
  const errors: Partial<Record<keyof CartoConfig, string>> = {};
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(c.apiBaseUrl.trim()))
    errors.apiBaseUrl = "Use your https:// CARTO API base URL, e.g. https://gcp-us-east1.api.carto.com";
  if (c.accessToken.trim().split(".").length !== 3)
    errors.accessToken = "That doesn't look like a CARTO API access token.";
  if (!/^[A-Za-z0-9_-]+$/.test(c.connection.trim()))
    errors.connection = "Connection names use letters, numbers, dashes and underscores.";
  return errors;
}

/* ------------------------------------------------------------------ */
/* Token helpers                                                       */
/* ------------------------------------------------------------------ */

export function decodeToken(token: string): { accountId: string | null; tokenId: string | null } {
  try {
    const part = token.split(".")[1] ?? "";
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    return {
      accountId: typeof json.a === "string" ? json.a : null,
      tokenId: typeof json.jti === "string" ? json.jti : null,
    };
  } catch {
    return { accountId: null, tokenId: null };
  }
}

export function maskToken(token: string) {
  return token.length <= 16 ? "••••••••" : `${token.slice(0, 10)}…${token.slice(-6)}`;
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type CartoErrorKind =
  | "auth"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "rate_limit"
  | "server"
  | "network"
  | "timeout";

export class CartoError extends Error {
  readonly kind: CartoErrorKind;
  readonly status?: number;

  constructor(kind: CartoErrorKind, message: string, status?: number) {
    super(message);
    this.name = "CartoError";
    this.kind = kind;
    this.status = status;
  }

  get retryable() {
    return (
      this.kind === "network" ||
      this.kind === "timeout" ||
      this.kind === "server" ||
      this.kind === "rate_limit"
    );
  }
}

function classify(status: number): CartoErrorKind {
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "bad_request";
}

export function friendlyError(e: unknown): string {
  if (e instanceof CartoError) {
    switch (e.kind) {
      case "auth":
        return "CARTO rejected the access token — it may be expired or revoked.";
      case "forbidden":
        return "This CARTO token isn't permitted to run that request.";
      case "not_found":
        return "A CARTO dataset used by Meridian could not be found.";
      case "rate_limit":
        return "CARTO rate limit reached — please retry in a moment.";
      case "server":
        return "CARTO is temporarily unavailable.";
      case "timeout":
        return "CARTO took too long to respond.";
      case "network":
        return "Couldn't reach CARTO — check your connection.";
      default:
        return e.message || "CARTO couldn't run the query.";
    }
  }
  return "Unexpected error while talking to CARTO.";
}

/* ------------------------------------------------------------------ */
/* Request log (observable, for the Integrations panel)                */
/* ------------------------------------------------------------------ */

export type CartoLogEntry = {
  id: number;
  label: string;
  at: number;
  ms: number;
  ok: boolean;
  source: "network" | "cache" | "stale-cache";
  status?: number;
  bytes?: number;
  features?: number;
  error?: string;
};

let logSeq = 0;
let logSnapshot: CartoLogEntry[] = [];
const logSubscribers = new Set<() => void>();

function pushLog(entry: Omit<CartoLogEntry, "id" | "at">) {
  logSnapshot = [{ ...entry, id: ++logSeq, at: Date.now() }, ...logSnapshot].slice(0, 15);
  logSubscribers.forEach((fn) => fn());
}

export function subscribeCartoLog(fn: () => void) {
  logSubscribers.add(fn);
  return () => {
    logSubscribers.delete(fn);
  };
}

export function getCartoLog() {
  return logSnapshot;
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

async function request(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ json: unknown; bytes: number }> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!res.ok) {
      const body = (json ?? {}) as { error?: string; message?: string };
      throw new CartoError(classify(res.status), body.error || body.message || `HTTP ${res.status}`, res.status);
    }
    return { json, bytes: text.length };
  } catch (err) {
    if (err instanceof CartoError) throw err;
    if (timedOut) throw new CartoError("timeout", `Timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw new CartoError("network", err instanceof Error ? err.message : "Network error");
  } finally {
    window.clearTimeout(timer);
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof CartoError) || !e.retryable || attempt >= retries) throw e;
      const delay = 500 * 2 ** attempt + Math.random() * 250;
      await new Promise((r) => window.setTimeout(r, delay));
    }
  }
}

const MAX_GET_URL = 2000;

/** Step 1 — register a SQL source with the Maps API; returns the GeoJSON data URL. */
export async function instantiateQuery(sql: string, cfg: CartoConfig) {
  const base = `${cfg.apiBaseUrl}/v3/maps/${encodeURIComponent(cfg.connection)}/query`;
  const params = {
    q: sql,
    spatialDataColumn: "geom",
    spatialDataType: "geo",
    client: CARTO_CLIENT_ID,
  };
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.accessToken}` };
  const getUrl = `${base}?${new URLSearchParams(params).toString()}`;

  const { json } =
    getUrl.length <= MAX_GET_URL
      ? await request(getUrl, { headers }, 30_000)
      : await request(
          base,
          {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify(params),
          },
          30_000
        );

  const meta = json as { geojson?: { url?: string[] }; schema?: { name: string; type: string }[] } | null;
  const geojsonUrl = meta?.geojson?.url?.[0];
  if (!geojsonUrl) throw new CartoError("bad_request", "CARTO did not return a GeoJSON endpoint for this query");
  return { geojsonUrl, schema: meta?.schema ?? [] };
}

/** Step 2 — download the FeatureCollection. */
async function fetchGeoJSON<P>(url: string, cfg: CartoConfig) {
  const { json, bytes } = await request(url, { headers: { Authorization: `Bearer ${cfg.accessToken}` } }, 30_000);
  const fc = json as FeatureCollection<Geometry, P> | null;
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    throw new CartoError("bad_request", "Unexpected GeoJSON payload from CARTO");
  }
  return { fc, bytes };
}

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

const CACHE_PREFIX = "mc-carto:v1:";
const DAY_MS = 86_400_000;

function fnv1a(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function cacheKeyFor(sql: string, cfg: CartoConfig) {
  return CACHE_PREFIX + fnv1a(`${cfg.apiBaseUrl}|${cfg.connection}|${fnv1a(cfg.accessToken)}|${sql}`);
}

type CacheEntry<T> = { at: number; data: T };

function readCache<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CacheEntry<T>) : null;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota exceeded — skip caching */
  }
}

export function clearCartoCache() {
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX))
      .forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* noop */
  }
}

/* ------------------------------------------------------------------ */
/* Public query API                                                    */
/* ------------------------------------------------------------------ */

export type QueryResult<P> = {
  data: FeatureCollection<Geometry, P>;
  source: "network" | "cache" | "stale-cache";
  ms: number;
  fetchedAt: number;
  error?: string;
};

const inflight = new Map<string, Promise<QueryResult<unknown>>>();

export function queryGeoJSON<P = GeoJsonProperties>(
  label: string,
  sql: string,
  opts: { force?: boolean; ttlMs?: number; config?: CartoConfig } = {}
): Promise<QueryResult<P>> {
  const cfg = opts.config ?? getCartoConfig();
  const ttl = opts.ttlMs ?? DAY_MS;
  const key = cacheKeyFor(sql, cfg);
  const cached = readCache<FeatureCollection<Geometry, P>>(key);

  if (!opts.force && cached && Date.now() - cached.at < ttl) {
    pushLog({ label, ms: 0, ok: true, source: "cache", features: cached.data.features.length });
    return Promise.resolve({ data: cached.data, source: "cache", ms: 0, fetchedAt: cached.at });
  }

  const existing = inflight.get(key);
  if (existing) return existing as Promise<QueryResult<P>>;

  const started = performance.now();
  const promise: Promise<QueryResult<P>> = withRetry(async () => {
    const { geojsonUrl } = await instantiateQuery(sql, cfg);
    return fetchGeoJSON<P>(geojsonUrl, cfg);
  })
    .then(({ fc, bytes }) => {
      const ms = Math.round(performance.now() - started);
      writeCache(key, fc);
      pushLog({ label, ms, ok: true, source: "network", status: 200, bytes, features: fc.features.length });
      return { data: fc, source: "network" as const, ms, fetchedAt: Date.now() };
    })
    .catch((err: unknown) => {
      const ms = Math.round(performance.now() - started);
      const message = friendlyError(err);
      pushLog({
        label,
        ms,
        ok: false,
        source: "network",
        status: err instanceof CartoError ? err.status : undefined,
        error: message,
      });
      if (cached) {
        pushLog({ label, ms: 0, ok: true, source: "stale-cache", features: cached.data.features.length });
        return { data: cached.data, source: "stale-cache" as const, ms, fetchedAt: cached.at, error: message };
      }
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise as Promise<QueryResult<unknown>>);
  return promise;
}

/* ------------------------------------------------------------------ */
/* Basemaps key (separate product from the Maps API token)             */
/* ------------------------------------------------------------------ */

const BASEMAPS_KEY_STORAGE = "mc-carto-basemaps-key";
const PROBE_TILE = "https://a.basemaps.cartocdn.com/light_nolabels/1/0/0.png";

export function getBasemapsKey(): { key: string | null; source: "env" | "custom" | null } {
  try {
    const custom = window.localStorage.getItem(BASEMAPS_KEY_STORAGE)?.trim();
    if (custom) return { key: custom, source: "custom" };
  } catch {
    /* storage unavailable */
  }
  const env = (import.meta.env.VITE_CARTO_BASEMAPS_KEY || "").trim();
  return env ? { key: env, source: "env" } : { key: null, source: null };
}

export function saveBasemapsKey(key: string | null) {
  try {
    if (key && key.trim()) window.localStorage.setItem(BASEMAPS_KEY_STORAGE, key.trim());
    else window.localStorage.removeItem(BASEMAPS_KEY_STORAGE);
  } catch {
    /* storage unavailable */
  }
}

/**
 * CARTO serves a byte-identical watermarked tile for missing or invalid keys, so a key is
 * valid when its tile differs from the keyless one. Tiles are CORS-enabled (ACAO: *).
 */
export async function validateBasemapsKey(key: string): Promise<"valid" | "invalid" | "unknown"> {
  try {
    const [plain, keyed] = await Promise.all([
      fetch(PROBE_TILE, { cache: "no-store" }).then((r) => r.arrayBuffer()),
      fetch(`${PROBE_TILE}?key=${encodeURIComponent(key.trim())}`, { cache: "no-store" }).then((r) => r.arrayBuffer()),
    ]);
    if (plain.byteLength !== keyed.byteLength) return "valid";
    const a = new Uint8Array(plain);
    const b = new Uint8Array(keyed);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return "valid";
    return "invalid";
  } catch {
    return "unknown";
  }
}

/* ------------------------------------------------------------------ */
/* Diagnostics                                                         */
/* ------------------------------------------------------------------ */

export type ProbeResult = {
  api: "maps" | "sql" | "lds";
  label: string;
  ok: boolean;
  status?: number;
  ms: number;
  detail: string;
};

export async function testCartoConnection(cfg: CartoConfig) {
  const t = performance.now();
  await instantiateQuery("SELECT ST_GEOGPOINT(-80.13, 25.82) AS geom", cfg);
  return Math.round(performance.now() - t);
}

export async function probeCartoApis(cfg: CartoConfig = getCartoConfig()): Promise<ProbeResult[]> {
  const auth = { Authorization: `Bearer ${cfg.accessToken}` };
  const conn = encodeURIComponent(cfg.connection);

  const timed = async (
    api: ProbeResult["api"],
    label: string,
    okDetail: string,
    fn: () => Promise<unknown>
  ): Promise<ProbeResult> => {
    const t = performance.now();
    try {
      await fn();
      return { api, label, ok: true, status: 200, ms: Math.round(performance.now() - t), detail: okDetail };
    } catch (e) {
      const ce = e instanceof CartoError ? e : null;
      return {
        api,
        label,
        ok: false,
        status: ce?.status,
        ms: Math.round(performance.now() - t),
        detail: ce?.kind === "forbidden" ? "Not granted for this token" : friendlyError(e),
      };
    }
  };

  return Promise.all([
    timed("maps", "Maps API", `Spatial SQL on ${cfg.connection}`, () =>
      instantiateQuery("SELECT ST_GEOGPOINT(-80.13, 25.82) AS geom", cfg)
    ),
    timed("sql", "SQL API", "Tabular SQL queries", () =>
      request(`${cfg.apiBaseUrl}/v3/sql/${conn}/query?q=${encodeURIComponent("SELECT 1 AS ok")}`, { headers: auth }, 15_000)
    ),
    timed("lds", "LDS API", "Geocoding · routing · isolines", () =>
      request(
        `${cfg.apiBaseUrl}/v3/lds/geocoding/geocode?address=${encodeURIComponent("Miami Beach, FL")}`,
        { headers: auth },
        15_000
      )
    ),
  ]);
}
