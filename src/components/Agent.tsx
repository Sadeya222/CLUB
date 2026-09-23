import { useEffect, useRef, useState } from "react";
import { CLUBS, clubMatchesAmenity, type SortKey, type TourRequest } from "../data";
import { prettyDate, useEscape, useLocalStorage } from "../lib/hooks";
import { onAvatarError } from "../lib/brand";
import {
  METRICS,
  NEARBY_RADIUS_M,
  POI_GROUPS,
  POI_WORDS,
  fmtDistance,
  moneyFull,
  moneyShort,
  pctDiff,
  poiGroup,
  walkMinutes,
  type Basemap,
  type MetricKey,
  type MetroStats,
  type PoiFeature,
  type ZipProps,
} from "../lib/insights";

export type AgentInsights = {
  zipsReady: boolean;
  poisReady: boolean;
  loading: boolean;
  zipFor: (clubId: string) => ZipProps | null;
  poisFor: (clubId: string) => PoiFeature[];
  metro: MetroStats | null;
  focusId: string | null;
};

export type AgentActions = {
  focusClub: (id: string) => void;
  openClub: (id: string) => void;
  ensureSaved: (id: string) => void;
  unsave: (id: string) => void;
  setQuery: (q: string) => void;
  setAmenity: (a: string | null) => void;
  setSavedOnly: (b: boolean) => void;
  setSort: (s: SortKey) => void;
  clearFilters: () => void;
  goto: (v: "explore" | "profile") => void;
  requestTour: (clubId: string) => TourRequest | null;
  toast: (t: { title: string; desc?: string; kind?: "success" | "info" | "error" }) => void;
  setDataLayer: (m: MetricKey | null) => void;
  setBasemap: (b: Basemap) => void;
  setPlaces: (on: boolean) => void;
  getInsights: () => AgentInsights;
};

type Msg = { role: "user" | "agent"; text: string; receipts?: string[]; ts: number };

export type AgentPrefs = { proactiveTips: boolean; chatMemory: boolean; voiceReplies: boolean };

const QUICK = [
  "What's near The Surf Club?",
  "Neighborhood stats for Fisher Island",
  "Show home values map",
  "Which club has the wealthiest area?",
  "Take me to The Bath Club",
  "Compare Bath vs Soho",
  "Book a tour at Soho Beach House",
  "Switch to dark map",
];

type Reply = { text: string; receipts: string[] };

function signedPct(p: number) {
  return `${p > 0 ? "+" : ""}${p}%`;
}

function notReady(loading: boolean): Reply {
  return {
    text: loading
      ? "I'm still syncing neighborhood data from CARTO — give me a few seconds and ask again."
      : "Neighborhood data from CARTO is unavailable right now. You can retry from the map's Layers panel.",
    receipts: [],
  };
}

