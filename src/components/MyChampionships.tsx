import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub } from "@/hooks/use-club";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, ChevronRight, Calendar } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const GENDER_LABELS: Record<string, string> = { men: "Men's", ladies: "Ladies'", mixed: "Mixed" };

export function MyChampionships() {
  const navigate = useNavigate();
  const { activeMember } = useMemberContext();
  const { club: contextClub } = useClubContext();
  const { data: clubData } = useMyClub();
  const clubId = contextClub?.id || clubData?.club?.id;
  const memberId = activeMember?.id;

  // Get all active champs for the club
  const { data: allChamps = [] } = useQuery({
    queryKey: ["club-champs-active", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs")
        .select("id, name, gender, match_type, status, start_date, end_date")
        .eq("club_id", clubId!)
        .neq("status", "completed")
        .order("start_date");
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  const champIds = allChamps.map((c: any) => c.id);

  // Get entries for these champs (to find which ones the member is in)
  const { data: myEntries = [] } = useQuery({
    queryKey: ["my-champ-entries-dashboard", memberId, champIds],
    queryFn: async () => {
      if (!champIds.length || !memberId) return [];
      const { data, error } = await fromExt("club_champs_entries")
        .select("*, partner:partner_member_id(id, name, profiles:user_id(name))")
        .in("champ_id", champIds)
        .or(`club_member_id.eq.${memberId},partner_member_id.eq.${memberId}`);
      if (error) throw error;
      return data || [];
    },
    enabled: champIds.length > 0 && !!memberId,
  });

  // Get upcoming matches for this member
  const myChampIds = [...new Set(myEntries.map((e: any) => e.champ_id))];

  const { data: myMatches = [] } = useQuery({
    queryKey: ["my-champ-matches-dashboard", memberId, myChampIds],
    queryFn: async () => {
      if (!myChampIds.length || !memberId) return [];
      const { data, error } = await fromExt("club_champs_matches")
        .select("*, player_a:player_a_member_id(id, name, profiles:user_id(name)), player_b:player_b_member_id(id, name, profiles:user_id(name)), partner_a:partner_a_member_id(id, name, profiles:user_id(name)), partner_b:partner_b_member_id(id, name, profiles:user_id(name)), court:court_id(name)")
        .in("champ_id", myChampIds)
        .or(`player_a_member_id.eq.${memberId},player_b_member_id.eq.${memberId},partner_a_member_id.eq.${memberId},partner_b_member_id.eq.${memberId}`)
        .order("scheduled_date")
        .order("scheduled_time");
      if (error) throw error;
      return data || [];
    },
    enabled: myChampIds.length > 0 && !!memberId,
  });

  if (!myEntries.length) return null;

  const getName = (p: any) => p?.name || p?.profiles?.name || "Unknown";
  const getTeam = (a: any, b: any) => b ? `${getName(a)} & ${getName(b)}` : getName(a);

  const upcomingMatches = myMatches.filter((m: any) => m.status === "scheduled" && m.scheduled_date && !isPast(new Date(m.scheduled_date + "T23:59:59")));
  const completedMatches = myMatches.filter((m: any) => m.status === "completed");

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold font-heading flex items-center gap-1.5">
          <Trophy className="w-4 h-4" /> My Championships
        </h2>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/events")}>
          View all <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </div>

      {myEntries.map((entry: any) => {
        const champ = allChamps.find((c: any) => c.id === entry.champ_id);
        if (!champ) return null;
        const isDoubles = champ.match_type === "doubles";
        const partnerName = entry.partner ? getName(entry.partner) : null;
        const champUpcoming = upcomingMatches.filter((m: any) => m.champ_id === champ.id);
        const champCompleted = completedMatches.filter((m: any) => m.champ_id === champ.id);

        return (
          <Card key={entry.id} className="p-3 mb-2 border-primary/20" onClick={() => navigate(`/club-champs/${champ.id}`)} role="button">
            <div className="flex items-center justify-between mb-1">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{champ.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {GENDER_LABELS[champ.gender] || champ.gender} {isDoubles ? "Doubles" : "Singles"}
                  {isDoubles && partnerName && <> · Partner: <span className="font-medium text-foreground">{partnerName}</span></>}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>

            {champUpcoming.length > 0 ? (
              <div className="space-y-1 mt-1.5">
                {champUpcoming.slice(0, 2).map((m: any) => {
                  const isA = m.player_a_member_id === memberId || m.partner_a_member_id === memberId;
                  const opponent = isA
                    ? (isDoubles ? getTeam(m.player_b, m.partner_b) : getName(m.player_b))
                    : (isDoubles ? getTeam(m.player_a, m.partner_a) : getName(m.player_a));
                  const matchDate = m.scheduled_date ? new Date(m.scheduled_date) : null;
                  const today = matchDate && isToday(matchDate);

                  return (
                    <div key={m.id} className={cn(
                      "flex items-center gap-2 text-[12px] p-1.5 rounded",
                      today ? "bg-primary/10 border border-primary/20" : "bg-muted/50"
                    )}>
                      <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground shrink-0">
                        {matchDate ? format(matchDate, "EEE dd MMM") : "TBD"}
                      </span>
                      <span className="text-muted-foreground shrink-0">{m.scheduled_time?.slice(0, 5) || ""}</span>
                      <span className="font-medium truncate">vs {opponent}</span>
                      {m.court && <Badge variant="outline" className="text-[9px] ml-auto shrink-0">{m.court.name}</Badge>}
                      {today && <Badge className="text-[9px] shrink-0">Today</Badge>}
                    </div>
                  );
                })}
                {champUpcoming.length > 2 && (
                  <p className="text-[11px] text-muted-foreground text-center">+{champUpcoming.length - 2} more</p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1">
                {champCompleted.length > 0 ? `${champCompleted.length} matches played` : `${champ.start_date} – ${champ.end_date}`}
              </p>
            )}

            {champCompleted.length > 0 && (
              <div className="flex gap-3 mt-1.5 text-[11px]">
                <span className="text-primary font-medium">
                  W {champCompleted.filter((m: any) => m.winner_member_id === memberId).length}
                </span>
                <span className="text-destructive font-medium">
                  L {champCompleted.filter((m: any) => m.winner_member_id && m.winner_member_id !== memberId).length}
                </span>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
