import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Swords, ChevronRight, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useMemberContext } from "@/contexts/MemberContext";
import { useMyClub } from "@/hooks/use-club";
import { useChallenges, useLadder } from "@/hooks/use-data";

/**
 * Compact "My Challenges" dashboard block, mirroring the "My Tournaments"
 * layout. Lists the member's active challenges and a single suggested
 * opponent (nearby on the ladder) with a Challenge action.
 */
export function MyChallenges() {
  const navigate = useNavigate();
  const { activeMember } = useMemberContext();
  const { data: clubData } = useMyClub();
  const clubId = clubData?.club?.id;
  const memberId = activeMember?.id;
  const challengeLevelsUp = (clubData?.club as any)?.challenge_levels_up ?? 2;

  const { data: ladder } = useLadder(clubId);
  const { data: challenges = [] } = useChallenges(undefined, { memberId });

  const active = useMemo(
    () => (challenges || []).filter((c: any) => c.status === "pending" || c.status === "accepted"),
    [challenges],
  );

  const suggested = useMemo(() => {
    if (!memberId || !ladder) return null;
    const me: any = ladder.find((p: any) => p.club_member_id === memberId);
    if (!me?.ladder_position) return null;
    const myLadies = ["female", "ladies", "f"].includes((me.gender || "").toLowerCase());
    const pool = (ladder || []).filter((p: any) => {
      if (p.club_member_id === memberId) return false;
      if (typeof p.ladder_position !== "number") return false;
      const isLadies = ["female", "ladies", "f"].includes((p.gender || "").toLowerCase());
      return isLadies === myLadies;
    });
    const GAP = challengeLevelsUp;
    const above = pool
      .filter((p: any) => p.ladder_position < me.ladder_position && me.ladder_position - p.ladder_position <= GAP)
      .sort((a: any, b: any) => b.ladder_position - a.ladder_position);
    if (above.length) return above[0];
    const below = pool
      .filter((p: any) => p.ladder_position > me.ladder_position && p.ladder_position - me.ladder_position <= GAP)
      .sort((a: any, b: any) => a.ladder_position - b.ladder_position);
    return below[0] || null;
  }, [ladder, memberId, challengeLevelsUp]);

  if (!memberId) return null;
  if (active.length === 0 && !suggested) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold font-heading flex items-center gap-1.5">
          <Swords className="w-4 h-4" /> My Challenges
        </h2>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/challenges")}>
          View all <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </div>

      {active.slice(0, 3).map((c: any) => {
        const iAmChallenger = c.challenger_member_id === memberId || c.challenger_id === activeMember?.user_id;
        const opponent = iAmChallenger ? c.opponent_name : c.challenger_name;
        return (
          <Card
            key={c.id}
            className="p-3 mb-2 border-primary/20 cursor-pointer"
            role="button"
            onClick={() => navigate("/challenges")}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">vs {opponent || "Unknown"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {iAmChallenger ? "You challenged" : "Challenged you"}
                  {c.proposed_date && <> · {format(new Date(c.proposed_date), "EEE dd MMM")}</>}
                </p>
              </div>
              <Badge variant={c.status === "accepted" ? "default" : "secondary"} className="capitalize shrink-0">
                {c.status}
              </Badge>
            </div>
          </Card>
        );
      })}

      {suggested && (
        <Card className="p-3 mb-2 border-primary/20">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                Suggested opponent
              </p>
              <p className="text-sm font-semibold truncate">
                {(suggested as any).name || "Unknown"}
              </p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Trophy className="w-3 h-3" />
                #{(suggested as any).ladder_position} on ladder
                {" · "}
                {(suggested as any).wins || 0}W / {(suggested as any).losses || 0}L
              </p>
            </div>
            <Button size="sm" className="shrink-0" onClick={() => navigate("/ladder")}>
              <Swords className="w-4 h-4 mr-1" /> Challenge
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
