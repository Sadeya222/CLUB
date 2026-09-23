import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Pane,
  Popup,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { CLUBS, directionsUrl, type Club } from "../data";
import { useCarto, type CartoStatus } from "./CartoProvider";
import {
  BASEMAP_STYLES,
  METRICS,
  resolveBasemap,
  NEARBY_RADIUS_M,
  NO_DATA_COLOR,
  POI_GROUPS,
  colorFor,
  compact,
  escapeHtml,
  fmtDistance,
  moneyShort,
  niceRound,
  poiGroup,
  timeAgo,
  walkMinutes,
  zipOf,
  type Basemap,
  type MetricKey,
  type ZipProps,
} from "../lib/insights";

export type FlyTarget = { id: string; n: number } | null;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ */
/* Club markers                                                        */
/* ------------------------------------------------------------------ */

function pillIcon(club: Club, opts: { active: boolean; saved: boolean }) {
  const { active, saved } = opts;
  const bg = active ? "#0f172a" : "#ffffff";
  const fg = active ? "#ffffff" : "#0f172a";
  const dot = active ? "#fbbf24" : saved ? "#f43f5e" : "#0ea5e9";
  const ring =
    saved && !active
      ? "box-shadow:0 0 0 2px #fbbf24, 0 8px 22px rgba(15,23,42,.22);"
      : "box-shadow:0 8px 22px rgba(15,23,42,.22);";
  return L.divIcon({
    className: "club-marker",
    iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-115%)">
      <div style="display:flex;align-items:center;gap:7px;background:${bg};color:${fg};
        border:1px solid ${active ? "#0f172a" : "#e2e8f0"};padding:7px 12px;border-radius:999px;
        font:600 12px/1 Inter,ui-sans-serif,system-ui;white-space:nowrap;${ring}
        ${active ? "transform:scale(1.14);" : ""}transition:all .18s ease;">
        <span style="width:7px;height:7px;border-radius:99px;background:${dot};flex-shrink:0;"></span>
        <span>${escapeHtml(club.short)}</span>
        <span style="opacity:${active ? 0.75 : 0.55};font-weight:500;">★ ${club.rating.toFixed(1)}</span>
      </div>
      <div style="width:2px;height:12px;margin:0 auto;background:${active ? "#0f172a" : "#94a3b8"};"></div>
      <div style="width:8px;height:8px;margin:-2px auto 0;border-radius:99px;background:${active ? "#fbbf24" : "#fff"};border:2px solid ${active ? "#0f172a" : "#94a3b8"};"></div>
    </div>`,
  });
}

/* ------------------------------------------------------------------ */
/* Camera control                                                      */
/* ------------------------------------------------------------------ */

function Flyer({ flyTo, visible, bounds }: { flyTo: FlyTarget; visible: boolean; bounds: L.LatLngBounds }) {
  const map = useMap();
  const pending = useRef<[number, number] | null>(null);
  const needsFit = useRef(false);

  // A map created while hidden (mobile list tab, 0×0) gets a bogus initial zoom — refit or
  // apply the pending camera the moment the container actually gains a size.
  useEffect(() => {
    const el = map.getContainer();
    const isHidden = () => el.clientWidth === 0 || el.clientHeight === 0;
    let wasHidden = isHidden();
    needsFit.current = wasHidden;
    const ro = new ResizeObserver(() => {
      const hidden = isHidden();
      if (wasHidden && !hidden) {
        map.invalidateSize({ pan: false });
        if (pending.current) {
          map.setView(pending.current, 14, { animate: false });
          pending.current = null;
        } else if (needsFit.current) {
          map.fitBounds(bounds, { padding: [48, 48], animate: false });
        }
        needsFit.current = false;
      }
      wasHidden = hidden;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, bounds]);

  useEffect(() => {
    if (!flyTo) return;
    const c = CLUBS.find((x) => x.id === flyTo.id);
    if (!c) return;
    const el = map.getContainer();
    if (el.clientWidth === 0 || el.clientHeight === 0) {
      pending.current = [c.lat, c.lng]; // map hidden (mobile list tab) — apply when shown
      return;
    }
    map.invalidateSize({ pan: false });
    if (reducedMotion()) map.setView([c.lat, c.lng], 14, { animate: false });
    else map.flyTo([c.lat, c.lng], 14, { duration: 1.1 });
  }, [flyTo, map]);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => map.invalidateSize({ pan: false }), 60);
    return () => window.clearTimeout(t);
  }, [visible, map]);

  return null;
}

/* ------------------------------------------------------------------ */
/* CARTO layers                                                        */
/* ------------------------------------------------------------------ */

function ZipChoropleth({ metric }: { metric: MetricKey }) {
  const { zips, breaks } = useCarto();
  const ref = useRef<L.GeoJSON | null>(null);
  const m = METRICS[metric];
  const b = breaks[metric];

  const style = useCallback<L.StyleFunction<ZipProps>>(
    (f) => ({
      fillColor: colorFor(f?.properties?.[metric] ?? null, b, m.ramp),
      fillOpacity: 0.55,
      color: "#ffffff",
      weight: 0.8,
      opacity: 0.9,
    }),
    [metric, b, m.ramp]
  );

  if (!zips) return null;

  return (
    <GeoJSON
      key={`${metric}-${zips.features.length}-${b.join("|")}`}
      ref={ref}
      data={zips}
      style={style}
      attribution="Census ACS 2018 · via CARTO Data Warehouse"
      onEachFeature={(feature, layer) => {
        const p = feature.properties as ZipProps;
        const v = p[metric];
        layer.bindTooltip(
          `<div class="zt-h">ZIP ${escapeHtml(p.zip)} · ${escapeHtml(p.city)}</div>
           <div class="zt-v">${m.label}: <b>${v == null ? "No data" : m.fmt(v)}</b></div>
           <div class="zt-s">Income ${p.income != null ? moneyShort(p.income) : "—"} · Home ${
             p.home_value != null ? moneyShort(p.home_value) : "—"
           } · Pop ${p.pop != null ? compact(p.pop) : "—"}</div>`,
          { sticky: true, direction: "top", className: "zip-tooltip", offset: [0, -10] }
        );
        layer.on({
          mouseover: (e) => {
            const l = e.target as L.Path;
            l.setStyle({ weight: 2, color: "#0f172a", fillOpacity: 0.72 });
            l.bringToFront();
          },
          mouseout: (e) => ref.current?.resetStyle(e.target as L.Path),
        });
      }}
    />
  );
}

function ClubZipOutline({ club, filled }: { club: Club; filled: boolean }) {
  const { zipByCode } = useCarto();
  const f = zipByCode.get(zipOf(club));
  if (!f) return null;
  return (
    <GeoJSON
      key={`outline-${club.id}`}
      data={f}
      interactive={false}
      style={{
        color: "#0f172a",
        weight: 2.5,
        opacity: 0.9,
        dashArray: "7 6",
        fill: filled,
        fillColor: "#0f172a",
        fillOpacity: filled ? 0.07 : 0,
      }}
    />
  );
}

function NearbyPlaces({ club, dark }: { club: Club; dark: boolean }) {
  const { poisByClub } = useCarto();
  const pois = poisByClub[club.id] ?? [];
  return (
    <>
      <Circle
        center={[club.lat, club.lng]}
        radius={NEARBY_RADIUS_M}
        interactive={false}
        pathOptions={{
          color: dark ? "#fbbf24" : "#0f172a",
          weight: 1.3,
          dashArray: "3 7",
          fillColor: dark ? "#fbbf24" : "#0f172a",
          fillOpacity: 0.035,
        }}
      />
      {pois.map((f) => {
        const [lng, lat] = f.geometry.coordinates;
        const g = POI_GROUPS[poiGroup(f.properties.kind)];
        return (
          <CircleMarker
            key={`${club.id}-${f.properties.osm_id}`}
            center={[lat, lng]}
            radius={5.5}
            pathOptions={{ color: "#ffffff", weight: 1.6, fillColor: g.color, fillOpacity: 0.95 }}
          >
            <Tooltip direction="top" offset={[0, -6]} className="poi-tooltip">
              <span className="block text-[12px] font-semibold text-slate-900">{f.properties.name}</span>
              <span className="block text-[11px] text-slate-500">
                {g.icon} {f.properties.kind} · {fmtDistance(f.properties.dist_m)} · {walkMinutes(f.properties.dist_m)} min walk
              </span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Overlay UI                                                          */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<CartoStatus, { label: string; dot: string; text: string }> = {
  loading: { label: "Syncing CARTO…", dot: "bg-sky-400", text: "text-sky-700" },
  live: { label: "CARTO live", dot: "bg-emerald-500", text: "text-emerald-700" },
  cached: { label: "CARTO · cached", dot: "bg-emerald-500", text: "text-emerald-700" },
  partial: { label: "CARTO partial", dot: "bg-amber-500", text: "text-amber-700" },
  offline: { label: "CARTO offline", dot: "bg-rose-500", text: "text-rose-700" },
};

function DataLegend({ metric, showMarkers }: { metric: MetricKey | null; showMarkers: boolean }) {
  const { breaks, zips } = useCarto();
  const m = metric ? METRICS[metric] : null;
  const b = metric ? breaks[metric] : [];
  const showData = !!(m && zips && b.length === 4);
  if (!showData && !showMarkers) return null;

  return (
    <div className="pointer-events-auto w-[15.5rem] rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-lg shadow-slate-900/10 backdrop-blur">
      {showData && m && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-slate-800">{m.label}</p>
            <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white">CARTO</span>
          </div>
          <div className="mt-2 grid grid-cols-5 overflow-hidden rounded-md">
            {m.ramp.map((c) => (
              <span key={c} className="h-2.5" style={{ background: c }} />
            ))}
          </div>
          <div className="relative mt-1 h-3.5 text-[9.5px] font-medium text-slate-500">
            {b.map((v, i) => (
              <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(i + 1) * 20}%` }}>
                {m.fmt(niceRound(v))}
              </span>
            ))}
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="h-2 w-2 rounded-sm" style={{ background: NO_DATA_COLOR }} />
            No data · US Census ACS 2018
          </p>
        </>
      )}
      {showMarkers && (
        <div className={`hidden items-center gap-3 text-[11px] text-slate-600 sm:flex ${showData ? "mt-2 border-t border-slate-100 pt-2" : ""}`}>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-500" /> Club
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> Saved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Selected
          </span>
        </div>
      )}
    </div>
  );
}

