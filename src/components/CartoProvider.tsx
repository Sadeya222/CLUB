import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  friendlyError,
  getBasemapsKey,
  getCartoConfig,
  queryGeoJSON,
  saveBasemapsKey,
  type ResolvedCartoConfig,
} from "../lib/carto";
import {
  computeMetro,
  poiSql,
  quantileBreaks,
  zipSql,
  type Basemap,
  type MetricKey,
  type MetroStats,
  type PoiFC,
  type PoiFeature,
  type PoiProps,
  type ZipFC,
  type ZipFeature,
  type ZipProps,
} from "../lib/insights";
import { useLocalStorage } from "../lib/hooks";

export type MapPrefs = {
  basemap: Basemap;
  dataLayer: MetricKey | null;
  places: boolean;
  zipOutline: boolean;
};

export type CartoStatus = "loading" | "live" | "cached" | "partial" | "offline";

type DatasetState<T> = {
  data: T | null;
  source: "network" | "cache" | "stale-cache" | null;
  fetchedAt: number | null;
  ms: number | null;
  error: string | null;
};

export type CartoContextValue = {
  status: CartoStatus;
  refreshing: boolean;
  zips: ZipFC | null;
  pois: PoiFC | null;
  zipByCode: Map<string, ZipFeature>;
  poisByClub: Record<string, PoiFeature[]>;
  metro: MetroStats | null;
  breaks: Record<MetricKey, number[]>;
  errors: string[];
  lastSync: number | null;
  latencyMs: number | null;
  refresh: (force?: boolean) => void;
  prefs: MapPrefs;
  setPrefs: (p: Partial<MapPrefs>) => void;
  config: ResolvedCartoConfig;
  reloadConfig: () => void;
  basemapsKey: string | null;
  basemapsKeySource: "env" | "custom" | null;
  setBasemapsKey: (key: string | null) => void;
};

export const DEFAULT_MAP_PREFS: MapPrefs = {
  basemap: "positron",
  dataLayer: "home_value",
  places: true,
  zipOutline: true,
};

const EMPTY = { data: null, source: null, fetchedAt: null, ms: null, error: null };

const CartoContext = createContext<CartoContextValue | null>(null);

export function CartoProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ResolvedCartoConfig>(getCartoConfig);
  const [run, setRun] = useState({ n: 0, force: false });
  const [loading, setLoading] = useState(true);
  const [zipsState, setZipsState] = useState<DatasetState<ZipFC>>(EMPTY);
  const [poisState, setPoisState] = useState<DatasetState<PoiFC>>(EMPTY);
  const [storedPrefs, setStoredPrefs] = useLocalStorage<MapPrefs>("mc-map-prefs", DEFAULT_MAP_PREFS);
  const [basemaps, setBasemaps] = useState(getBasemapsKey);
  const setBasemapsKey = useCallback((key: string | null) => {
    saveBasemapsKey(key);
    setBasemaps(getBasemapsKey());
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const opts = { force: run.force, config };

    const zipsJob = queryGeoJSON<ZipProps>("Neighborhood demographics · ACS × ZIP", zipSql(), opts)
      .then((r) => {
        if (alive) setZipsState({ data: r.data, source: r.source, fetchedAt: r.fetchedAt, ms: r.ms, error: r.error ?? null });
      })
      .catch((e: unknown) => {
        if (alive) setZipsState((s) => ({ ...s, error: friendlyError(e) }));
      });

    const poisJob = queryGeoJSON<PoiProps>("Nearby places · OSM POIs", poiSql(), opts)
      .then((r) => {
        if (alive) setPoisState({ data: r.data, source: r.source, fetchedAt: r.fetchedAt, ms: r.ms, error: r.error ?? null });
      })
      .catch((e: unknown) => {
        if (alive) setPoisState((s) => ({ ...s, error: friendlyError(e) }));
      });

    Promise.all([zipsJob, poisJob]).finally(() => {
      if (alive) setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [run, config]);

  const zipByCode = useMemo(
    () => new Map((zipsState.data?.features ?? []).map((f) => [f.properties.zip, f] as const)),
    [zipsState.data]
  );

  const poisByClub = useMemo(() => {
    const out: Record<string, PoiFeature[]> = {};
    for (const f of poisState.data?.features ?? []) {
      if (f.geometry?.type !== "Point") continue;
      const id = f.properties.club_id;
      (out[id] = out[id] || []).push(f as PoiFeature);
    }
    for (const id of Object.keys(out)) out[id].sort((a, b) => a.properties.dist_m - b.properties.dist_m);
    return out;
  }, [poisState.data]);

  const metro = useMemo(() => (zipsState.data ? computeMetro(zipsState.data) : null), [zipsState.data]);

  const breaks = useMemo(() => {
    const feats = zipsState.data?.features ?? [];
    return {
      home_value: quantileBreaks(feats.map((f) => f.properties.home_value ?? NaN)),
      income: quantileBreaks(feats.map((f) => f.properties.income ?? NaN)),
      density: quantileBreaks(feats.map((f) => f.properties.density ?? NaN)),
    };
  }, [zipsState.data]);

  const errors = [zipsState.error, poisState.error].filter((e): e is string => !!e);
  const hasZ = !!zipsState.data;
  const hasP = !!poisState.data;

  let status: CartoStatus;
  if (loading && !hasZ && !hasP) status = "loading";
  else if (!hasZ && !hasP) status = "offline";
  else if (!hasZ || !hasP || errors.length > 0) status = "partial";
  else if (zipsState.source === "cache" && poisState.source === "cache") status = "cached";
  else status = "live";

  const lastSync = Math.max(zipsState.fetchedAt ?? 0, poisState.fetchedAt ?? 0) || null;
  const networkMs = [zipsState, poisState]
    .filter((s) => s.source === "network" && s.ms != null)
    .map((s) => s.ms as number);
  const latencyMs = networkMs.length ? Math.max(...networkMs) : null;

  const prefs = useMemo(() => ({ ...DEFAULT_MAP_PREFS, ...storedPrefs }), [storedPrefs]);
  const setPrefs = useCallback(
    (p: Partial<MapPrefs>) => setStoredPrefs((s) => ({ ...DEFAULT_MAP_PREFS, ...s, ...p })),
    [setStoredPrefs]
  );

  const refresh = useCallback((force = true) => setRun((r) => ({ n: r.n + 1, force })), []);
  const reloadConfig = useCallback(() => setConfig(getCartoConfig()), []);

  const value: CartoContextValue = {
    status,
    refreshing: loading && (hasZ || hasP),
    zips: zipsState.data,
    pois: poisState.data,
    zipByCode,
    poisByClub,
    metro,
    breaks,
    errors,
    lastSync,
    latencyMs,
    refresh,
    prefs,
    setPrefs,
    config,
    reloadConfig,
    basemapsKey: basemaps.key,
    basemapsKeySource: basemaps.source,
    setBasemapsKey,
  };

  return <CartoContext.Provider value={value}>{children}</CartoContext.Provider>;
}

export function useCarto() {
  const ctx = useContext(CartoContext);
  if (!ctx) throw new Error("useCarto must be used inside <CartoProvider>");
  return ctx;
}