/** Intents backed by live CARTO data (census demographics, OSM places, map layers). */
function cartoBrain(q: string, club: (typeof CLUBS)[number] | undefined, a: AgentActions): Reply | null {
  const has = (...ws: string[]) => ws.some((w) => q.includes(w));
  const R: string[] = [];
  const ins = a.getInsights();

  // Layer off
  if (has("hide", "remove", "turn off", "disable", "clear") && has("layer", "heat", "overlay", "choropleth", "shading", "data map")) {
    a.setDataLayer(null);
    R.push("Turned off the neighborhood data layer");
    return { text: "Done — the neighborhood data layer is off. Clubs and the basemap stay as they are.", receipts: R };
  }

  // Basemaps
  if (has("dark map", "dark mode", "night map", "dark matter", "dark basemap")) {
    a.setBasemap("dark");
    R.push("Switched basemap to CARTO Dark Matter");
    return { text: "Switched to CARTO's Dark Matter basemap — very Miami after midnight.", receipts: R };
  }
  if (has("light map", "minimal map", "positron", "clean map", "light basemap")) {
    a.setBasemap("positron");
    R.push("Switched basemap to CARTO Positron");
    return { text: "Switched to CARTO's minimal Positron basemap — ideal for reading the data layers.", receipts: R };
  }
  if (has("default map", "voyager", "color map", "colour map", "street map", "normal map")) {
    a.setBasemap("voyager");
    R.push("Switched basemap to CARTO Voyager");
    return { text: "Back to CARTO's Voyager basemap.", receipts: R };
  }

  const metric: MetricKey | null = has("home value", "house price", "home price", "property value", "real estate", "housing")
    ? "home_value"
    : has("income", "wealth", "affluen", "rich", "earn")
      ? "income"
      : has("density", "population", "crowded", "dense")
        ? "density"
        : null;
  const layerWords = has("map", "layer", "heat", "overlay", "choropleth", "shade", "colour", "color", "visuali");

  // Area ranking across clubs
  const byHome = has("priciest area", "priciest neighborhood", "most expensive area", "most expensive neighborhood", "highest home");
  if (!club && (byHome || has("wealthiest", "richest", "most affluent", "highest income"))) {
    if (!ins.zipsReady) return notReady(ins.loading);
    const key: "income" | "home_value" = byHome ? "home_value" : "income";
    const ranked = CLUBS.map((c) => ({ c, z: ins.zipFor(c.id) }))
      .filter((x): x is { c: (typeof CLUBS)[number]; z: ZipProps } => !!x.z && x.z[key] != null)
      .sort((x, y) => (y.z[key] as number) - (x.z[key] as number));
    if (!ranked.length) return notReady(false);
    const top = ranked[0];
    a.goto("explore");
    a.setDataLayer(key);
    a.focusClub(top.c.id);
    R.push(`Mapped ${METRICS[key].label.toLowerCase()} by ZIP`, `Centered map on ${top.c.short}`);
    return {
      text: `${top.c.name} sits in the ${byHome ? "priciest" : "most affluent"} neighborhood — ZIP ${top.z.zip} (${top.z.city}) with a ${METRICS[key].label.toLowerCase()} of ${moneyFull(top.z[key] as number)}.\n${ranked
        .map((x) => `• ${x.c.short}: ${x.z.income != null ? moneyShort(x.z.income) : "—"} income · ${x.z.home_value != null ? moneyShort(x.z.home_value) : "—"} home`)
        .join("\n")}\nLive US Census data via CARTO.`,
      receipts: R,
    };
  }

  // Show a data layer
  if (metric && (!club || layerWords)) {
    if (!ins.zipsReady && !ins.loading) return notReady(false);
    a.goto("explore");
    a.setDataLayer(metric);
    R.push(`Mapped ${METRICS[metric].label.toLowerCase()} by ZIP`);
    if (club) {
      a.focusClub(club.id);
      R.push(`Centered map on ${club.short}`);
    }
    return {
      text: `I've shaded every Miami-area ZIP by ${METRICS[metric].label.toLowerCase()} using live US Census data from CARTO — darker means higher. Hover any ZIP for the numbers${club ? `; ${club.short}'s ZIP is outlined` : ""}.`,
      receipts: R,
    };
  }

  const groupHit = POI_WORDS.find(([re]) => re.test(q))?.[1] ?? null;
  const nbhdWords = has("neighborhood", "neighbourhood", "demographic", "who lives", "residents", "census", "area stats", "zip", "the area", "locals", "median age");

  // Neighborhood stats for a club
  if (club && (metric || (nbhdWords && !groupHit))) {
    if (!ins.zipsReady) return notReady(ins.loading);
    const z = ins.zipFor(club.id);
    if (!z) return { text: `I don't have census data for ${club.name}'s ZIP right now.`, receipts: [] };
    const m = ins.metro;
    a.goto("explore");
    a.focusClub(club.id);
    if (metric) {
      a.setDataLayer(metric);
      R.push(`Mapped ${METRICS[metric].label.toLowerCase()}`);
    }
    R.push(`Outlined ZIP ${z.zip} on the map`);
    const inc = z.income != null ? `${moneyFull(z.income)}${m ? ` (${signedPct(pctDiff(z.income, m.income))} vs metro)` : ""}` : "n/a";
    const hv = z.home_value != null ? `${moneyFull(z.home_value)}${m ? ` (${signedPct(pctDiff(z.home_value, m.home_value))} vs metro)` : ""}` : "n/a";
    return {
      text: `${club.name} · ZIP ${z.zip} (${z.city}):\n• Median household income — ${inc}\n• Median home value — ${hv}\n• Residents — ${z.pop != null ? z.pop.toLocaleString("en-US") : "n/a"}${z.density != null ? ` (${Math.round(z.density).toLocaleString("en-US")}/km²)` : ""}\n• Median age — ${z.age ?? "n/a"}\nLive from the US Census ACS via CARTO.`,
      receipts: R,
    };
  }

  // Nearby places
  const nearbyWords = has("near", "nearby", "around", "close to", "walking distance", "walk to", "what's close", "whats close", "things to do");
  const asksAboutClubItself = has(" have", " has ", "offer", "does ");
  if ((nearbyWords || (groupHit && club && !asksAboutClubItself)) && !has("book", "tour", "save")) {
    const target = club ?? CLUBS.find((c) => c.id === ins.focusId);
    if (!target) return { text: "Happy to — which club? Try “What's near The Surf Club?”", receipts: [] };
    if (!ins.poisReady) return notReady(ins.loading);
    let list = ins.poisFor(target.id);
    if (groupHit) list = list.filter((f) => poiGroup(f.properties.kind) === groupHit);
    a.goto("explore");
    a.setPlaces(true);
    a.focusClub(target.id);
    R.push(`Plotted nearby places around ${target.short}`);
    const what = groupHit ? POI_GROUPS[groupHit].label.toLowerCase() : "spots";
    if (!list.length) {
      return {
        text: `I couldn't find ${groupHit ? what : "mapped places"} within ${fmtDistance(NEARBY_RADIUS_M)} of ${target.name} in OpenStreetMap.`,
        receipts: R,
      };
    }
    return {
      text: `Closest ${what} to ${target.name}:\n${list
        .slice(0, 5)
        .map((f) => `• ${f.properties.name} — ${f.properties.kind.toLowerCase()}, ${fmtDistance(f.properties.dist_m)} (${walkMinutes(f.properties.dist_m)} min walk)`)
        .join("\n")}\nThey're on the map as colored dots inside the dashed walking ring.`,
      receipts: R,
    };
  }

  return null;
}