function LayersPanel({ onClose }: { onClose: () => void }) {
  const { prefs, setPrefs, status, zips, pois, lastSync, latencyMs, refresh, refreshing, errors, basemapsKey } = useCarto();
  const ref = useRef<HTMLDivElement>(null);
  const dataReady = !!zips;

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(target) && !target.closest("[data-layers-toggle]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const meta = STATUS_META[status];

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Map layers"
      className="anim-toast pointer-events-auto mt-2 w-[17.5rem] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl shadow-slate-900/20"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">Map layers</p>
        <button onClick={onClose} aria-label="Close layers" className="rounded-full px-1.5 text-slate-400 hover:text-slate-900">
          ✕
        </button>
      </div>

      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        Basemap · {basemapsKey ? "CARTO" : "Esri · keyless fallback"}
      </p>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        {(Object.keys(BASEMAP_STYLES) as Basemap[]).map((k) => (
          <button
            key={k}
            onClick={() => setPrefs({ basemap: k })}
            aria-pressed={prefs.basemap === k}
            className={`overflow-hidden rounded-xl border text-[11px] font-semibold transition ${
              prefs.basemap === k ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:border-slate-400"
            }`}
          >
            <span className="block h-9" style={{ background: BASEMAP_STYLES[k].swatch }} />
            <span className="block py-1 text-slate-700">{basemapsKey ? BASEMAP_STYLES[k].carto : BASEMAP_STYLES[k].esri}</span>
          </button>
        ))}
      </div>
      {!basemapsKey && (
        <p className="mt-1.5 text-[10.5px] leading-snug text-slate-500">
          CARTO basemap tiles now require a free key — add one in <b>Profile → Integrations</b> to switch.
        </p>
      )}

      <p className="mt-3.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        Neighborhood data · CARTO DW
      </p>
      <div className="mt-1.5 space-y-1" role="radiogroup" aria-label="Neighborhood data layer">
        {([null, "home_value", "income", "density"] as (MetricKey | null)[]).map((k) => {
          const selected = prefs.dataLayer === k;
          const disabled = k !== null && !dataReady;
          return (
            <button
              key={k ?? "off"}
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => setPrefs({ dataLayer: k })}
              className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                selected ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? "border-amber-300" : "border-slate-300"
                }`}
              >
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />}
              </span>
              <span className="flex-1 font-medium">{k ? METRICS[k].label : "Off"}</span>
              {k && (
                <span className="flex overflow-hidden rounded-sm">
                  {METRICS[k].ramp.map((c) => (
                    <span key={c} className="h-2.5 w-1.5" style={{ background: c }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Overlays</p>
      <label className="mt-1.5 flex cursor-pointer items-start gap-2.5 rounded-xl px-2.5 py-2 hover:bg-slate-50">
        <input
          type="checkbox"
          checked={prefs.places}
          onChange={(e) => setPrefs({ places: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-slate-900"
        />
        <span className="flex-1">
          <span className="block text-[13px] font-medium text-slate-800">Nearby places</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {Object.values(POI_GROUPS).map((g) => (
              <span key={g.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
                {g.label}
              </span>
            ))}
          </span>
        </span>
      </label>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-slate-50">
        <input
          type="checkbox"
          checked={prefs.zipOutline}
          onChange={(e) => setPrefs({ zipOutline: e.target.checked })}
          className="h-4 w-4 accent-slate-900"
        />
        <span className="text-[13px] font-medium text-slate-800">Selected club's ZIP boundary</span>
      </label>

      <div className="mt-3 rounded-xl bg-slate-50 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`flex items-center gap-1.5 text-[11px] font-bold ${meta.text}`}>
            <span className={`h-2 w-2 rounded-full ${meta.dot} ${status === "loading" || refreshing ? "animate-pulse" : ""}`} />
            {refreshing ? "Refreshing…" : meta.label}
          </span>
          <button
            onClick={() => refresh(true)}
            disabled={status === "loading" || refreshing}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-900 disabled:opacity-40"
          >
            ↻ Refresh
          </button>
        </div>
        <p className="mt-1 text-[10.5px] leading-snug text-slate-500">
          {zips ? `${zips.features.length} ZIPs` : "—"} · {pois ? `${pois.features.length} places` : "—"} · synced{" "}
          {timeAgo(lastSync)}
          {latencyMs != null ? ` · ${(latencyMs / 1000).toFixed(1)}s` : ""}
        </p>
        {errors.length > 0 && <p className="mt-1 text-[10.5px] font-medium text-rose-600">{errors[0]}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export default function MapPanel({
  clubs,
  activeId,
  flyTo,
  savedIds,
  visible,
  totalCount,
  onMarkerHover,
  onOpen,
  onReset,
}: {
  clubs: Club[];
  activeId: string | null;
  flyTo: FlyTarget;
  savedIds: string[];
  visible: boolean;
  totalCount: number;
  onMarkerHover: (id: string | null) => void;
  onOpen: (id: string) => void;
  onReset: () => void;
}) {
  const { prefs, status, basemapsKey } = useCarto();
  const [map, setMap] = useState<L.Map | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const closeLayers = useCallback(() => setLayersOpen(false), []);

  const bounds = useMemo(() => L.latLngBounds(CLUBS.map((c) => [c.lat, c.lng] as [number, number])), []);
  const activeClub = CLUBS.find((c) => c.id === activeId) ?? null;
  const bm = resolveBasemap(prefs.basemap, basemapsKey);
  const bg = BASEMAP_STYLES[prefs.basemap].bg;
  const dark = prefs.basemap === "dark";
  const meta = STATUS_META[status];

  const resetView = () => {
    onReset();
    if (!map) return;
    const animate = !reducedMotion();
    if (clubs.length === 0) map.setView([25.825, -80.13], 12, { animate });
    else if (clubs.length === 1) map.setView([clubs[0].lat, clubs[0].lng], 14, { animate });
    else
      map.flyToBounds(L.latLngBounds(clubs.map((c) => [c.lat, c.lng] as [number, number])), {
        padding: [56, 56],
        duration: animate ? 0.9 : 0,
      });
  };

  return (
    <div className="relative h-full w-full" style={{ background: bg }}>
      <div className="absolute inset-0 grid place-items-center" aria-hidden>
        <p className={`animate-pulse text-sm font-medium ${dark ? "text-slate-500" : "text-slate-400"}`}>Loading coastline…</p>
      </div>

      <MapContainer
        ref={setMap}
        bounds={bounds}
        boundsOptions={{ padding: [56, 56] }}
        scrollWheelZoom
        zoomControl={false}
        maxZoom={19}
        className="h-full w-full"
        style={{ background: bg }}
        aria-label="Map of featured private clubs in Miami Beach"
      >
        <TileLayer
          key={`${bm.provider}-${prefs.basemap}-base`}
          url={bm.base.url}
          attribution={bm.base.attribution}
          subdomains={bm.base.subdomains ?? "abc"}
          maxNativeZoom={bm.base.maxNativeZoom}
          maxZoom={bm.base.maxZoom}
        />
        {/* Street labels sit above the data layer (z 455 > overlays 400) so they stay legible */}
        <Pane name="basemapLabels" style={{ zIndex: 455, pointerEvents: "none" }}>
          {bm.labels && (
            <TileLayer
              key={`${bm.provider}-${prefs.basemap}-labels`}
              url={bm.labels.url}
              subdomains={bm.labels.subdomains ?? "abc"}
              maxNativeZoom={bm.labels.maxNativeZoom}
              maxZoom={bm.labels.maxZoom}
            />
          )}
        </Pane>
        <ZoomControl position="topright" />
        <Flyer flyTo={flyTo} visible={visible} bounds={bounds} />

        {prefs.dataLayer && <ZipChoropleth metric={prefs.dataLayer} />}

        <Pane name="clubContext" style={{ zIndex: 450 }}>
          {activeClub && prefs.zipOutline && <ClubZipOutline club={activeClub} filled={!prefs.dataLayer} />}
        </Pane>

        <Pane name="nearbyPlaces" style={{ zIndex: 590 }}>
          {activeClub && prefs.places && <NearbyPlaces club={activeClub} dark={dark} />}
        </Pane>

        {clubs.map((c) => (
          <Marker
            key={c.id}
            position={[c.lat, c.lng]}
            icon={pillIcon(c, { active: activeId === c.id, saved: savedIds.includes(c.id) })}
            zIndexOffset={activeId === c.id ? 900 : 0}
            keyboard
            title={c.name}
            eventHandlers={{
              mouseover: () => onMarkerHover(c.id),
              mouseout: () => onMarkerHover(null),
              click: () => onOpen(c.id),
            }}
          >
            <Popup closeButton={false} offset={[0, -6]}>
              <div className="w-60 overflow-hidden">
                <img src={c.images[0]} alt="" className="h-24 w-full object-cover" />
                <div className="p-3">
                  <p className="text-[13px] font-bold text-slate-900">{c.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    ★ {c.rating.toFixed(1)} ({c.reviewsCount}) · {c.duesLabel}
                  </p>
                  <div className="mt-2.5 flex gap-1.5">
                    <button
                      onClick={() => onOpen(c.id)}
                      className="flex-1 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-700"
                    >
                      Details
                    </button>
                    <a
                      href={directionsUrl(c)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 rounded-full border border-slate-200 px-3 py-1.5 text-center text-[11px] font-semibold text-slate-700 hover:border-slate-900"
                    >
                      Directions
                    </a>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Overlays */}
      <div className="pointer-events-none absolute inset-0 z-[800]">
        <div className="absolute left-3 top-3 flex flex-col items-start">
          <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/95 py-1.5 pl-3 pr-3 text-xs font-medium text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur">
            <span>
              <b className="text-slate-900">{clubs.length}</b> of {totalCount} clubs
            </span>
            {clubs.length !== totalCount && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">FILTERED</span>
            )}
            <span className="h-3.5 w-px bg-slate-200" />
            <span className={`flex items-center gap-1.5 font-semibold ${meta.text}`}>
              <span className="relative flex h-2 w-2">
                {(status === "live" || status === "cached") && (
                  <span className={`absolute h-full w-full animate-[ping-soft_1.8s_ease-out_infinite] rounded-full ${meta.dot}`} />
                )}
                <span className={`h-2 w-2 rounded-full ${meta.dot} ${status === "loading" ? "animate-pulse" : ""}`} />
              </span>
              {meta.label}
            </span>
          </div>

          <div className="pointer-events-auto mt-2 flex gap-1.5">
            <button
              data-layers-toggle
              onClick={() => setLayersOpen((o) => !o)}
              aria-expanded={layersOpen}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold shadow-lg shadow-slate-900/10 backdrop-blur transition ${
                layersOpen
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200/80 bg-white/95 text-slate-700 hover:border-slate-900"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round">
                <path d="m12 3 9 5-9 5-9-5 9-5Z" />
                <path d="m3 13 9 5 9-5" />
              </svg>
              Layers
              {prefs.dataLayer && (
                <span className={`rounded-full px-1.5 text-[9px] font-bold ${layersOpen ? "bg-white/20" : "bg-teal-100 text-teal-800"}`}>
                  {METRICS[prefs.dataLayer].short}
                </span>
              )}
            </button>
            <button
              onClick={resetView}
              className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/95 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur transition hover:border-slate-900"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v5h5" />
              </svg>
              Reset
            </button>
          </div>

          {layersOpen && <LayersPanel onClose={closeLayers} />}
        </div>

        {activeClub && prefs.places && (
          <div className="absolute right-14 top-3 hidden max-w-[14rem] rounded-2xl border border-slate-200/80 bg-white/95 px-3 py-2 text-[11px] text-slate-600 shadow-lg shadow-slate-900/10 backdrop-blur md:block">
            <p className="font-bold text-slate-900">{activeClub.short} · within {fmtDistance(NEARBY_RADIUS_M)}</p>
            <p className="mt-0.5">Hover dots for dining, hotels, culture & parks</p>
          </div>
        )}

        <div className="absolute bottom-20 left-3 lg:bottom-3">
          <DataLegend metric={prefs.dataLayer} showMarkers />
        </div>
      </div>
    </div>
  );
}
