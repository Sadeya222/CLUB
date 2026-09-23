import { useMemo, useState } from "react";
import { CLUBS, formatUSD, type TourRequest } from "../data";
import { initialsOf, prettyDate, useLocalStorage } from "../lib/hooks";
import IntegrationsPanel from "./IntegrationsPanel";
import { onAvatarError } from "../lib/brand";

export type ProfileData = {
  name: string;
  email: string;
  city: string;
  budget: number;
  avatarHue: number;
};

export const DEFAULT_PROFILE: ProfileData = {
  name: "Alexandra Reyes",
  email: "a.reyes@meridian.co",
  city: "Miami Beach, FL",
  budget: 25000,
  avatarHue: 222,
};

type Tab = "account" | "tours" | "notifications" | "concierge" | "integrations";

const HUES = [222, 262, 200, 160, 24, 340];

function Toggle({
  label,
  desc,
  on,
  set,
}: {
  label: string;
  desc: string;
  on: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{desc}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => set(!on)}
        className={`mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-slate-900" : "bg-slate-300"}`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Profile({
  profile,
  onSaveProfile,
  saved,
  tours,
  onToggleSave,
  onOpenClub,
  onFocusClub,
  onCancelTour,
  onBack,
  onResetAll,
  notify,
}: {
  profile: ProfileData;
  onSaveProfile: (p: ProfileData) => void;
  saved: string[];
  tours: TourRequest[];
  onToggleSave: (id: string) => void;
  onOpenClub: (id: string) => void;
  onFocusClub: (id: string) => void;
  onCancelTour: (id: string) => void;
  onBack: () => void;
  onResetAll: () => void;
  notify: (t: { title: string; desc?: string; kind?: "success" | "info" | "error" }) => void;
}) {
  const [tab, setTab] = useState<Tab>("account");
  const [draft, setDraft] = useState<ProfileData>(profile);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notifs, setNotifs] = useLocalStorage("mc-notifs", {
    email: true,
    sms: false,
    tours: true,
    digest: true,
  });

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(profile), [draft, profile]);
  const savedClubs = CLUBS.filter((c) => saved.includes(c.id));
  const upcoming = [...tours].sort((a, b) => a.date.localeCompare(b.date));
  const affordable = CLUBS.filter((c) => c.duesValue <= draft.budget).length;

  const save = () => {
    const e: Record<string, string> = {};
    if (draft.name.trim().length < 2) e.name = "Please enter your full name.";
    if (!EMAIL_RE.test(draft.email.trim())) e.email = "That email doesn't look valid.";
    if (!draft.city.trim()) e.city = "Please add your home city.";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    onSaveProfile({ ...draft, name: draft.name.trim(), email: draft.email.trim(), city: draft.city.trim() });
    notify({ title: "Profile saved", desc: "Your details are up to date on this device." });
  };

  const exportData = () => {
    const blob = new Blob(
      [JSON.stringify({ profile, saved, tours, notifs, exportedAt: new Date().toISOString() }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "meridian-clubs-data.json";
    link.click();
    URL.revokeObjectURL(url);
    notify({ title: "Data exported", desc: "Your Meridian data downloaded as JSON." });
  };

  const erase = () => {
    if (window.confirm("Erase all Meridian data on this device — profile, shortlist, tours and chat?")) {
      onResetAll();
    }
  };

  const set = <K extends keyof ProfileData>(k: K, v: ProfileData[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:border-slate-400 hover:text-slate-900"
      >
        ← Back to explore
      </button>

      {/* identity card */}
      <div className="anim-fade-up flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:p-7">
        <span
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white shadow-md"
          style={{ background: `linear-gradient(135deg, hsl(${draft.avatarHue} 32% 30%), hsl(${draft.avatarHue} 40% 55%))` }}
        >
          {initialsOf(draft.name) || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-2xl font-semibold tracking-tight text-slate-900">
            {draft.name || "New member"}
          </h1>
          <p className="mt-0.5 truncate text-sm text-slate-500">
            {draft.email} · {draft.city}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
              ✦ Founding Member
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              ♥ {savedClubs.length} shortlisted
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              ◎ {upcoming.length} tour{upcoming.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        {dirty && (
          <span className="shrink-0 rounded-full bg-sky-100 px-3 py-1 text-[11px] font-bold text-sky-800">
            Unsaved changes
          </span>
        )}
      </div>

      {/* tabs */}
      <div className="mt-5 flex gap-1 overflow-x-auto rounded-2xl bg-slate-200/60 p-1" role="tablist">
        {(
          [
            ["account", "Account"],
            ["tours", `My Tours${upcoming.length ? ` (${upcoming.length})` : ""}`],
            ["notifications", "Notifications"],
            ["concierge", "AI Concierge"],
            ["integrations", "Integrations"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        {tab === "account" && (
          <div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Full name</span>
                <input
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${
                    errors.name ? "border-red-400" : "border-slate-200 focus:border-slate-900"
                  }`}
                />
                {errors.name && <span className="mt-1 block text-xs text-red-500">{errors.name}</span>}
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Email</span>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${
                    errors.email ? "border-red-400" : "border-slate-200 focus:border-slate-900"
                  }`}
                />
                {errors.email && <span className="mt-1 block text-xs text-red-500">{errors.email}</span>}
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Home city</span>
                <input
                  value={draft.city}
                  onChange={(e) => set("city", e.target.value)}
                  className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${
                    errors.city ? "border-red-400" : "border-slate-200 focus:border-slate-900"
                  }`}
                />
                {errors.city && <span className="mt-1 block text-xs text-red-500">{errors.city}</span>}
              </label>
              <div>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Avatar color</span>
                <div className="mt-2 flex gap-2">
                  {HUES.map((h) => (
                    <button
                      key={h}
                      onClick={() => set("avatarHue", h)}
                      aria-label={`Avatar color ${h}`}
                      aria-pressed={draft.avatarHue === h}
                      className={`h-8 w-8 rounded-full transition ${
                        draft.avatarHue === h ? "ring-2 ring-slate-900 ring-offset-2" : "hover:scale-110"
                      }`}
                      style={{ background: `linear-gradient(135deg, hsl(${h} 32% 30%), hsl(${h} 40% 55%))` }}
                    />
                  ))}
                </div>
              </div>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Annual dues budget — {formatUSD(draft.budget)}
                </span>
                <input
                  type="range"
                  min={4000}
                  max={35000}
                  step={500}
                  value={draft.budget}
                  onChange={(e) => set("budget", +e.target.value)}
                  className="mt-3 w-full accent-slate-900"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  {affordable} of {CLUBS.length} featured clubs fit this budget.
                </span>
              </label>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={save}
                disabled={!dirty}
                className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40"
              >
                {dirty ? "Save changes" : "All changes saved ✓"}
              </button>
              {dirty && (
                <button
                  onClick={() => {
                    setDraft(profile);
                    setErrors({});
                  }}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:border-slate-400"
                >
                  Discard
                </button>
              )}
            </div>

            <div className="mt-7 border-t border-slate-100 pt-5">
              <h3 className="text-sm font-bold text-slate-900">Privacy & data</h3>
              <p className="mt-1 text-xs text-slate-500">
                Everything is stored locally in this browser — Meridian never uploads your profile.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={exportData}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-900"
                >
                  ⤓ Export my data (JSON)
                </button>
                <button
                  onClick={erase}
                  className="flex-1 rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Erase everything on this device
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "tours" && (
          <div>
            {upcoming.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <p className="text-3xl">◎</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">No tours yet</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">
                  Request one from any club's details page — or ask Alfred to “book a tour at The Surf Club”.
                </p>
                <button
                  onClick={onBack}
                  className="mt-4 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  Browse clubs
                </button>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {upcoming.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900">{t.clubName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {prettyDate(t.date)} at {t.time} · {t.guests} guest{t.guests > 1 ? "s" : ""} · for {t.name}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-slate-400">REF {t.id}</p>
                    </div>
                    <span className="w-fit rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                      {t.status === "confirmed" ? "✓ Confirmed" : "◷ Requested"}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => onOpenClub(t.clubId)}
                        className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-900"
                      >
                        View club
                      </button>
                      <button
                        onClick={() => onCancelTour(t.id)}
                        className="rounded-full border border-red-200 px-3.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "notifications" && (
          <div>
            <div className="divide-y divide-slate-100">
              <Toggle label="Email updates" desc="Membership openings, new clubs and social calendar highlights." on={notifs.email} set={(v) => setNotifs({ ...notifs, email: v })} />
              <Toggle label="SMS alerts" desc="Time-sensitive waitlist movement and tour confirmations." on={notifs.sms} set={(v) => setNotifs({ ...notifs, sms: v })} />
              <Toggle label="Tour reminders" desc="A nudge 2 hours before every scheduled club tour." on={notifs.tours} set={(v) => setNotifs({ ...notifs, tours: v })} />
              <Toggle label="Weekly digest" desc="Every Sunday: clubs matching your budget and saved amenities." on={notifs.digest} set={(v) => setNotifs({ ...notifs, digest: v })} />
            </div>
            <button
              onClick={() => notify({ title: "Test notification sent", desc: "This is how Meridian alerts will look.", kind: "info" })}
              className="mt-4 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-900"
            >
              Send a test notification
            </button>
          </div>
        )}

        {tab === "concierge" && (
          <ConciergePrefs />
        )}

        {tab === "integrations" && <IntegrationsPanel notify={notify} />}
      </div>

      {/* shortlist */}
      <h2 className="mb-3 mt-8 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
        Your shortlist · {savedClubs.length}
      </h2>
      {savedClubs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          Nothing saved yet — hover any club card and tap ♥, or ask Alfred to “Save The Surf Club”.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {savedClubs.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex gap-3 p-3">
                <img src={c.images[0]} alt="" className="h-16 w-20 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.duesLabel}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      onClick={() => {
                        onFocusClub(c.id);
                      }}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      Locate →
                    </button>
                    <button
                      onClick={() => onOpenClub(c.id)}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      Details
                    </button>
                    <button
                      onClick={() => onToggleSave(c.id)}
                      className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="h-28" />
    </div>
  );
}

function ConciergePrefs() {
  const [prefs, setPrefs] = useLocalStorage("mc-agent-prefs", {
    proactiveTips: true,
    chatMemory: true,
    voiceReplies: false,
  });
  return (
    <div>
      <div className="mb-2 flex items-center gap-3 rounded-2xl bg-slate-900 p-4 text-white">
        <img
          src="agent.png"
          onError={onAvatarError}
          alt="Alfred"
          className="h-11 w-11 rounded-full object-cover ring-2 ring-amber-300"
        />
        <div>
          <p className="text-sm font-semibold">Alfred · your AI concierge</p>
          <p className="text-xs text-slate-300">Suited, booted and ready to act on your behalf.</p>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        <Toggle label="Proactive tips" desc="Alfred may greet you with a helpful suggestion when you arrive." on={prefs.proactiveTips} set={(v) => setPrefs({ ...prefs, proactiveTips: v })} />
        <Toggle label="Remember conversation" desc="Keep chat history on this device between visits. Off = fresh start every time." on={prefs.chatMemory} set={(v) => setPrefs({ ...prefs, chatMemory: v })} />
        <Toggle label="Voice replies" desc="Alfred reads his answers aloud using your device's speech engine." on={prefs.voiceReplies} set={(v) => setPrefs({ ...prefs, voiceReplies: v })} />
      </div>
    </div>
  );
}
