/**
 * Single source of truth for the user-visible app version / build stamp.
 *
 * `__GB_BUILD_ID__` is injected at build time by vite.config.ts (commit SHA on
 * CI, "dev" locally). `__GB_BUILD_TIME__` is the build timestamp, which is what
 * makes it possible to confirm that production is actually running the latest
 * deploy rather than a cached older bundle.
 */

export const APP_BUILD_ID: string =
  typeof __GB_BUILD_ID__ !== "undefined" ? String(__GB_BUILD_ID__) : "dev";

export const APP_BUILD_TIME: string =
  typeof __GB_BUILD_TIME__ !== "undefined" ? String(__GB_BUILD_TIME__) : "";

/** Short commit-style id, e.g. "a1b2c3d". */
export const APP_BUILD_SHORT: string =
  APP_BUILD_ID === "dev" ? "dev" : APP_BUILD_ID.slice(0, 7);

/** e.g. "20 Aug 2026 11:42" (UTC), empty when unknown. */
export function formatBuildTime(iso: string = APP_BUILD_TIME): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

/** One-line stamp for footers / admin, e.g. "Build a1b2c3d · 20 Aug 2026 11:42 UTC". */
export function buildStamp(): string {
  const t = formatBuildTime();
  return t ? `Build ${APP_BUILD_SHORT} · ${t}` : `Build ${APP_BUILD_SHORT}`;
}
