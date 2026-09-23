import { useState, useSyncExternalStore } from "react";
import { useCarto } from "./CartoProvider";
import {
  clearCartoCache,
  decodeToken,
  friendlyError,
  getCartoLog,
  maskToken,
  normalizeBaseUrl,
  probeCartoApis,
  saveCartoOverride,
  subscribeCartoLog,
  testCartoConnection,
  validateBasemapsKey,
  validateCartoConfig,
  type CartoConfig,
  type ProbeResult,
} from "../lib/carto";
import { DATASETS, timeAgo } from "../lib/insights";

type Notify = (t: { title: string; desc?: string; kind?: "success" | "info" | "error" }) => void;

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  loading: { label: "Syncing", cls: "bg-sky-400/15 text-sky-300" },
  live: { label: "Connected", cls: "bg-emerald-400/15 text-emerald-300" },
  cached: { label: "Connected · cached", cls: "bg-emerald-400/15 text-emerald-300" },
  partial: { label: "Degraded", cls: "bg-amber-400/15 text-amber-300" },
  offline: { label: "Offline", cls: "bg-rose-400/15 text-rose-300" },
};

function BasemapsCard({ notify }: { notify: Notify }) {
  const { basemapsKey, basemapsKeySource, setBasemapsKey } = useCarto();
  const [draft, setDraft] = useState("");
  const [check, setCheck] = useState<{ state: "idle" | "checking" | "error"; msg?: string }>({ state: "idle" });

  const save = async () => {
    const key = draft.trim();
    if (key.length < 8) {
      setCheck({ state: "error", msg: "Paste the key CARTO emailed you." });
      return;
    }
    setCheck({ state: "checking" });
    const verdict = await validateBasemapsKey(key);
    if (verdict === "invalid") {
      setCheck({
        state: "error",
        msg: "CARTO didn't accept this key — tiles are still watermarked. Check for typos or referrer restrictions.",
      });
      return;
    }
    setBasemapsKey(key);
    setDraft("");
    setCheck({ state: "idle" });
    notify({
      title: "CARTO basemaps enabled",
      desc: verdict === "valid" ? "Key verified — watermark-free CARTO tiles are live." : "Key saved, but it couldn't be verified from this network.",
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Basemap tiles</h3>
          <p className="text-xs text-slate-500">
            {basemapsKey
              ? `CARTO basemaps · key from ${basemapsKeySource === "env" ? "project .env" : "this device"}`
              : "Esri keyless fallback is active"}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
            basemapsKey ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
          }`}
        >
          {basemapsKey ? "✓ CARTO tiles" : "Key recommended"}
        </span>
      </div>

      {!basemapsKey && (
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          Since August 2026 CARTO stamps keyless basemap tiles with an “API key required” watermark. Basemaps use a
          separate free key — the Maps API token above was tested and isn't accepted for tiles. Until you add one,
          Meridian serves clean Esri tiles so the map never shows a watermark.
        </p>
      )}

      {basemapsKey && basemapsKeySource === "custom" && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <span className="font-mono text-[12px] text-slate-700">{maskToken(basemapsKey)}</span>
          <button
            onClick={() => {
              setBasemapsKey(null);
              notify({ title: "Basemaps key removed", desc: "Falling back to keyless Esri tiles.", kind: "info" });
            }}
            className="rounded-full border border-red-200 px-3 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
          >
            Remove
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setCheck({ state: "idle" });
          }}
          placeholder={basemapsKey ? "Replace basemaps key…" : "Paste your CARTO Basemaps key"}
          aria-label="CARTO Basemaps key"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 font-mono text-[12px] focus:border-slate-900 focus:outline-none"
        />
        <button
          onClick={save}
          disabled={check.state === "checking" || !draft.trim()}
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {check.state === "checking" ? "Verifying…" : "Verify & save"}
        </button>
      </div>
      {check.state === "error" && (
        <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
          {check.msg}
        </p>
      )}
      <p className="mt-2.5 text-xs text-slate-400">
        <a
          href="https://carto.com/basemaps/apikey"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-sky-700 hover:underline"
        >
          Get a free CARTO Basemaps key ↗
        </a>{" "}
        · emailed instantly, no CARTO account needed
      </p>
    </div>
  );
}

export default function IntegrationsPanel({ notify }: { notify: Notify }) {
  const { config, status, zips, pois, lastSync, latencyMs, refresh, refreshing, errors, reloadConfig } = useCarto();
  const log = useSyncExternalStore(subscribeCartoLog, getCartoLog);
  const { accountId, tokenId } = decodeToken(config.accessToken);

  const [reveal, setReveal] = useState(false);
  const [probes, setProbes] = useState<ProbeResult[] | null>(null);
  const [probing, setProbing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CartoConfig>({
    apiBaseUrl: config.apiBaseUrl,
    accessToken: "",
    connection: config.connection,
  });
  const [draftErrors, setDraftErrors] = useState<Partial<Record<keyof CartoConfig, string>>>({});
  const [test, setTest] = useState<{ state: "idle" | "testing" | "ok" | "fail"; msg?: string }>({ state: "idle" });

  const pill = STATUS_PILL[refreshing ? "loading" : status];

  const runDiagnostics = async () => {
    setProbing(true);
    try {
      setProbes(await probeCartoApis(config));
    } finally {
      setProbing(false);
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(config.accessToken);
      notify({ title: "Token copied", desc: "CARTO access token is on your clipboard.", kind: "info" });
    } catch {
      notify({ title: "Couldn't copy", desc: "Clipboard access was blocked by the browser.", kind: "error" });
    }
  };

  const updateDraft = (patch: Partial<CartoConfig>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setTest({ state: "idle" });
  };

  const testDraft = async () => {
    const errs = validateCartoConfig(draft);
    setDraftErrors(errs);
    if (Object.keys(errs).length) return;
    setTest({ state: "testing" });
    try {
      const ms = await testCartoConnection({ ...draft, apiBaseUrl: normalizeBaseUrl(draft.apiBaseUrl) });
      setTest({ state: "ok", msg: `Maps API reachable · ${ms} ms` });
    } catch (e) {
      setTest({ state: "fail", msg: friendlyError(e) });
    }
  };

  const saveDraft = () => {
    saveCartoOverride(draft);
    reloadConfig();
    setEditing(false);
    setProbes(null);
    notify({ title: "CARTO credentials updated", desc: "Refetching neighborhood data with the new token." });
  };

  const restoreDefaults = () => {
    saveCartoOverride(null);
    reloadConfig();
    setProbes(null);
    notify({ title: "Using project credentials", desc: "Reverted to the credentials configured in .env.", kind: "info" });
  };

  const inferredMaps: ProbeResult | null =
    zips || pois
      ? { api: "maps", label: "Maps API", ok: true, ms: latencyMs ?? 0, detail: `Spatial SQL on ${config.connection}` }
      : null;
  const rows: (ProbeResult | { api: string; label: string; pending: true; detail: string })[] = probes ?? [
    inferredMaps ?? { api: "maps", label: "Maps API", pending: true, detail: "Not checked yet" },
    { api: "sql", label: "SQL API", pending: true, detail: "Run diagnostics to check" },
    { api: "lds", label: "LDS API", pending: true, detail: "Run diagnostics to check" },
  ];

  return (
    <div className="space-y-5">
      {/* status hero */}
      <div className="overflow-hidden rounded-2xl bg-slate-900 p-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[11px] font-black tracking-tight text-slate-900">
              CARTO
            </span>
            <div>
              <p className="text-sm font-semibold">CARTO location intelligence</p>
              <p className="text-xs text-slate-400">
                Maps API v3 · {config.connection === "carto_dw" ? "CARTO Data Warehouse" : config.connection}
              </p>
            </div>
          </div>
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${pill.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === "loading" || refreshing ? "animate-pulse" : ""}`} />
            {pill.label}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Last sync", timeAgo(lastSync)],
            ["Latency", latencyMs != null ? `${(latencyMs / 1000).toFixed(1)}s` : "cached"],
            ["ZIP polygons", zips ? String(zips.features.length) : "—"],
            ["Nearby places", pois ? String(pois.features.length) : "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/5 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{k}</p>
              <p className="mt-0.5 text-sm font-bold">{v}</p>
            </div>
          ))}
        </div>
        {errors.length > 0 && (
          <p className="mt-3 rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-200">{errors.join(" · ")}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => refresh(true)}
            disabled={status === "loading" || refreshing}
            className="rounded-xl bg-amber-300 px-4 py-2 text-xs font-bold text-slate-900 transition hover:bg-amber-200 disabled:opacity-50"
          >
            ↻ Refresh data now
          </button>
          <button
            onClick={() => {
              clearCartoCache();
              notify({ title: "CARTO cache cleared", desc: "Next load will query CARTO directly.", kind: "info" });
            }}
            className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            Clear local cache
          </button>
        </div>
      </div>

      <BasemapsCard notify={notify} />

      {/* connection */}
      <div>
        <h3 className="text-sm font-bold text-slate-900">Connection</h3>
        <dl className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 text-sm">
          {[
            ["API base URL", <span className="break-all font-mono text-[12px]">{config.apiBaseUrl}</span>],
            ["Connection", <span className="font-mono text-[12px]">{config.connection}</span>],
            ["Account", <span className="font-mono text-[12px]">{accountId ?? "—"}</span>],
            ["Token ID", <span className="font-mono text-[12px]">{tokenId ?? "—"}</span>],
            [
              "Access token",
              <span className="flex flex-wrap items-center justify-end gap-1.5">
                <span className="break-all font-mono text-[12px]">{reveal ? config.accessToken : maskToken(config.accessToken)}</span>
                <button
                  onClick={() => setReveal((r) => !r)}
                  className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-slate-900"
                >
                  {reveal ? "Hide" : "Show"}
                </button>
                <button
                  onClick={copyToken}
                  className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-slate-900"
                >
                  Copy
                </button>
              </span>,
            ],
            [
              "Credentials",
              <span className="text-[12px] font-semibold text-slate-700">
                {config.source === "env" ? "Project environment (.env)" : "Custom override · this device"}
              </span>,
            ],
          ].map(([k, v], i) => (
            <div key={i} className="flex items-start justify-between gap-4 px-4 py-2.5">
              <dt className="shrink-0 text-slate-500">{k}</dt>
              <dd className="text-right text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* capabilities */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">API capabilities</h3>
          <button
            onClick={runDiagnostics}
            disabled={probing}
            className="rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {probing ? "Running…" : "Run diagnostics"}
          </button>
        </div>
        <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {rows.map((r) => {
            const pending = "pending" in r;
            const ok = !pending && (r as ProbeResult).ok;
            return (
              <li key={r.api} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    pending ? "bg-slate-100 text-slate-400" : ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {pending ? "?" : ok ? "✓" : "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{r.label}</p>
                  <p className="text-xs text-slate-500">{r.detail}</p>
                </div>
                {!pending && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {ok ? `Granted${(r as ProbeResult).ms ? ` · ${(r as ProbeResult).ms} ms` : ""}` : `Not available${(r as ProbeResult).status ? ` · ${(r as ProbeResult).status}` : ""}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Meridian only requires the <b>Maps API</b>. Grant LDS in CARTO Workspace to unlock geocoding, drive-time isolines and routing.
        </p>
      </div>

      {/* datasets */}
      <div>
        <h3 className="text-sm font-bold text-slate-900">Datasets in use</h3>
        <ul className="mt-2 space-y-2">
          {DATASETS.map((d) => (
            <li key={d.id} className="rounded-2xl border border-slate-200 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{d.name}</p>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  {d.key === "pois" ? (pois ? `${pois.features.length} rows` : "—") : zips ? `${zips.features.length} ZIPs` : "—"}
                </span>
              </div>
              <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">{d.id}</p>
              <p className="mt-1 text-xs text-slate-500">
                {d.provider} · {d.use}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {/* request log */}
      <div>
        <h3 className="text-sm font-bold text-slate-900">Recent requests</h3>
        {log.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-slate-300 p-4 text-xs text-slate-500">
            No requests yet this session.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {log.slice(0, 6).map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <span className={`h-2 w-2 shrink-0 rounded-full ${e.ok ? "bg-emerald-500" : "bg-rose-500"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-800">{e.label}</p>
                  <p className="text-slate-500">
                    {e.source === "network" ? "CARTO" : e.source === "cache" ? "Local cache" : "Stale cache (fallback)"}
                    {e.features != null ? ` · ${e.features} features` : ""}
                    {e.bytes ? ` · ${(e.bytes / 1024).toFixed(1)} KB` : ""}
                    {e.error ? ` · ${e.error}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-slate-500">{e.source === "network" ? `${e.ms} ms` : "0 ms"}</span>
                <span className="hidden shrink-0 text-slate-400 sm:inline">{timeAgo(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* custom credentials */}
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Use different credentials</h3>
            <p className="text-xs text-slate-500">Rotate or test a token without redeploying. Stored on this device only.</p>
          </div>
          <div className="flex gap-1.5">
            {config.source === "custom" && (
              <button
                onClick={restoreDefaults}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-900"
              >
                Restore project default
              </button>
            )}
            <button
              onClick={() => setEditing((e) => !e)}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-900"
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          </div>
        </div>

        {editing && (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">API base URL</span>
              <input
                value={draft.apiBaseUrl}
                onChange={(e) => updateDraft({ apiBaseUrl: e.target.value })}
                className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 font-mono text-[13px] focus:outline-none ${
                  draftErrors.apiBaseUrl ? "border-red-400" : "border-slate-200 focus:border-slate-900"
                }`}
              />
              {draftErrors.apiBaseUrl && <span className="mt-1 block text-xs text-red-500">{draftErrors.apiBaseUrl}</span>}
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">API access token</span>
              <textarea
                value={draft.accessToken}
                onChange={(e) => updateDraft({ accessToken: e.target.value })}
                rows={3}
                placeholder="eyJhbGciOi…"
                className={`mt-1.5 w-full resize-none rounded-xl border px-3.5 py-2.5 font-mono text-[12px] focus:outline-none ${
                  draftErrors.accessToken ? "border-red-400" : "border-slate-200 focus:border-slate-900"
                }`}
              />
              {draftErrors.accessToken && <span className="mt-1 block text-xs text-red-500">{draftErrors.accessToken}</span>}
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Connection</span>
              <input
                value={draft.connection}
                onChange={(e) => updateDraft({ connection: e.target.value })}
                className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 font-mono text-[13px] focus:outline-none ${
                  draftErrors.connection ? "border-red-400" : "border-slate-200 focus:border-slate-900"
                }`}
              />
              {draftErrors.connection && <span className="mt-1 block text-xs text-red-500">{draftErrors.connection}</span>}
            </label>

            {test.state !== "idle" && (
              <p
                role="status"
                className={`rounded-xl px-3 py-2 text-xs font-medium ${
                  test.state === "ok"
                    ? "bg-emerald-50 text-emerald-700"
                    : test.state === "fail"
                      ? "bg-red-50 text-red-600"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {test.state === "testing" ? "Testing connection…" : test.msg}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={testDraft}
                disabled={test.state === "testing"}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-800 hover:border-slate-900 disabled:opacity-50"
              >
                Test connection
              </button>
              <button
                onClick={saveDraft}
                disabled={test.state !== "ok"}
                className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
              >
                Save & use
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="rounded-2xl bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900">
        <b>Security note:</b> CARTO API Access Tokens are delivered to the browser by design. In CARTO Workspace → Developers →
        Credentials, limit this token to the datasets above and to your production domain(s) as allowed referrers.
      </p>
    </div>
  );
}
