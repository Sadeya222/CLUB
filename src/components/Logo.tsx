/**
 * Meridian Clubs identity — drawn as vector, not type-in-a-box.
 * Mark: a meridian (globe with one longitude ellipse + equator) with a
 * cut-gem node at the crossing — "a club located on the meridian".
 * Reads at 16px, works filled in a single colour (tone="dark" on navy).
 */
export function LogoMark({
  className = "h-8 w-8",
  tone = "light",
  title = "Meridian Clubs",
}: {
  className?: string;
  tone?: "light" | "dark";
  title?: string;
}) {
  const stroke = tone === "dark" ? "#e2e8f0" : "#0f172a";
  const accent = tone === "dark" ? "#fbbf24" : "#f59e0b";
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label={title} focusable="false">
      <g fill="none" stroke={stroke} strokeLinecap="round">
        <circle cx="20" cy="20" r="17" strokeWidth="2.5" />
        <ellipse cx="20" cy="20" rx="7.4" ry="17" strokeWidth="1.7" />
        <path d="M4.2 20h31.6" strokeWidth="1.7" />
      </g>
      <path d="M20 15.1 24.9 20 20 24.9 15.1 20Z" fill={accent} />
    </svg>
  );
}

export default function Logo({ tone = "light" }: { tone?: "light" | "dark" }) {
  const primary = tone === "dark" ? "text-white" : "text-slate-900";
  const secondary = tone === "dark" ? "text-slate-400" : "text-slate-400";
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" tone={tone} />
      <span className="flex flex-col text-left leading-none">
        <span className={`font-display text-[17px] font-semibold tracking-tight sm:text-[18px] ${primary}`}>
          Meridian
        </span>
        <span
          className={`mt-1 hidden text-[8.5px] font-semibold uppercase tracking-[0.2em] sm:block ${secondary}`}
        >
          Private Clubs · Miami Beach
        </span>
      </span>
    </span>
  );
}
