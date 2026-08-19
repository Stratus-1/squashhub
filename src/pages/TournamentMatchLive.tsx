import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Gavel, Radio } from "lucide-react";
import { useChampMarkerLock } from "@/hooks/use-champ-marker-lock";
import { useAuth } from "@/contexts/AuthContext";
import { getTournamentFormat } from "@/lib/tournament-formats";
import { MarkerTakeoverDialog } from "@/components/tournaments/MarkerTakeoverDialog";
import { useMemberContext } from "@/contexts/MemberContext";

type Sets = Array<{ a: number; b: number }>;

function parseSets(raw: any): Sets {
  try {
    const parsed = typeof raw === "string" && raw.trim() ? JSON.parse(raw) : raw;
    const sets = Array.isArray(parsed?.sets) ? parsed.sets : [];
    return sets.map((s: any) => ({ a: Number(s?.a) || 0, b: Number(s?.b) || 0 }));
  } catch {
    return [];
  }
}

const nameOf = (p: any) => p?.name || p?.profiles?.name || null;

/**
 * Read-only live scoreboard for a single tournament match.
 * Opened from the LIVE chip on the Tournament Games list — spectators watch
 * here instead of being bounced into (or out of) the marker.
 */
export default function TournamentMatchLive() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeMember } = useMemberContext();
  const [match, setMatch] = useState<any>(null);
  const [champ, setChamp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [takeoverOpen, setTakeoverOpen] = useState(false);

  const { lock, fresh } = useChampMarkerLock(matchId, user?.id);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await fromExt("club_champs_matches")
        .select(`
          *,
          player_a:player_a_member_id(id, name, profiles:user_id(name)),
          player_b:player_b_member_id(id, name, profiles:user_id(name)),
          partner_a:partner_a_member_id(id, name, profiles:user_id(name)),
          partner_b:partner_b_member_id(id, name, profiles:user_id(name)),
          court:court_id(name)
        `)
        .eq("id", matchId)
        .maybeSingle();
      if (cancelled) return;
      const row = data as any;
      setMatch(row || null);
      if (row?.champ_id) {
        const { data: champRow } = await fromExt("club_champs")
          .select("id, name, match_type, scoring_mode, best_of, points_per_game")
          .eq("id", row.champ_id)
          .maybeSingle();
        if (cancelled) return;
        setChamp(champRow || null);
      } else {
        setChamp(null);
      }
      setLoading(false);
    };
    load();
    const poll = setInterval(load, 5000);
    const ch = supabase
      .channel(`champ-match-live:${matchId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "club_champs_matches", filter: `id=eq.${matchId}` }, () => load())
      .subscribe();
    return () => { cancelled = true; clearInterval(poll); supabase.removeChannel(ch); };
  }, [matchId]);

  const isDoubles = champ?.match_type === "doubles" || champ?.match_type === "mixed";
  const teamA = useMemo(() => {
    if (!match) return "Side A";
    const a = nameOf(match.player_a) || match.placeholder_a || "TBD";
    const pa = isDoubles ? nameOf(match.partner_a) : null;
    return pa ? `${a} & ${pa}` : a;
  }, [match, isDoubles]);
  const teamB = useMemo(() => {
    if (!match) return "Side B";
    const b = nameOf(match.player_b) || match.placeholder_b || "TBD";
    const pb = isDoubles ? nameOf(match.partner_b) : null;
    return pb ? `${b} & ${pb}` : b;
  }, [match, isDoubles]);

  const sets = parseSets(match?.game_scores);
  const gamesA = sets.filter((s) => s.a > s.b).length;
  const gamesB = sets.filter((s) => s.b > s.a).length;
  const curA = Number(match?.side_a_points) || 0;
  const curB = Number(match?.side_b_points) || 0;
  const completed = match?.status === "completed";
  const live = match?.status === "in_progress";

  const markRoute = match ? getTournamentFormat(champ?.scoring_mode).markerRoute(match.id) : "";
  const requesterName = activeMember?.name || user?.email || "A marker";

  const takeOverOrResume = () => {
    if (!markRoute) return;
    if (fresh && lock && lock.user_id !== user?.id) {
      setTakeoverOpen(true);
      return;
    }
    navigate(markRoute);
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <SEO title={`${teamA} vs ${teamB} | Live score`} description="Live tournament match score" />
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            {live && fresh && (
              <span className="live-indicator text-[11px] px-2.5 py-1">
                <Radio className="w-3 h-3" /> LIVE
              </span>
            )}
            {live && !fresh && (
              <Badge variant="outline" className="text-[11px] border-amber-500/60 text-amber-700 dark:text-amber-300">
                Paused · no marker
              </Badge>
            )}
            {completed && <Badge variant="secondary" className="text-[11px]">Final</Badge>}
          </div>

        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading live score…</p>}
        {!loading && !match && <p className="text-sm text-muted-foreground">Match not found.</p>}

        {match && (
          <Card>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {champ?.name && <Badge variant="outline" className="text-[10px]">{champ.name}</Badge>}
                {match.court?.name && <Badge variant="outline" className="text-[10px]">{match.court.name}</Badge>}
                {match.scheduled_time && <span>{String(match.scheduled_time).slice(0, 5)}</span>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[{ n: teamA, s: curA, g: gamesA }, { n: teamB, s: curB, g: gamesB }].map((side, i) => (
                  <div key={i} className="rounded-xl bg-muted/60 p-4 text-center">
                    <p className="font-heading font-bold text-sm sm:text-lg break-words leading-tight min-h-[2.5rem]">{side.n}</p>
                    <p className="text-6xl sm:text-7xl font-black tabular-nums leading-none mt-2">{side.s}</p>
                    <p className="text-xs text-muted-foreground mt-2">Games won: <span className="font-semibold text-foreground">{side.g}</span></p>
                  </div>
                ))}
              </div>

              {sets.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {sets.map((s, i) => (
                    <Badge key={i} variant="outline" className="text-[11px] tabular-nums">
                      G{i + 1}: {s.a}-{s.b}
                    </Badge>
                  ))}
                </div>
              )}

              <p className="text-xs text-center text-muted-foreground">
                {fresh && lock
                  ? <>Being marked by <span className="font-medium text-foreground">{lock.user_name}</span></>
                  : live
                    ? "Nobody is marking this game right now — you can take over from the current score."
                    : completed ? "This match is finished." : "This match has not started yet."}
              </p>


              {!completed && (
                <div className="flex justify-center">
                  <Button size="sm" variant="outline" className="gap-1" onClick={takeOverOrResume}>
                    <Gavel className="w-3.5 h-3.5" /> {fresh && lock?.user_id !== user?.id ? "Take over marking" : "Resume marking"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <MarkerTakeoverDialog
        open={takeoverOpen}
        onOpenChange={setTakeoverOpen}
        matchId={matchId || null}
        markRoute={markRoute}
        matchLabel={`${teamA} vs ${teamB}`}
        markerName={lock?.user_name}
        requesterName={requesterName}
      />
    </div>
  );
}
