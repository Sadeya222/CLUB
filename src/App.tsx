import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { CLUBS, clubMatchesAmenity, type SortKey, type TourRequest } from "./data";
import { nextSaturday, prettyDate, useLocalStorage } from "./lib/hooks";
import { clearCartoCache, saveCartoOverride } from "./lib/carto";
import { METRICS, zipOf, type MetricKey } from "./lib/insights";
import ErrorBoundary from "./components/ErrorBoundary";
import { CartoProvider, DEFAULT_MAP_PREFS, useCarto, type CartoContextValue } from "./components/CartoProvider";
import Header from "./components/Header";
import FilterBar from "./components/FilterBar";
import ClubCard from "./components/ClubCard";
import MapPanel, { type FlyTarget } from "./components/MapPanel";
import ClubDetail from "./components/ClubDetail";
import Agent, { type AgentInsights } from "./components/Agent";
import Profile, { DEFAULT_PROFILE, type ProfileData } from "./components/Profile";
import Toasts, { type Toast } from "./components/Toasts";

let toastSeq = 0;

function Shell() {
  const carto = useCarto();
  const { setPrefs: setMapPrefs, reloadConfig, setBasemapsKey } = carto;
  const cartoRef = useRef<CartoContextValue>(carto);
  useEffect(() => {
    cartoRef.current = carto;
  });

  const [view, setView] = useState<"explore" | "profile">("explore");
  const [profile, setProfile] = useLocalStorage<ProfileData>("mc-profile", DEFAULT_PROFILE);
  const [saved, setSaved] = useLocalStorage<string[]>("mc-saved", []);
  const [tours, setTours] = useLocalStorage<TourRequest[]>("mc-tours", []);

  const [query, setQuery] = useState("");
  const [amenity, setAmenity] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("featured");
  const [maxDues, setMaxDues] = useState<number | null>(null);
  const [savedOnly, setSavedOnly] = useState(false);

  // hoverId = transient highlight · focusId = club the map is currently centered on
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const focusRef = useRef<string | null>(null);
  useEffect(() => {
    focusRef.current = focusId;
  }, [focusId]);

  const [flyTo, setFlyTo] = useState<FlyTarget>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"list" | "map">("list");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  const activeId = hoverId ?? focusId;

  /* ---------- toasts ---------- */
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const notify = useCallback(
    (t: { title: string; desc?: string; kind?: Toast["kind"]; actionLabel?: string; onAction?: () => void }) => {
      const id = ++toastSeq;
      setToasts((prev) => [...prev.slice(-2), { ...t, id }]);
      window.setTimeout(() => dismissToast(id), 4500);
    },
    [dismissToast]
  );

  /* ---------- camera & selection ---------- */
  const flyToClub = useCallback((id: string) => {
    setFocusId(id);
    setFlyTo((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  }, []);

  const revealCard = useCallback((id: string) => {
    window.requestAnimationFrame(() =>
      listRef.current?.querySelector(`[data-club="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    );
  }, []);

  /** Card hover: highlight instantly, fly after a short dwell so sweeping the list doesn't thrash the map. */
  const handleCardHover = useCallback(
    (id: string | null) => {
      setHoverId(id);
      window.clearTimeout(hoverTimer.current);
      if (id) hoverTimer.current = window.setTimeout(() => flyToClub(id), 140);
    },
    [flyToClub]
  );

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  /** Marker hover: highlight + reveal the matching card in the list. */
  const handleMarkerHover = useCallback(
    (id: string | null) => {
      setHoverId(id);
      if (id) revealCard(id);
    },
    [revealCard]
  );

  const resetFocus = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    setHoverId(null);
    setFocusId(null);
  }, []);

  /** Programmatic focus (Alfred, profile "Locate"): show the map on mobile, fly, reveal card. */
  const focusClub = useCallback(
    (id: string) => {
      setView("explore");
      setMobileTab("map");
      flyToClub(id);
      revealCard(id);
    },
    [flyToClub, revealCard]
  );

  const openClub = useCallback(
    (id: string) => {
      setView("explore");
      flyToClub(id);
      setDetailId(id);
    },
    [flyToClub]
  );

  /* ---------- shortlist ---------- */
  const toggleSave = useCallback(
    (id: string) => {
      const club = CLUBS.find((c) => c.id === id);
      setSaved((s) => {
        const has = s.includes(id);
        notify(
          has
            ? { title: `Removed ${club?.short ?? "club"}`, desc: "Taken off your shortlist.", kind: "info" }
            : {
                title: `Saved ${club?.short ?? "club"} ♥`,
                desc: "Added to your shortlist.",
                actionLabel: "View profile",
                onAction: () => setView("profile"),
              }
        );
        return has ? s.filter((x) => x !== id) : [...s, id];
      });
    },
    [notify, setSaved]
  );

  const ensureSaved = useCallback((id: string) => setSaved((s) => (s.includes(id) ? s : [...s, id])), [setSaved]);
  const unsave = useCallback((id: string) => setSaved((s) => s.filter((x) => x !== id)), [setSaved]);

  /* ---------- tours ---------- */
  const bookTour = useCallback(
    (t: Omit<TourRequest, "id" | "status" | "createdAt">): TourRequest => {
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
      const ref = `MC-${new Date().getFullYear()}-${rand}-${t.clubId.slice(0, 2).toUpperCase()}`;
      const full: TourRequest = { ...t, id: ref, status: "requested", createdAt: Date.now() };
      setTours((prev) => [...prev, full]);
      notify({
        title: "Tour requested ✓",
        desc: `${t.clubName} · ${prettyDate(t.date)} at ${t.time}`,
        actionLabel: "View tours",
        onAction: () => setView("profile"),
      });
      return full;
    },
    [notify, setTours]
  );

  const requestTourForAgent = useCallback(
    (clubId: string): TourRequest | null => {
      const club = CLUBS.find((c) => c.id === clubId);
      if (!club) return null;
      return bookTour({ clubId, clubName: club.name, date: nextSaturday(), time: "11:00 AM", guests: 2, name: profile.name });
    },
    [bookTour, profile.name]
  );

  const cancelTour = useCallback(
    (id: string) => {
      setTours((prev) => prev.filter((t) => t.id !== id));
      notify({ title: "Tour cancelled", desc: "The membership office has been notified.", kind: "info" });
    },
    [notify, setTours]
  );

  /* ---------- filters ---------- */
  const clearFilters = useCallback(() => {
    setQuery("");
    setAmenity(null);
    setMaxDues(null);
    setSavedOnly(false);
    setSort("featured");
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = CLUBS.filter((c) => {
      if (savedOnly && !saved.includes(c.id)) return false;
      if (amenity && !clubMatchesAmenity(c, amenity)) return false;
      if (maxDues != null && c.duesValue > maxDues) return false;
      if (q) {
        const hay = `${c.name} ${c.short} ${c.address} ${c.neighborhood} ${c.tagline} ${c.tags.join(" ")} ${c.amenities.join(" ")}`.toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    if (sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    if (sort === "duesAsc") list = [...list].sort((a, b) => a.duesValue - b.duesValue);
    if (sort === "duesDesc") list = [...list].sort((a, b) => b.duesValue - a.duesValue);
    return list;
  }, [query, amenity, maxDues, savedOnly, saved, sort]);

  const hasActive = query !== "" || amenity !== null || maxDues !== null || savedOnly || sort !== "featured";

  /* ---------- "/" focuses search ---------- */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
      if (e.key === "/" && !typing && view === "explore" && !detailId) {
        e.preventDefault();
        setMobileTab("list");
        window.setTimeout(() => document.getElementById("club-search")?.focus(), 0);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [view, detailId]);

  /* ---------- CARTO bridges ---------- */
  const getInsights = useCallback((): AgentInsights => {
    const c = cartoRef.current;
    return {
      zipsReady: !!c.zips,
      poisReady: !!c.pois,
      loading: c.status === "loading" || c.refreshing,
      zipFor: (id) => {
        const club = CLUBS.find((x) => x.id === id);
        return club ? (c.zipByCode.get(zipOf(club))?.properties ?? null) : null;
      },
      poisFor: (id) => c.poisByClub[id] ?? [],
      metro: c.metro,
      focusId: focusRef.current,
    };
  }, []);

  const showOnMap = useCallback(
    (id: string) => {
      setDetailId(null);
      setMobileTab("map");
      flyToClub(id);
    },
    [flyToClub]
  );

  const detailClub = CLUBS.find((c) => c.id === detailId) ?? null;

  const resetAll = useCallback(() => {
    try {
      [
        "mc-profile",
        "mc-saved",
        "mc-tours",
        "mc-notifs",
        "mc-agent-chat",
        "mc-agent-prefs",
        "mc-agent-teaser",
        "mc-map-prefs",
      ].forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* noop */
    }
    clearCartoCache();
    saveCartoOverride(null);
    setBasemapsKey(null);
    setMapPrefs(DEFAULT_MAP_PREFS);
    reloadConfig();
    setProfile(DEFAULT_PROFILE);
    setSaved([]);
    setTours([]);
    clearFilters();
    setDetailId(null);
    resetFocus();
    setView("explore");
    notify({ title: "Fresh start", desc: "All local data erased, including CARTO cache and credential overrides." });
  }, [clearFilters, notify, reloadConfig, resetFocus, setBasemapsKey, setMapPrefs, setProfile, setSaved, setTours]);

  return (
    <div className="flex h-full flex-col bg-slate-100 text-slate-900">
      <Header view={view} onView={setView} savedCount={saved.length} profileName={profile.name} avatarHue={profile.avatarHue} />
      <Toasts toasts={toasts} dismiss={dismissToast} />

      {view === "profile" ? (
        <main className="slim-scroll flex-1 overflow-y-auto">
          <Profile
            profile={profile}
            onSaveProfile={setProfile}
            saved={saved}
            tours={tours}
            onToggleSave={toggleSave}
            onOpenClub={openClub}
            onFocusClub={focusClub}
            onCancelTour={cancelTour}
            onBack={() => setView("explore")}
            onResetAll={resetAll}
            notify={notify}
          />
        </main>
      ) : (
        <main className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* map — left on desktop, tab on mobile */}
          <section
            aria-label="Club map"
            className={`relative min-h-0 flex-1 lg:w-[55%] lg:shrink-0 xl:w-[58%] ${mobileTab === "map" ? "block" : "hidden lg:block"}`}
          >
            <MapPanel
              clubs={filtered}
              activeId={activeId}
              flyTo={flyTo}
              savedIds={saved}
              visible={mobileTab === "map"}
              totalCount={CLUBS.length}
              onMarkerHover={handleMarkerHover}
              onOpen={openClub}
              onReset={resetFocus}
            />
          </section>

          {/* list — right on desktop, tab on mobile */}
          <section
            aria-label="Featured clubs"
            className={`min-h-0 flex-1 flex-col bg-white lg:flex lg:w-[45%] lg:shrink-0 xl:w-[42%] ${
              mobileTab === "list" ? "flex" : "hidden lg:flex"
            }`}
          >
            <FilterBar
              query={query}
              setQuery={setQuery}
              amenity={amenity}
              setAmenity={setAmenity}
              sort={sort}
              setSort={setSort}
              maxDues={maxDues}
              setMaxDues={setMaxDues}
              savedOnly={savedOnly}
              setSavedOnly={setSavedOnly}
              savedCount={saved.length}
              resultCount={filtered.length}
              totalCount={CLUBS.length}
              hasActive={hasActive}
              onClear={clearFilters}
            />
            <div ref={listRef} className="slim-scroll min-h-0 flex-1 overflow-y-auto bg-slate-50/60">
              {filtered.length === 0 ? (
                <div className="mx-auto max-w-sm px-6 py-16 text-center">
                  <p className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-xl text-amber-300">◌</p>
                  <h2 className="font-display mt-4 text-xl font-semibold">No clubs match</h2>
                  <p className="mt-1.5 text-sm text-slate-500">
                    Try widening the dues range, clearing the amenity filter, or searching for “beach”, “golf” or “spa”.
                  </p>
                  <button
                    onClick={clearFilters}
                    className="mt-5 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    Clear all filters
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-2 xl:gap-4">
                  {filtered.map((c) => (
                    <div key={c.id} data-club={c.id} className="min-w-0">
                      <ClubCard
                        club={c}
                        active={activeId === c.id}
                        saved={saved.includes(c.id)}
                        onHover={handleCardHover}
                        onFocus={flyToClub}
                        onOpen={openClub}
                        onToggleSave={toggleSave}
                      />
                    </div>
                  ))}
                </div>
              )}
              <p className="px-6 pb-24 pt-2 text-center text-[11px] leading-relaxed text-slate-400 lg:pb-8">
                © {new Date().getFullYear()} Meridian Clubs · Membership details shown for illustration
                <br />
                Neighborhood data: US Census ACS 2018 & © OpenStreetMap contributors, served live by CARTO · Basemaps © Esri,
                HERE, Garmin
              </p>
            </div>
          </section>

          {/* mobile map/list switch */}
          <div
            role="tablist"
            aria-label="Switch between list and map"
            className="absolute bottom-5 left-1/2 z-[1000] flex -translate-x-1/2 gap-1 rounded-full border border-slate-700 bg-slate-900/95 p-1 shadow-2xl shadow-slate-900/40 backdrop-blur lg:hidden"
          >
            {(
              [
                ["list", "☰ List"],
                ["map", "◎ Map"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={mobileTab === k}
                onClick={() => setMobileTab(k)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${mobileTab === k ? "bg-white text-slate-900" : "text-slate-300"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </main>
      )}

      <ClubDetail
        club={detailClub}
        saved={detailClub ? saved.includes(detailClub.id) : false}
        profileName={profile.name}
        onClose={() => setDetailId(null)}
        onToggleSave={toggleSave}
        onFocusMap={showOnMap}
        onBookTour={bookTour}
        onShowLayer={(m: MetricKey) => {
          setMapPrefs({ dataLayer: m });
          if (detailId) showOnMap(detailId);
          notify({ title: `Mapping ${METRICS[m].label.toLowerCase()}`, desc: "Live US Census data by ZIP · via CARTO", kind: "info" });
        }}
        onShowNearby={(id) => {
          setMapPrefs({ places: true });
          showOnMap(id);
        }}
      />

      <Agent
        actions={{
          focusClub,
          openClub,
          ensureSaved,
          unsave,
          setQuery: (q) => {
            setView("explore");
            setQuery(q);
          },
          setAmenity: (a) => {
            setView("explore");
            setSavedOnly(false);
            setAmenity(a);
          },
          setSavedOnly: (b) => {
            setView("explore");
            setSavedOnly(b);
          },
          setSort: (s) => {
            setView("explore");
            setSort(s);
          },
          clearFilters,
          goto: setView,
          requestTour: requestTourForAgent,
          toast: (t) => notify({ ...t, kind: t.kind ?? "success" }),
          setDataLayer: (m) => {
            setView("explore");
            setMapPrefs({ dataLayer: m });
          },
          setBasemap: (b) => setMapPrefs({ basemap: b }),
          setPlaces: (on) => setMapPrefs({ places: on }),
          getInsights,
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CartoProvider>
        <Shell />
      </CartoProvider>
    </ErrorBoundary>
  );
}
