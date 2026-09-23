import { useEffect, useMemo, useState } from "react";
import { REVIEWS, directionsUrl, type Club, type TourRequest } from "../data";
import { nextSaturday, prettyDate, useBodyLock, useEscape } from "../lib/hooks";
import type { MetricKey } from "../lib/insights";
import { NearbySection, NeighborhoodSection } from "./ClubInsights";

const TIMES = ["9:00 AM", "11:00 AM", "1:00 PM", "3:00 PM", "5:00 PM"];

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          className={i <= Math.round(rating) ? "fill-amber-400" : "fill-slate-200"}
          aria-hidden
        >
          <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" />
        </svg>
      ))}
    </span>
  );
}

export default function ClubDetail({
  club,
  saved,
  profileName,
  onClose,
  onToggleSave,
  onFocusMap,
  onBookTour,
  onShowLayer,
  onShowNearby,
}: {
  club: Club | null;
  saved: boolean;
  profileName: string;
  onClose: () => void;
  onToggleSave: (id: string) => void;
  onFocusMap: (id: string) => void;
  onShowLayer: (m: MetricKey) => void;
  onShowNearby: (id: string) => void;
  onBookTour: (t: Omit<TourRequest, "id" | "status" | "createdAt">) => TourRequest;
}) {
  const [photo, setPhoto] = useState(0);
  const [date, setDate] = useState(nextSaturday());
  const [time, setTime] = useState(TIMES[1]);
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState(profileName);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<TourRequest | null>(null);

  useBodyLock(!!club);
  useEscape(onClose, !!club);

  useEffect(() => {
    setPhoto(0);
    setDate(nextSaturday());
    setTime(TIMES[1]);
    setGuests(2);
    setName(profileName);
    setError("");
    setBooked(null);
  }, [club?.id, profileName]);

  const reviews = useMemo(
    () => (club ? REVIEWS.filter((r) => r.clubId === club.id) : []),
    [club]
  );
  const today = new Date().toISOString().slice(0, 10);

  if (!club) return null;

  const submit = () => {
    if (name.trim().length < 2) {
      setError("Please add the full name for the tour party.");
      return;
    }
    if (!date || date < today) {
      setError("Please choose a tour date in the future.");
      return;
    }
    setError("");
    setBooked(
      onBookTour({ clubId: club.id, clubName: club.name, date, time, guests, name: name.trim() })
    );
  };

  return (
    <div className="fixed inset-0 z-[1500]" role="dialog" aria-modal="true" aria-label={`${club.name} details`}>
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="anim-drawer absolute inset-x-0 bottom-0 top-[4%] flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:w-[36rem] sm:max-w-[94vw] sm:rounded-none">
        {/* gallery */}
        <div className="relative h-60 shrink-0 overflow-hidden bg-slate-900 sm:h-72">
          <img
            key={photo}
            src={club.images[photo]}
            alt={`${club.name} grounds`}
            className="anim-fade-up h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-slate-950/30" />
          <button
            onClick={onClose}
            autoFocus
            aria-label="Close details"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-sm font-bold text-slate-800 shadow-lg hover:bg-white"
          >
            ✕
          </button>
          <button
            onClick={() => onToggleSave(club.id)}
            aria-pressed={saved}
            aria-label={saved ? "Remove from shortlist" : "Save to shortlist"}
            className={`absolute right-14 top-4 flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold shadow-lg transition active:scale-95 ${
              saved ? "bg-rose-500 text-white" : "bg-white/95 text-slate-800 hover:text-rose-500"
            }`}
          >
            {saved ? "♥ Saved" : "♡ Save"}
          </button>
          {club.images.length > 1 && (
            <div className="absolute bottom-4 right-4 flex gap-1.5">
              {club.images.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setPhoto(i)}
                  aria-label={`View photo ${i + 1}`}
                  className={`h-11 w-16 overflow-hidden rounded-lg ring-2 transition ${
                    photo === i ? "ring-amber-300" : "ring-white/40 opacity-80 hover:opacity-100"
                  }`}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="absolute bottom-4 left-5 right-40 sm:right-48">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">
              {club.neighborhood} · est. {club.founded}
            </p>
            <h2 className="font-display mt-1 text-2xl font-semibold leading-tight text-white sm:text-3xl">
              {club.name}
            </h2>
            <div className="mt-1.5 flex items-center gap-2">
              <StarRow rating={club.rating} />
              <span className="text-xs font-semibold text-white">{club.rating.toFixed(1)}</span>
              <span className="text-xs text-white/70">· {club.reviewsCount} member reviews</span>
            </div>
          </div>
        </div>

        {/* body */}
        <div className="slim-scroll flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Annual dues", club.duesLabel],
              ["Initiation", club.initiation],
              ["Access", club.members],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{k}</p>
                <p className="mt-1 text-[13px] font-bold leading-tight text-slate-900">{v}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <a
              href={directionsUrl(club)}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-center text-[13px] font-semibold text-slate-800 transition hover:border-slate-900"
            >
              ↗ Directions
            </a>
            <button
              onClick={() => onFocusMap(club.id)}
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] font-semibold text-slate-800 transition hover:border-slate-900"
            >
              ◎ Locate on map
            </button>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-slate-600">{club.description}</p>

          <NeighborhoodSection club={club} onShowLayer={onShowLayer} />

          <h3 className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
            Amenities
          </h3>
          <ul className="mt-2.5 grid grid-cols-2 gap-1.5">
            {club.amenities.map((a) => (
              <li
                key={a}
                className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-medium text-slate-700"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 12.5 9.5 18 20 6" />
                </svg>
                {a}
              </li>
            ))}
          </ul>

          <NearbySection key={club.id} club={club} onShowOnMap={() => onShowNearby(club.id)} />

          <h3 className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
            Good to know
          </h3>
          <dl className="mt-2.5 space-y-2 rounded-2xl border border-slate-200 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Address</dt>
              <dd className="text-right font-medium text-slate-900">{club.address}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Hours</dt>
              <dd className="font-medium text-slate-900">{club.hours}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Membership office</dt>
              <dd className="font-medium text-slate-900">{club.phone}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Website</dt>
              <dd>
                <a href={club.website} target="_blank" rel="noreferrer" className="font-medium text-sky-700 underline-offset-2 hover:underline">
                  {club.websiteLabel} ↗
                </a>
              </dd>
            </div>
          </dl>

          <h3 className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
            Member reviews
          </h3>
          <div className="mt-2.5 space-y-2.5">
            {reviews.map((r) => (
              <figure key={r.author} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <StarRow rating={r.rating} size={12} />
                  <span className="text-[11px] text-slate-400">{r.meta}</span>
                </div>
                <figcaption className="mt-1.5 text-sm font-semibold text-slate-900">
                  “{r.title}” <span className="font-normal text-slate-400">— {r.author}</span>
                </figcaption>
                <blockquote className="mt-1 text-[13px] leading-relaxed text-slate-600">
                  {r.text}
                </blockquote>
              </figure>
            ))}
          </div>

          {/* tour booking */}
          <div className="mt-6 overflow-hidden rounded-2xl bg-slate-900 p-5 text-white">
            {booked ? (
              <div className="anim-fade-up text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/20 text-xl text-emerald-300">
                  ✓
                </span>
                <h3 className="font-display mt-3 text-xl font-semibold">Tour requested</h3>
                <p className="mt-1.5 text-sm text-slate-300">
                  {booked.clubName} · {prettyDate(booked.date)} at {booked.time} ·{" "}
                  {booked.guests} guest{booked.guests > 1 ? "s" : ""}
                </p>
                <p className="mt-2 inline-block rounded-full bg-white/10 px-3 py-1 font-mono text-xs tracking-wider text-amber-300">
                  REF {booked.id}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Track it under Profile → My Tours. The membership office replies within 24 hours.
                </p>
                <button
                  onClick={onClose}
                  className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-200"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <h3 className="font-display text-lg font-semibold">Request a private tour</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Complimentary · hosted by the membership office · ~45 minutes
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Date</span>
                    <input
                      type="date"
                      min={today}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white [color-scheme:dark] focus:border-amber-300 focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Time</span>
                    <select
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white focus:border-amber-300 focus:outline-none [&>option]:text-slate-900"
                    >
                      {TIMES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Guests</span>
                    <select
                      value={guests}
                      onChange={(e) => setGuests(+e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white focus:border-amber-300 focus:outline-none [&>option]:text-slate-900"
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n} guest{n > 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Full name</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-300 focus:outline-none"
                    />
                  </label>
                </div>
                {error && (
                  <p role="alert" className="mt-2.5 rounded-xl bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300">
                    {error}
                  </p>
                )}
                <button
                  onClick={submit}
                  className="mt-3.5 w-full rounded-xl bg-amber-300 py-3 text-sm font-bold text-slate-900 transition hover:bg-amber-200 active:scale-[0.99]"
                >
                  Request tour at {club.short}
                </button>
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  Complimentary · no payment required · saved to your profile
                </p>
              </>
            )}
          </div>
          <div className="h-6" />
        </div>
      </aside>
    </div>
  );
}
