import { initialsOf } from "../lib/hooks";
import Logo from "./Logo";

export default function Header({
  view,
  onView,
  savedCount,
  profileName,
  avatarHue,
}: {
  view: "explore" | "profile";
  onView: (v: "explore" | "profile") => void;
  savedCount: number;
  profileName: string;
  avatarHue: number;
}) {
  return (
    <header className="z-[900] border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6">
        <button
          onClick={() => onView("explore")}
          className="flex items-center gap-2.5"
          aria-label="Meridian Clubs home"
        >
          <Logo />
        </button>

        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Primary">
          <button
            onClick={() => onView("explore")}
            aria-current={view === "explore" ? "page" : undefined}
            className={`rounded-full px-3.5 py-2 text-sm transition ${
              view === "explore"
                ? "bg-slate-900 font-medium text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            Explore
          </button>
          <button
            onClick={() => onView("profile")}
            aria-current={view === "profile" ? "page" : undefined}
            className={`flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-sm transition ${
              view === "profile"
                ? "bg-slate-900 font-medium text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span className="hidden sm:inline">Profile</span>
            <span className="relative">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ring-white/60"
                style={{ background: `linear-gradient(135deg, hsl(${avatarHue} 30% 32%), hsl(${avatarHue} 35% 52%))` }}
              >
                {initialsOf(profileName) || "?"}
              </span>
              {savedCount > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-900 ring-2 ring-white"
                  title={`${savedCount} saved`}
                >
                  {savedCount}
                </span>
              )}
            </span>
          </button>
        </nav>
      </div>
    </header>
  );
}