const ALIASES: Record<string, string[]> = {
  bath: ["bath"],
  surf: ["surf"],
  fisher: ["fisher"],
  soho: ["soho", "beach house"],
};

function findClubs(q: string) {
  return CLUBS.filter((c) => ALIASES[c.id].some((a) => q.includes(a)));
}

function speak(text: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 220));
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch {
    /* voice unsupported */
  }
}

function brain(input: string, a: AgentActions): { text: string; receipts: string[] } {
  const q = input.toLowerCase();
  const clubs = findClubs(q);
  const club = clubs[0];
  const R: string[] = [];

  const has = (...ws: string[]) => ws.some((w) => q.includes(w));

  if (has("hello", "hi there", "hey", "good morning", "good evening") && q.length < 24) {
    return {
      text: "Hello — lovely to see you. I can fly the map to any club, compare memberships, shortlist your favorites, filter by amenity, or book a private tour. Where shall we start?",
      receipts: [],
    };
  }
  if (has("thank")) {
    return { text: "Always a pleasure. Enjoy the clubs — I'll be here if you need anything else.", receipts: [] };
  }
  if (has("help", "what can you", "how do i", "abilities", "commands")) {
    return {
      text: "Here's what I can do on your behalf:\n• Fly the map — “Take me to The Bath Club”\n• Open details — “Open Fisher Island”\n• Compare — “Compare Bath vs Soho”\n• Shortlist — “Save the Surf Club”\n• Filter — “Only clubs with golf”\n• Book tours — “Book a tour at Soho”\n• Neighborhood data — “Show home values map”\n• Nearby places — “What's near The Surf Club?”\n• Area stats — “Neighborhood stats for Fisher Island”\n• Basemap — “Switch to dark map”\n• Account — “Open my profile”",
      receipts: [],
    };
  }
  if (has("profile", "setting", "account", "my tour")) {
    a.goto("profile");
    R.push("Opened Profile & settings");
    return { text: "I've opened your profile — account details, tour requests, notifications and concierge preferences are all there.", receipts: R };
  }
  const cartoReply = cartoBrain(q, club, a);
  if (cartoReply) return cartoReply;
  if (has("shortlist", "saved", "favorite") && !club && !has("save", "unsave", "remove")) {
    a.goto("explore");
    a.setSavedOnly(true);
    R.push("Filtered list to your shortlist");
    return { text: "Showing your shortlist now. Tap any card for full details, or tell me to save another club.", receipts: R };
  }
  if (has("clear", "reset", "show all", "show everything")) {
    a.clearFilters();
    R.push("Cleared search, filters & shortlist view");
    return { text: "All cleared — all four featured clubs are back on the map and in the list.", receipts: R };
  }
  if (has("compare") || (has("vs", "versus", "or") && clubs.length >= 2)) {
    const pair = clubs.length >= 2 ? [clubs[0], clubs[1]] : [CLUBS[0], CLUBS[3]];
    a.goto("explore");
    a.focusClub(pair[0].id);
    R.push(`Centered map between ${pair[0].short} & ${pair[1].short}`);
    const [x, y] = pair;
    return {
      text: `${x.name} vs ${y.name}:\n• Dues — ${x.duesLabel} vs ${y.duesLabel}\n• Rating — ★ ${x.rating.toFixed(1)} vs ★ ${y.rating.toFixed(1)}\n• Founded — ${x.founded} vs ${y.founded}\n• Vibe — ${x.tags.join(", ")} vs ${y.tags.join(", ")}\n${x.duesValue < y.duesValue ? `${x.short} is the lighter commitment;` : `${y.short} is the lighter commitment;`} ${x.rating >= y.rating ? x.short : y.short} edges it on member rating. Open either card for the full breakdown.`,
      receipts: R,
    };
  }
  if (has("cheapest", "most affordable", "lowest", "budget", "under")) {
    const c = [...CLUBS].sort((p, q2) => p.duesValue - q2.duesValue)[0];
    a.goto("explore");
    a.focusClub(c.id);
    R.push(`Centered map on ${c.name}`);
    return { text: `${c.name} is the most accessible at ${c.duesLabel} with ${c.initiation.toLowerCase()}. ${c.tagline} I've centered the map there — want a tour?`, receipts: R };
  }
  if (has("most expensive", "priciest", "exclusive", "luxurious", "best", "top rated", "highest rated")) {
    const c = has("best", "top rated", "highest rated")
      ? [...CLUBS].sort((p, q2) => q2.rating - p.rating)[0]
      : [...CLUBS].sort((p, q2) => q2.duesValue - p.duesValue)[0];
    a.goto("explore");
    a.focusClub(c.id);
    R.push(`Centered map on ${c.name}`);
    return { text: `That would be ${c.name} — ★ ${c.rating.toFixed(1)} from ${c.reviewsCount} reviews at ${c.duesLabel}. ${c.tagline}`, receipts: R };
  }
  if (club && has("book", "tour", "visit", "schedule", "reserve", "appointment")) {
    a.goto("explore");
    const t = a.requestTour(club.id);
    a.focusClub(club.id);
    if (t) R.push(`Tour requested · ${t.id}`);
    return {
      text: t
        ? `Done — I've requested a private tour at ${club.name} for ${prettyDate(t.date)} at ${t.time} (${t.guests} guests, ref ${t.id}). It's saved under Profile → My Tours, and the membership office typically confirms within 24 hours.`
        : `I couldn't complete that booking — please try again from the club's details page.`,
      receipts: R,
    };
  }
  if (!club && has("book", "tour", "visit", "schedule")) {
    return { text: "I'd be glad to arrange that — which club? Say “Book a tour at The Surf Club” or tap any card to book from its details page.", receipts: [] };
  }
  if (club && has("unsave", "remove", "unfavorite", "delete")) {
    a.unsave(club.id);
    R.push(`Removed ${club.short} from shortlist`);
    return { text: `${club.name} is off your shortlist.`, receipts: R };
  }
  if (club && has("save", "shortlist", "favorite", "bookmark", "like")) {
    a.ensureSaved(club.id);
    a.focusClub(club.id);
    R.push(`Saved ${club.short} to shortlist`);
    return { text: `${club.name} is now on your shortlist — you'll find it under Profile and via the ♥ Saved filter.`, receipts: R };
  }
  if (club && has("open", "detail", "more", "about", "tell me", "info")) {
    a.goto("explore");
    a.openClub(club.id);
    R.push(`Opened ${club.short} details`);
    return { text: `Opening ${club.name} — photos, amenities, member reviews and tour booking are all in the details panel.`, receipts: R };
  }
  if (club && has("hour", "open", "close", "when")) {
    return { text: `${club.name} keeps ${club.hours}.`, receipts: [] };
  }
  if (club && has("phone", "call", "contact", "number", "email")) {
    return { text: `You can reach the ${club.name} membership office at ${club.phone}.`, receipts: [] };
  }
  if (club && has("address", "where", "location", "direction", "park", "get there")) {
    return { text: `${club.name} is at ${club.address} (${club.neighborhood}). ${club.id === "fisher" ? "Note: it's reachable only by private ferry from the Fisher Island terminal." : "Use the Directions button on its card for turn-by-turn navigation."}`, receipts: [] };
  }
  if (club && has("price", "cost", "due", "much", "initiation", "fee", "afford")) {
    return { text: `${club.name} runs ${club.duesLabel} with ${club.initiation.toLowerCase()}. Membership is ${club.members.toLowerCase()}.`, receipts: R };
  }
  if (club && has("show", "take me", "go to", "fly", "center", "zoom", "find", "locate", "map")) {
    a.goto("explore");
    a.focusClub(club.id);
    R.push(`Centered map on ${club.name}`);
    return { text: `${club.name} — ${club.tagline} Dues run ${club.duesLabel}. I've centered the map there; tap its marker for quick actions.`, receipts: R };
  }
  const amenityHit = ["golf", "tennis", "spa", "pool", "beach", "marina", "dining", "nightlife", "fitness", "island", "cabana", "creative"].find((k) => q.includes(k));
  if (amenityHit || has("filter", "only", "with", "that has", "that have")) {
    const key = amenityHit ?? ["golf", "tennis", "spa", "pool", "beach", "marina", "dining"].find((k) => q.includes(k));
    if (key) {
      const hits = CLUBS.filter((c) => clubMatchesAmenity(c, key));
      a.goto("explore");
      a.setAmenity(key);
      if (hits[0]) a.focusClub(hits[0].id);
      R.push(`Filtered to “${key}” (${hits.length} match${hits.length === 1 ? "" : "es"})`);
      return {
        text: hits.length
          ? `${hits.length} club${hits.length === 1 ? "" : "s"} match${hits.length === 1 ? "es" : ""} “${key}”: ${hits.map((h) => h.name).join(", ")}. ${hits[0] ? `I've centered the map on ${hits[0].name}.` : ""}`
          : `Nothing in the featured set matches “${key}” — try golf, spa, beach or dining.`,
        receipts: R,
      };
    }
  }
  if (club) {
    a.goto("explore");
    a.focusClub(club.id);
    R.push(`Centered map on ${club.name}`);
    return { text: `${club.name} — ${club.tagline} ★ ${club.rating.toFixed(1)} · ${club.duesLabel}. Say “open it”, “save it”, or “book a tour” and I'll handle it.`, receipts: R };
  }
  return {
    text: "I can fly the map, open club details, compare memberships, shortlist favorites, filter by amenity, or book tours. Try “Compare Bath vs Soho” or “Take me to Fisher Island”.",
    receipts: [],
  };
}

