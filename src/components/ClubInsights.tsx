import { useMemo, useState } from "react";
import type { Club } from "../data";
import { useCarto } from "./CartoProvider";
import {
  METRICS,
  NEARBY_RADIUS_M,
  POI_GROUPS,
  compact,
  fmtDistance,
  moneyFull,
  moneyShort,
  pctDiff,
  poiGroup,
  rankOf,
  walkMinutes,
  zipOf,
  type MetricKey,
  type PoiGroupKey,
} from "../lib/insights";

function CartoBadge() {
  const { status } = useCarto();
  const dot =
    status === "loading"
      ? "bg-sky-400 animate-pulse"
      : status === "offline"
        ? "bg-rose-400"
        : status === "partial"
          ? "bg-amber-400"
          : "bg-emerald-400";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      LIVE · CARTO
    </span>
  );
}

function Delta({ pct, suffix = "vs metro" }: { pct: number; suffix?: string }) {
  if (!Number.isFinite(pct) || Math.abs(pct) < 1) return <span className="text-[11px] text-slate-400">≈ metro average</span>;
  const up = pct > 0;
  return (
    <span className={`text-[11px] font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% {suffix}
    </span>
  );
}

function Unavailable({ what }: { what: string }) {
  const { refresh, status } = useCarto();
  return (
    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 p-4">
      <p className="text-[13px] text-slate-500">
        {what} is unavailable right now — CARTO couldn't be reached.
      </p>
      <button
        onClick={() => refresh(true)}
        disabled={status === "loading"}
        className="shrink-0 rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
      >
        Retry
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compact chip for club cards                                         */
/* ------------------------------------------------------------------ */

export function NeighborhoodChip({ club }: { club: Club }) {
  const { zipByCode, status } = useCarto();
  const p = zipByCode.get(zipOf(club))?.properties;

  if (!p) {
    return status === "loading" ? (
      <div className="mt-3 h-[30px] animate-pulse rounded-xl bg-slate-100" aria-label="Loading neighborhood data" />
    ) : null;
  }

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl bg-teal-50/70 px-2.5 py-1.5 text-[11px] text-slate-600 ring-1 ring-teal-100"
      title="US Census ACS 2018 (5-yr) via CARTO Data Warehouse"
    >
      <span className="font-bold text-teal-800">ZIP {p.zip}</span>
      <span>
        Median home <b className="text-slate-900">{p.home_value != null ? moneyShort(p.home_value) : "—"}</b>
      </span>
      <span className="text-teal-300">•</span>
      <span>
        Income <b className="text-slate-900">{p.income != null ? moneyShort(p.income) : "—"}</b>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Neighborhood insights (detail drawer)                               */
/* ------------------------------------------------------------------ */

export function NeighborhoodSection({
  club,
  onShowLayer,
}: {
  club: Club;
  onShowLayer: (m: MetricKey) => void;
}) {
  const { zipByCode, zips, metro, status } = useCarto();
  const zip = zipOf(club);
  const p = zipByCode.get(zip)?.properties;

  const ranks = useMemo(
    () =>
      zips && zip
        ? { income: rankOf(zips, zip, "income"), home: rankOf(zips, zip, "home_value") }
        : { income: null, home: null },
    [zips, zip]
  );

  return (
    <section className="mt-6" aria-labelledby="nbhd-h">
      <div className="flex items-center justify-between gap-2">
        <h3 id="nbhd-h" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
          Neighborhood insights{p ? ` · ZIP ${p.zip} · ${p.city}` : ""}
        </h3>
        <CartoBadge />
      </div>

      {!p && status === "loading" && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      )}

      {!p && status !== "loading" && <Unavailable what="Neighborhood data" />}

      {p && (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Household income</p>
              <p className="mt-0.5 text-[17px] font-bold tracking-tight text-slate-900">
                {p.income != null ? moneyFull(p.income) : "—"}
              </p>
              {p.income != null && metro && <Delta pct={pctDiff(p.income, metro.income)} />}
            </div>
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Median home value</p>
              <p className="mt-0.5 text-[17px] font-bold tracking-tight text-slate-900">
                {p.home_value != null ? moneyFull(p.home_value) : "—"}
              </p>
              {p.home_value != null && metro && <Delta pct={pctDiff(p.home_value, metro.home_value)} />}
            </div>
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Residents</p>
              <p className="mt-0.5 text-[17px] font-bold tracking-tight text-slate-900">
                {p.pop != null ? p.pop.toLocaleString("en-US") : "—"}
              </p>
              <span className="text-[11px] text-slate-500">
                {p.density != null ? `${compact(p.density)} per km²` : "density n/a"}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Median age</p>
              <p className="mt-0.5 text-[17px] font-bold tracking-tight text-slate-900">
                {p.age != null ? p.age.toFixed(1) : "—"}
              </p>
              <span className="text-[11px] text-slate-500">
                {metro ? `Metro avg ${metro.age.toFixed(1)}` : ""}
              </span>
            </div>
          </div>

          {(ranks.income || ranks.home) && (
            <p className="mt-2.5 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-900">
              {ranks.income && (
                <>
                  <b>#{ranks.income.rank}</b> of {ranks.income.of} Miami-area ZIPs by household income
                </>
              )}
              {ranks.income && ranks.home && " · "}
              {ranks.home && (
                <>
                  <b>#{ranks.home.rank}</b> by home value
                </>
              )}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {(["home_value", "income"] as MetricKey[]).map((m) => (
              <button
                key={m}
                onClick={() => onShowLayer(m)}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-900"
              >
                <span className="flex overflow-hidden rounded-sm">
                  {METRICS[m].ramp.map((c) => (
                    <span key={c} className="h-2 w-1" style={{ background: c }} />
                  ))}
                </span>
                Map {METRICS[m].short.toLowerCase()}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] text-slate-400">
            US Census ACS 2018 (5-yr) × TIGER ZIP boundaries · queried live from the CARTO Data Warehouse · metro =
            {metro ? ` ${metro.zips} ZIPs, population-weighted` : " Miami-area ZIPs"}
          </p>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* What's nearby (detail drawer)                                       */
/* ------------------------------------------------------------------ */

export function NearbySection({ club, onShowOnMap }: { club: Club; onShowOnMap: () => void }) {
  const { poisByClub, status } = useCarto();
  const [group, setGroup] = useState<PoiGroupKey | "all">("all");
  const list = poisByClub[club.id] ?? [];

  const counts = useMemo(() => {
    const c: Partial<Record<PoiGroupKey, number>> = {};
    for (const f of list) {
      const g = poiGroup(f.properties.kind);
      c[g] = (c[g] ?? 0) + 1;
    }
    return c;
  }, [list]);

  const shown = (group === "all" ? list : list.filter((f) => poiGroup(f.properties.kind) === group)).slice(0, 8);
  const loaded = !!poisByClub && Object.keys(poisByClub).length > 0;

  return (
    <section className="mt-6" aria-labelledby="nearby-h">
      <div className="flex items-center justify-between gap-2">
        <h3 id="nearby-h" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
          What's nearby · within {fmtDistance(NEARBY_RADIUS_M)}
        </h3>
        {list.length > 0 && (
          <button
            onClick={onShowOnMap}
            className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white hover:bg-slate-700"
          >
            ◎ Show on map
          </button>
        )}
      </div>

      {!loaded && status === "loading" && (
        <div className="mt-2.5 space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {!loaded && status !== "loading" && <Unavailable what="Nearby places" />}

      {loaded && list.length === 0 && (
        <p className="mt-2.5 rounded-2xl border border-dashed border-slate-300 p-4 text-[13px] text-slate-500">
          No mapped places within {fmtDistance(NEARBY_RADIUS_M)} in OpenStreetMap yet.
        </p>
      )}

      {list.length > 0 && (
        <>
          <div className="slim-scroll -mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <button
              onClick={() => setGroup("all")}
              aria-pressed={group === "all"}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                group === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"
              }`}
            >
              All ({list.length})
            </button>
            {(Object.keys(POI_GROUPS) as PoiGroupKey[])
              .filter((g) => counts[g])
              .map((g) => (
                <button
                  key={g}
                  onClick={() => setGroup(g)}
                  aria-pressed={group === g}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                    group === g ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: POI_GROUPS[g].color }} />
                  {POI_GROUPS[g].label} ({counts[g]})
                </button>
              ))}
          </div>
          <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {shown.map((f) => {
              const g = POI_GROUPS[poiGroup(f.properties.kind)];
              return (
                <li key={f.properties.osm_id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm"
                    style={{ background: `${g.color}1a` }}
                    aria-hidden
                  >
                    {g.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-900">{f.properties.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {f.properties.kind} · {walkMinutes(f.properties.dist_m)} min walk
                    </p>
                  </div>
                  <span className="shrink-0 text-[12px] font-semibold text-slate-700">{fmtDistance(f.properties.dist_m)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[10.5px] text-slate-400">
            © OpenStreetMap contributors · spatial join (ST_DWITHIN) executed in the CARTO Data Warehouse
          </p>
        </>
      )}
    </section>
  );
}
