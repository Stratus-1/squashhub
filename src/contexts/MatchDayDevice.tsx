/**
 * Match Day device mode. When a valid secure link is opened, the EXISTING
 * League Games screens render inside this provider. Every data request then
 * goes out as the anonymous role plus the `x-match-day-token` header, and the
 * database only lets it reach that one competition's fixtures (see the
 * `md_hdr_*` policies). No member identity, admin rights or other club data.
 */
import { createContext, useContext } from "react";

export interface MatchDayDevice {
  token: string;
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
