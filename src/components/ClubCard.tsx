import type { Club } from "../data";
import { NeighborhoodChip } from "./ClubInsights";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width="12"
          height="12"
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

export default function ClubCard({
  club,
  active,
  saved,
  onHover,
  onFocus,
  onOpen,
  onToggleSave,
}: {
  club: Club;
  active: boolean;
  saved: boolean;
  onHover: (id: string | null) => void;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
  onToggleSave: (id: string) => void;
}) {
  return (
    <article
      onMouseEnter={() => onHover(club.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(club.id)}
      onBlur={() => onHover(null)}
      onClick={() => {
        onFocus(club.id);
        onOpen(club.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onFocus(club.id);
          onOpen(club.id);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`View details for ${club.name}`}
      className={`anim-fade-up group cursor-pointer overflow-hidden rounded-2xl border bg-white transition-all duration-200 ${
        active
          ? "border-slate-900 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900"
          : "border-slate-200/90 shadow-sm shadow-slate-900/[0.03] hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-lg hover:shadow-slate-900/10"
      }`}
    >
      <div className="relative h-44 overflow-hidden bg-slate-100 sm:h-48">
        <img
          src={club.images[0]}
          alt={`${club.name} — oceanfront grounds`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-900 shadow-sm backdrop-blur">
            est. {club.founded}
          </span>
          <span className="rounded-full bg-slate-950/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            {club.neighborhood}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSave(club.id);
          }}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${club.name} from shortlist` : `Save ${club.name} to shortlist`}
          className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-base shadow-md backdrop-blur transition active:scale-90 ${
            saved ? "bg-rose-500 text-white" : "bg-white/95 text-slate-700 hover:text-rose-500"
          }`}
        >
          {saved ? "♥" : "♡"}
        </button>
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-white/95 py-1 pl-2 pr-2.5 shadow-sm backdrop-blur">
          <Stars rating={club.rating} />
          <span className="text-[11px] font-bold text-slate-900">{club.rating.toFixed(1)}</span>
          <span className="text-[11px] text-slate-500">({club.reviewsCount})</span>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[17px] font-semibold leading-tight tracking-tight text-slate-900">
              {club.name}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{club.address}</p>
          </div>
          <span
            className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full transition ${
              active ? "animate-pulse bg-emerald-500" : "bg-slate-200 group-hover:bg-slate-300"
            }`}
            title={active ? "Located on map" : undefined}
          />
        </div>
        <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-slate-600">
          {club.tagline}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {club.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600"
            >
              {t}
            </span>
          ))}
        </div>
        <NeighborhoodChip club={club} />
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5">
          <div>
            <p className="text-[15px] font-bold tracking-tight text-slate-900">{club.duesLabel}</p>
            <p className="text-[11px] text-slate-500">{club.members}</p>
          </div>
          <span className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition group-hover:bg-slate-700">
            View details →
          </span>
        </div>
      </div>
    </article>
  );
}
