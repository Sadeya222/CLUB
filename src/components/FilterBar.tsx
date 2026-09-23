import { FILTER_AMENITIES, formatUSD, type SortKey } from "../data";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "rating", label: "Top rated" },
  { key: "duesAsc", label: "Dues: low → high" },
  { key: "duesDesc", label: "Dues: high → low" },
];

export default function FilterBar(props: {
  query: string;
  setQuery: (v: string) => void;
  amenity: string | null;
  setAmenity: (v: string | null) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  maxDues: number | null;
  setMaxDues: (v: number | null) => void;
  savedOnly: boolean;
  setSavedOnly: (v: boolean) => void;
  savedCount: number;
  resultCount: number;
  totalCount: number;
  hasActive: boolean;
  onClear: () => void;
}) {
  const {
    query,
    setQuery,
    amenity,
    setAmenity,
    sort,
    setSort,
    maxDues,
    setMaxDues,
    savedOnly,
    setSavedOnly,
    savedCount,
    resultCount,
    totalCount,
    hasActive,
    onClear,
  } = props;

  return (
    <div className="border-b border-slate-200/80 bg-white px-4 pb-3 pt-4 sm:px-6">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <input
            id="club-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clubs, neighborhoods, amenities…  ( / )"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-600 hover:bg-slate-300"
            >
              ✕
            </button>
          )}
        </label>
        <label className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 sm:flex">
          <span className="text-xs text-slate-400">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-transparent py-2.5 text-sm font-medium text-slate-800 focus:outline-none"
            aria-label="Sort clubs"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2.5 flex items-center gap-2 sm:hidden">
        <label className="flex flex-1 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm">
          <span className="text-xs text-slate-400">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-full bg-transparent py-2 text-sm font-medium text-slate-800 focus:outline-none"
            aria-label="Sort clubs"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setSavedOnly(!savedOnly)}
          aria-pressed={savedOnly}
          className={`rounded-xl border px-3 py-2 text-sm font-medium ${
            savedOnly ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"
          }`}
        >
          ♥ {savedCount}
        </button>
      </div>

      <div className="slim-scroll -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <button
          onClick={() => setSavedOnly(!savedOnly)}
          aria-pressed={savedOnly}
          title="Show shortlisted clubs only"
          className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition sm:inline-flex ${
            savedOnly
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
          }`}
        >
          ♥ Saved ({savedCount})
        </button>
        {FILTER_AMENITIES.map((a) => (
          <button
            key={a}
            onClick={() => setAmenity(amenity === a ? null : a)}
            aria-pressed={amenity === a}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              amenity === a
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <label className="flex flex-1 items-center gap-2 text-xs text-slate-500">
          <span className="shrink-0 font-medium">
            {maxDues ? `Under ${formatUSD(maxDues)}/yr` : "Any dues"}
          </span>
          <input
            type="range"
            min={5000}
            max={35000}
            step={1000}
            value={maxDues ?? 35000}
            onChange={(e) => {
              const v = +e.target.value;
              setMaxDues(v >= 35000 ? null : v);
            }}
            className="w-full accent-slate-900"
            aria-label="Maximum annual dues"
          />
        </label>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-slate-500" role="status">
          <span className="font-semibold text-slate-900">{resultCount}</span> of {totalCount}{" "}
          clubs
          {savedOnly ? " in your shortlist" : ""}
          {amenity ? ` · “${amenity}”` : ""}
        </p>
        {hasActive && (
          <button
            onClick={onClear}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            Clear all ✕
          </button>
        )}
      </div>
    </div>
  );
}