const GREETING = {
  role: "agent" as const,
  text: "Good evening — I'm Alfred, your membership concierge. I can move the map, compare clubs, pull live neighborhood intel from CARTO, shortlist favorites and book private tours. What shall we do first?",
  ts: Date.now(),
};

export default function Agent({ actions }: { actions: AgentActions }) {
  const [open, setOpen] = useState(false);
  const [persisted, setPersisted] = useLocalStorage<Msg[]>("mc-agent-chat", [GREETING]);
  const [session, setSession] = useState<Msg[]>([GREETING]);
  const [prefs] = useLocalStorage<AgentPrefs>("mc-agent-prefs", {
    proactiveTips: true,
    chatMemory: true,
    voiceReplies: false,
  });
  const [teaserSeen, setTeaserSeen] = useLocalStorage("mc-agent-teaser", false);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [phase, setPhase] = useState(0);
  const [unread, setUnread] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const msgs = prefs.chatMemory ? persisted : session;
  const setMsgs = (fn: (m: Msg[]) => Msg[]) => {
    if (prefs.chatMemory) setPersisted((p) => fn(p).slice(-30));
    else setSession((s) => fn(s).slice(-30));
  };

  useEscape(() => setOpen(false), open);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing, open]);

  useEffect(() => {
    if (!prefs.proactiveTips || teaserSeen || open) return;
    const t = window.setTimeout(() => {
      setTeaserSeen(true);
      setUnread(1);
    }, 6000);
    return () => window.clearTimeout(t);
  }, [prefs.proactiveTips, teaserSeen, open, setTeaserSeen]);

  useEffect(() => {
    if (!typing) return;
    const t = window.setInterval(() => setPhase((p) => (p + 1) % 3), 380);
    return () => window.clearInterval(t);
  }, [typing]);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || typing) return;
    setMsgs((m) => [...m, { role: "user", text, ts: Date.now() }]);
    setInput("");
    setTyping(true);
    setPhase(0);
    window.setTimeout(() => {
      const { text: reply, receipts } = brain(text, actions);
      setTyping(false);
      setMsgs((m) => [...m, { role: "agent", text: reply, receipts, ts: Date.now() }]);
      if (!open) setUnread((u) => u + 1);
      if (prefs.voiceReplies) speak(reply);
    }, 950);
  };

  const clearChat = () => {
    setMsgs(() => [GREETING]);
    try {
      window.speechSynthesis?.cancel();
    } catch { /* noop */ }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[1400] flex flex-col items-end gap-2.5 sm:bottom-6 sm:right-6">
      {!open && unread > 0 && prefs.proactiveTips && (
        <button
          onClick={() => {
            setOpen(true);
            setUnread(0);
          }}
          className="anim-toast max-w-[16rem] rounded-2xl rounded-br-sm border border-slate-200 bg-white p-3 text-left text-[13px] text-slate-700 shadow-xl shadow-slate-900/15"
        >
          <span className="font-semibold text-slate-900">Alfred · concierge</span>
          <span className="mt-0.5 block">
            {teaserSeen && msgs.length <= 1
              ? "Need a hand choosing between the clubs? I can compare them in seconds."
              : "You have a new message from Alfred."}
          </span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Chat with Alfred, AI concierge"
          className="anim-toast flex h-[29rem] max-h-[72vh] w-[min(93vw,23.5rem)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/25"
        >
          <div className="flex items-center gap-3 bg-slate-900 px-4 py-3 text-white">
            <span className="relative">
              <img
                src="agent.png"
                onError={onAvatarError}
                alt="Alfred, AI concierge in a suit and tie"
                className="h-10 w-10 rounded-full object-cover ring-2 ring-amber-300"
              />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Alfred</p>
              <p className="text-[11px] text-emerald-300">Online · acts on your behalf</p>
            </div>
            <button
              onClick={clearChat}
              title="Start a new conversation"
              aria-label="Start a new conversation"
              className="rounded-full px-2 py-1 text-slate-300 hover:bg-white/10 hover:text-white"
            >
              ⟲
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-full px-2 py-1 text-slate-300 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="slim-scroll flex-1 space-y-2.5 overflow-y-auto bg-slate-50 p-3">
            {msgs.map((m, i) => (
              <div key={m.ts + "-" + i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-slate-900 text-white"
                      : "rounded-bl-sm border border-slate-200 bg-white text-slate-700 shadow-sm"
                  }`}
                >
                  <span className="whitespace-pre-line">{m.text}</span>
                  {m.receipts && m.receipts.length > 0 && (
                    <span className="mt-2 flex flex-col gap-1">
                      {m.receipts.map((r) => (
                        <span
                          key={r}
                          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
                        >
                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white">✓</span>
                          {r}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
                    ))}
                  </span>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {["Reading your request…", "Checking the clubs…", "Taking action…"][phase]}
                  </p>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="slim-scroll flex gap-1.5 overflow-x-auto border-t border-slate-100 bg-white px-3 py-2">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-slate-900 hover:text-slate-900"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-slate-100 bg-white p-2.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Alfred to do something…"
              aria-label="Message Alfred"
              className="min-w-0 flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!input.trim() || typing}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-base text-white transition hover:bg-slate-700 disabled:opacity-40"
            >
              ↑
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) setUnread(0);
        }}
        aria-expanded={open}
        aria-label={open ? "Hide Alfred" : "Chat with Alfred, AI concierge"}
        className="group relative flex items-center gap-2.5 rounded-full bg-slate-900 p-1.5 text-white shadow-xl shadow-slate-900/30 transition hover:scale-[1.04] active:scale-95 sm:pr-5"
      >
        <span className="relative">
          <img
            src="agent.png"
            onError={onAvatarError}
            alt=""
            className="h-11 w-11 rounded-full object-cover ring-2 ring-amber-300"
          />
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-semibold">{open ? "Hide Alfred" : "Ask Alfred"}</span>
          <span className="block text-[11px] text-slate-300">AI concierge · suit & tie</span>
        </span>
        {unread > 0 && !open && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold ring-2 ring-white">
            {unread}
          </span>
        )}
      </button>
    </div>
  );
}
