export type Toast = {
  id: number;
  title: string;
  desc?: string;
  kind?: "success" | "info" | "error";
  actionLabel?: string;
  onAction?: () => void;
};

const ICONS: Record<NonNullable<Toast["kind"]>, string> = {
  success: "✓",
  info: "ℹ",
  error: "!",
};

export default function Toasts({
  toasts,
  dismiss,
}: {
  toasts: Toast[];
  dismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-16 z-[2000] flex w-[min(94vw,24rem)] -translate-x-1/2 flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="anim-toast pointer-events-auto flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/95 p-3.5 text-white shadow-2xl shadow-slate-900/30 backdrop-blur"
        >
          <span
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              t.kind === "error"
                ? "bg-red-500/20 text-red-300"
                : t.kind === "info"
                  ? "bg-sky-500/20 text-sky-300"
                  : "bg-emerald-500/20 text-emerald-300"
            }`}
          >
            {ICONS[t.kind ?? "success"]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-snug">{t.title}</p>
            {t.desc && <p className="mt-0.5 text-xs leading-snug text-slate-300">{t.desc}</p>}
            {t.actionLabel && (
              <button
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
                className="mt-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-white/20"
              >
                {t.actionLabel}
              </button>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="shrink-0 rounded-full px-1.5 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
