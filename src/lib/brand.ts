import type { SyntheticEvent } from "react";

/**
 * Self-contained stand-in for Alfred's portrait: a suited, tied concierge drawn
 * as SVG so the avatar still renders if the PNG is unavailable (single-file hosting).
 */
export const AGENT_AVATAR_FALLBACK =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="32" fill="#0f172a"/>
      <path d="M21.5 23.5C21.5 16.6 26.2 11 32 11s10.5 5.6 10.5 12.5c-3.2-2.2-6.7-3.3-10.5-3.3s-7.3 1.1-10.5 3.3Z" fill="#111827"/>
      <circle cx="32" cy="26" r="10" fill="#efd6c3"/>
      <path d="M32 40.5c-12.4 0-21.5 7.6-21.5 18.2V64h43v-5.3C53.5 48.1 44.4 40.5 32 40.5Z" fill="#1e293b"/>
      <path d="M32 40.5 23.4 46l8.6 18 8.6-18L32 40.5Z" fill="#f8fafc"/>
      <path d="M24.6 46.4 17.8 43l4.9-4.6 6.4 5.1-4.5 2.9ZM39.4 46.4l6.8-3.4-4.9-4.6-6.4 5.1 4.5 2.9Z" fill="#334155"/>
      <path d="M32 45.6l-3.9 4.4L32 63l3.9-13L32 45.6Z" fill="#f59e0b"/>
    </svg>`
  );

/** Swap to the vector avatar once, never looping. */
export function onAvatarError(e: SyntheticEvent<HTMLImageElement>) {
  const el = e.currentTarget;
  if (el.dataset.fallback === "1") return;
  el.dataset.fallback = "1";
  el.src = AGENT_AVATAR_FALLBACK;
}
