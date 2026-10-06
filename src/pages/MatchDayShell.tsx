/**
 * Secure Match Day link entry point. Validates the token, switches the data
 * client into scoped device mode and then renders the SAME League Games
 * screens members use (Upcoming / Team Standings / Individuals and the
 * Set up and mark game page). No second scoring UI for leagues.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MatchDayDeviceContext, type MatchDayDevice } from "@/contexts/MatchDayDevice";
import { enableMatchDayDevice, disableMatchDayDevice, matchDayDeviceId } from "@/lib/match-day/device";

const LeagueGames = lazy(() => import("./LeagueGames"));
const LeagueGameDetail = lazy(() => import("./LeagueGameDetail"));
// Tournaments: the SAME member screens (Tournaments list, tournament page with
// standings, live marker and live score view).
const Tournaments = lazy(() => import("./Tournaments"));
const ClubChampsView = lazy(() => import("./ClubChampsView"));
const MatchMarker = lazy(() => import("./MatchMarker"));
const BellsMarker = lazy(() => import("./BellsMarker"));
const TournamentMatchLive = lazy(() => import("./TournamentMatchLive"));

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
  </div>
);

/**
 * Leaves the match-day link: SPA-navigating away from /md/... unmounts this
 * shell, whose cleanup switches the data client back to normal (the member's
 * own login, if any, was never touched — device mode only overrides requests).
 */
const ExitMatchDay = () => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate("/", { replace: true })}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
    >
      <LogOut className="h-3.5 w-3.5" />
      Exit match day
    </button>
  );
};

export default function MatchDayShell() {
  const { token = "", court: courtParam, fixtureId } = useParams();
  const { pathname } = useLocation();
  const [sp] = useSearchParams();
  const qc = useQueryClient();
  const court = courtParam && /^\d+$/.test(courtParam) ? Number(courtParam) : null;
  const [info, setInfo] = useState<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    (supabase as any).rpc("md_device_info", { _token: token }).then(({ data, error }: any) => {
      if (!alive) return;
      setInfo(error ? { ok: false } : data);
    });
    return () => { alive = false; };
  }, [token]);

  const isLeague = info?.ok && (info.kind === "league_season" || info.kind === "tournament");

  useEffect(() => {
    if (!isLeague) return;
    // Drop any member-session cache, then scope every request to this link.
    qc.clear();
    enableMatchDayDevice(token, court);
    setReady(true);
    return () => { disableMatchDayDevice(); qc.clear(); };
  }, [isLeague, token, court, qc]);

  const device = useMemo<MatchDayDevice | null>(() => {
    if (!isLeague) return null;
    const courtName = court != null ? info.courts?.find((c: any) => c.id === court)?.name ?? `Court ${court}` : null;
    return {
      token, court, kind: info.kind, clubId: info.club_id, associationId: info.association_id ?? null,
      platformAssociationId: info.platform_association_id ?? null, competitionId: info.competition_id,
      name: info.name, clubName: info.club_name, courts: info.courts ?? [], scoringOpen: !!info.scoring_open,
      deviceUser: { id: matchDayDeviceId(), email: `Match Day (${courtName ?? "all courts"})` },
      base: court != null ? `/md/${token}/court/${court}` : `/md/${token}`,
    };
  }, [isLeague, info, token, court]);

  if (!info) return <Spinner />;
  if (!info.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold text-foreground">This link is no longer active</h1>
          <p className="text-sm text-muted-foreground mt-1">Ask the organiser for the current Match Day QR code.</p>
        </div>
      </div>
    );
  }
  if (!ready || !device) return <Spinner />;

  if (info.kind === "tournament") {
    const sub = pathname.slice(device.base.length) || "/";
    const deepMatch = sp.get("match");
    if (sub === "/" && deepMatch && /^[0-9a-f-]{36}$/i.test(deepMatch)) return <Navigate to={`${device.base}/live/${deepMatch}`} replace />;
    const page = sub.startsWith("/t") ? <ClubChampsView />
      : sub.startsWith("/mark") ? <MatchMarker />
      : sub.startsWith("/bells/") ? <BellsMarker />
      : sub.startsWith("/live/") ? <TournamentMatchLive />
      : <Tournaments />;
    return (
      <MatchDayDeviceContext.Provider value={device}>
        <Suspense fallback={<Spinner />}>{page}</Suspense>
        <ExitMatchDay />
      </MatchDayDeviceContext.Provider>
    );
  }

  // Email deep links (?match=<fixture>) open the same game page.
  const deep = sp.get("match");
  if (!fixtureId && deep && /^[0-9a-f-]{36}$/i.test(deep)) return <Navigate to={`${device.base}/game/${deep}`} replace />;

  return (
    <MatchDayDeviceContext.Provider value={device}>
      <Suspense fallback={<Spinner />}>
        {fixtureId ? <LeagueGameDetail /> : <LeagueGames />}
      </Suspense>
      <ExitMatchDay />
    </MatchDayDeviceContext.Provider>
  );
}
