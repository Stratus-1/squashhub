import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { ThumbsUp, ThumbsDown, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useClubContext } from "@/contexts/ClubContext";

/**
 * Prompt for the active member to confirm availability for the upcoming
 * league week. Hidden when:
 *  - member is not on any league roster (member_league_registrations)
 *  - they've already responded for the upcoming week
 *  - club has no leagues
 */
export function LeagueWeekAvailabilityCard() {
  const { activeMember } = useMemberContext();
  const { club } = useClubContext();
  const qc = useQueryClient();

  const clubId = club?.id;
  const memberId = activeMember?.id;
  const dow = (club as any)?.league_week_start_dow ?? 3; // default Wed

  // Compute the next league week_start_date (today or future occurrence of dow).
  const weekStartStr = useMemo(() => {
    const today = new Date();
    const todayDow = today.getDay();
    let diff = (dow - todayDow + 7) % 7;
    if (diff === 0) diff = 7; // always the *next* week, never today
    return format(addDays(today, diff), "yyyy-MM-dd");
  }, [dow]);

  const weekEndStr = useMemo(
    () => format(addDays(new Date(weekStartStr), 6), "yyyy-MM-dd"),
    [weekStartStr]
  );

  // Is the member on any league roster?
  const { data: rosterCount } = useQuery({
    queryKey: ["lwa-roster-check", clubId, memberId],
    enabled: !!clubId && !!memberId,
    queryFn: async () => {
      const { count, error } = await fromExt("member_league_registrations")
        .select("club_member_id", { count: "exact", head: true })
        .eq("club_member_id", memberId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Existing response for the upcoming week
  const { data: status } = useQuery({
    queryKey: ["lwa-status", clubId, memberId, weekStartStr],
    enabled: !!clubId && !!memberId,
    queryFn: async () => {
      const [{ data: a }, { data: u }] = await Promise.all([
        fromExt("league_week_availability")
          .select("week_start_date")
          .eq("club_id", clubId)
          .eq("club_member_id", memberId!)
          .eq("week_start_date", weekStartStr)
          .maybeSingle(),
        fromExt("league_week_unavailability")
          .select("week_start_date")
          .eq("club_id", clubId)
          .eq("club_member_id", memberId!)
          .eq("week_start_date", weekStartStr)
          .maybeSingle(),
      ]);
      if (a) return "available" as const;
      if (u) return "unavailable" as const;
      return null;
    },
  });

  const respond = useMutation({
    mutationFn: async (response: "available" | "unavailable") => {
      const { error } = await supabase.rpc("respond_league_week_availability" as any, {
        _club_member_id: memberId,
        _week_start_date: weekStartStr,
        _response: response,
      });
      if (error) throw error;
    },
    onSuccess: (_, response) => {
      qc.invalidateQueries({ queryKey: ["lwa-status", clubId, memberId, weekStartStr] });
      qc.invalidateQueries({ queryKey: ["my-lwa", clubId, memberId] });
      qc.invalidateQueries({ queryKey: ["my-lwu", clubId, memberId] });
      toast.success(response === "available" ? "Marked available" : "Marked unavailable");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update availability"),
  });

  if (!clubId || !memberId) return null;
  if (!rosterCount || rosterCount === 0) return null;

  const niceRange = `${format(new Date(weekStartStr), "EEE d MMM")} – ${format(new Date(weekEndStr), "EEE d MMM")}`;

  return (
    <Card className="p-3 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <CalendarCheck className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold leading-tight">League — next week</p>
            {status === "available" && (
              <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                You're in
              </Badge>
            )}
            {status === "unavailable" && (
              <Badge variant="secondary" className="text-[10px] bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30">
                Not available
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {status
              ? `Updated for ${niceRange}. Tap to change.`
              : `Confirm for ${niceRange} so your captain can fill the team.`}
          </p>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant={status === "available" ? "default" : "outline"}
              className="h-8 text-xs flex-1"
              disabled={respond.isPending}
              onClick={() => respond.mutate("available")}
            >
              <ThumbsUp className="w-3.5 h-3.5 mr-1.5" />
              Available
            </Button>
            <Button
              size="sm"
              variant={status === "unavailable" ? "default" : "outline"}
              className="h-8 text-xs flex-1"
              disabled={respond.isPending}
              onClick={() => respond.mutate("unavailable")}
            >
              <ThumbsDown className="w-3.5 h-3.5 mr-1.5" />
              Not available
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
