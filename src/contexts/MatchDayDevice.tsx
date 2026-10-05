/**
 * Match Day device mode. When a valid secure link is opened, the EXISTING
 * League Games screens render inside this provider. Every data request then
 * goes out as the anonymous role plus the `x-match-day-token` header, and the
 * database only lets it reach that one competition's fixtures (see the
 * `md_hdr_*` policies). No member identity, admin rights or other club data.
 */
import { createContext, useCallback, useContext } from "react";
import { useNavigate, type NavigateOptions } from "react-router-dom";

export interface MatchDayDevice {
  token: string;
  /** league_season or tournament */
  kind?: "league_season" | "tournament";
  /** Court id from a court-specific link; null = all courts. */
  court: number | null;
  clubId: string;
  /** Tenant association that owns the season. */
  associationId: string | null;
  platformAssociationId: string | null;
  competitionId: string;
  name: string;
  clubName: string;
  courts: Array<{ id: number; name: string }>;
  scoringOpen: boolean;
  /** Stable per-device id used for marker locks (never a real user). */
  deviceUser: { id: string; email: string };
  /** Base path for this link, e.g. /md/<token> or /md/<token>/court/9 */
  base: string;
}

export const MatchDayDeviceContext = createContext<MatchDayDevice | null>(null);

export function useMatchDayDevice(): MatchDayDevice | null {
  return useContext(MatchDayDeviceContext);
}

/** League Games home path: the secure link base in device mode, else /league-games. */
export function useLeagueGamesHome(): string {
  const md = useMatchDayDevice();
  return md ? md.base : "/league-games";
}

/**
 * Map a normal in-app tournament path onto the secure link, so the shared
 * screens keep their own navigation. Anything outside the competition goes
 * back to the link home — a link can never reach other app areas.
 */
export function mapMatchDayPath(md: MatchDayDevice, to: string): string {
  const b = md.base;
  if (to.startsWith(b)) return to;
  const [path, query] = to.split("?");
  const q = query ? `?${query}` : "";
  let m: RegExpMatchArray | null;
  if (path === "/match-marker") return `${b}/mark${q}`;
  if ((m = path.match(/^\/tournament-live\/([^/]+)$/))) return `${b}/live/${m[1]}${q}`;
  if ((m = path.match(/^\/bells-marker\/([^/]+)$/))) return `${b}/bells/${m[1]}${q}`;
  if (path.startsWith("/club-champs/") && md.kind === "tournament") return `${b}/t`;
  return b;
}

/** useNavigate that stays inside the secure link while in device mode. */
export function useMdNavigate() {
  const navigate = useNavigate();
  const md = useMatchDayDevice();
  return useCallback((to: any, opts?: NavigateOptions) => {
    if (!md || typeof to !== "string") return typeof to === "number" ? navigate(to) : navigate(to, opts);
    return navigate(mapMatchDayPath(md, to), opts);
  }, [md, navigate]) as ReturnType<typeof useNavigate>;
}
