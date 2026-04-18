import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Crown, UserMinus, ArrowDown, Users } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, addDays } from "date-fns";

type Props = { clubId: string };

type LeagueRow = {
  id: string;
  name: string;
  code: string | null;
  captain_member_id: string | null;
  allow_cross_gender_guests: boolean | null;
};

type RegRow = {
  id: string;
  club_member_id: string;
  league_id: string;
  player_rank: number | null;
  is_captain: boolean | null;
};

type StatusRow = {
  id: string;
  league_id: string;
  club_member_id: string;
  status: "playing" | "unavailable" | "excess";
  cascaded_from_league_id: string | null;
};

function leagueOrder(name: string, code: string | null): number {
  const m = (code || name).match(/(\d+)/);
  return m ? parseInt(m[1]) : 99;
}

function isLadiesLeague(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("ladies") || n.includes("women");
}

function isMensLeague(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("men") && !n.includes("women");
}

export function FillUpLeaguesTab({ clubId }: Props) {
  const qc = useQueryClient();

  // Club settings
  const { data: club } = useQuery({
    queryKey: ["club-fill-settings", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clubs").select("fill_top_down_enabled, league_week_start_dow").eq("id", clubId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Compute current week_start_date from configured DOW
  const weekStart = useMemo(() => {
    const dow = club?.league_week_start_dow ?? 3;
    const today = new Date();
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    // dow: 0 Sun..6 Sat → map to date-fns weekStartsOn
    const candidate = addDays(monday, ((dow + 6) % 7));
    if (candidate > today) return format(addDays(candidate, -7), "yyyy-MM-dd");
    return format(candidate, "yyyy-MM-dd");
  }, [club?.league_week_start_dow]);

  const prevWeekStart = useMemo(() => format(addDays(new Date(weekStart), -7), "yyyy-MM-dd"), [weekStart]);

  // Active member id
  const { data: meMember } = useQuery({
    queryKey: ["me-member", clubId],
    queryFn: async () => {
      const u = (await supabase.auth.getUser()).data.user;
      if (!u) return null;
      const { data } = await supabase.from("club_members").select("id").eq("club_id", clubId).eq("user_id", u.id).maybeSingle();
      return data;
    },
  });

  // Leagues
  const { data: leagues = [] } = useQuery<LeagueRow[]>({
    queryKey: ["leagues-with-captain", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("leagues")
        .select("id, name, code, captain_member_id, allow_cross_gender_guests")
        .eq("club_id", clubId);
      if (error) throw error;
      return (data as LeagueRow[]) || [];
    },
  });

  const sortedLeagues = useMemo(() => [...leagues].sort((a, b) => leagueOrder(a.name, a.code) - leagueOrder(b.name, b.code)), [leagues]);

  // Registrations across all club leagues
  const leagueIds = sortedLeagues.map(l => l.id);
  const { data: registrations = [] } = useQuery<RegRow[]>({
    queryKey: ["club-regs", leagueIds.join(",")],
    queryFn: async () => {
      if (leagueIds.length === 0) return [];
      const { data, error } = await fromExt("member_league_registrations")
        .select("id, club_member_id, league_id, player_rank, is_captain")
        .in("league_id", leagueIds);
      if (error) throw error;
      return (data as RegRow[]) || [];
    },
    enabled: leagueIds.length > 0,
  });

  const memberIds = useMemo(() => Array.from(new Set(registrations.map(r => r.club_member_id))), [registrations]);
  const { data: members = [] } = useQuery({
    queryKey: ["fill-members", memberIds.join(",")],
    queryFn: async () => {
      if (memberIds.length === 0) return [];
      const { data, error } = await supabase.from("club_members").select("id, name, gender, ladder_position").in("id", memberIds);
      if (error) throw error;
      return data || [];
    },
    enabled: memberIds.length > 0,
  });
  const memberMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string | null; gender: string | null; ladder_position: number | null }>();
    for (const x of members) m.set(x.id, x);
    return m;
  }, [members]);

  // This week's status rows
  const { data: statuses = [] } = useQuery<StatusRow[]>({
    queryKey: ["lwps", clubId, weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_week_player_status")
        .select("id, league_id, club_member_id, status, cascaded_from_league_id")
        .eq("club_id", clubId)
        .eq("week_start_date", weekStart);
      if (error) throw error;
      return (data as StatusRow[]) || [];
    },
  });

  // Previous week lineups for ±2 rule
  const { data: prevLineups = [] } = useQuery({
    queryKey: ["lwl-prev", clubId, prevWeekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_week_lineups")
        .select("league_id, position, club_member_id")
        .eq("club_id", clubId)
        .eq("week_start_date", prevWeekStart);
      if (error) throw error;
      return data || [];
    },
  });

  const prevPosByMember = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of prevLineups) m.set(r.club_member_id, r.position as number);
    return m;
  }, [prevLineups]);

  // Lookup helpers
  const statusKey = (leagueId: string, memberId: string) => `${leagueId}|${memberId}`;
  const statusMap = useMemo(() => {
    const m = new Map<string, StatusRow>();
    for (const s of statuses) m.set(statusKey(s.league_id, s.club_member_id), s);
    return m;
  }, [statuses]);

  // Mutations
  const setStatus = useMutation({
    mutationFn: async (input: { league_id: string; club_member_id: string; status: "playing" | "unavailable" | "excess"; cascaded_from_league_id?: string | null }) => {
      const existing = statusMap.get(statusKey(input.league_id, input.club_member_id));
      if (existing) {
        const { error } = await supabase.from("league_week_player_status")
          .update({ status: input.status, cascaded_from_league_id: input.cascaded_from_league_id ?? null })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("league_week_player_status").insert({
          club_id: clubId,
          league_id: input.league_id,
          week_start_date: weekStart,
          club_member_id: input.club_member_id,
          status: input.status,
          cascaded_from_league_id: input.cascaded_from_league_id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lwps", clubId, weekStart] }),
    onError: (e: any) => toast.error(e.message || "Failed to update"),
  });

  if (!club?.fill_top_down_enabled) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          "Fill up league teams from top down" is not enabled.
          <br />Ask your club admin to enable it under <strong>Manage Leagues</strong>.
        </p>
      </Card>
    );
  }

  if (sortedLeagues.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No leagues set up yet.</p>
      </Card>
    );
  }

  // Build per-league pool: registered players + ladies overflow into men's league #1 (if cross-gender allowed)
  // Cascade rule (2c): excess from league N appears in league N+1 pool. ±2 rule enforced visually.
  const ladiesPool = registrations
    .filter(r => {
      const lg = sortedLeagues.find(l => l.id === r.league_id);
      return lg && isLadiesLeague(lg.name);
    })
    .map(r => r.club_member_id);

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <p className="text-xs text-muted-foreground">
          <strong>Week of {format(new Date(weekStart), "EEE dd MMM")}</strong> — Captains tick players who are <strong>playing</strong>, mark <strong>unavailable</strong>, or push to <strong>excess</strong> (cascades to next league).
        </p>
      </Card>

      {sortedLeagues.map((lg, idx) => {
        const captainReg = registrations.find(r => r.league_id === lg.id && r.is_captain);
        const captainMemberId = captainReg?.club_member_id || lg.captain_member_id || null;
        const isCaptain = !!meMember && captainMemberId === meMember.id;
        const nextLeague = sortedLeagues[idx + 1] || null;
        const prevLeague = sortedLeagues[idx - 1] || null;

        // Pool for this league
        const baseRegs = registrations.filter(r => r.league_id === lg.id);
        const basePool = baseRegs
          .map(r => ({ memberId: r.club_member_id, rank: r.player_rank, source: "registered" as const }))
          .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

        // Cascaded excess from previous league
        const cascaded = prevLeague
          ? statuses
              .filter(s => s.league_id === prevLeague.id && s.status === "excess")
              .filter(s => !statusMap.get(statusKey(lg.id, s.club_member_id))) // not already chosen here
              .map(s => ({ memberId: s.club_member_id, rank: null, source: "cascaded" as const, fromLeagueId: prevLeague.id }))
          : [];

        // Cross-gender ladies: only first men's league of this club, and only if flag allows
        const ladiesGuestPool = (lg.allow_cross_gender_guests && isMensLeague(lg.name))
          ? ladiesPool
              .filter(mid => !baseRegs.some(r => r.club_member_id === mid))
              .map(mid => ({ memberId: mid, rank: null, source: "ladies" as const }))
          : [];

        const fullPool = [...basePool, ...cascaded, ...ladiesGuestPool];

        return (
          <Card key={lg.id} className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="default" className="text-xs">{lg.code || `#${idx + 1}`}</Badge>
                <span className="font-semibold text-sm">{lg.name}</span>
                {captainMemberId && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Crown className="w-3 h-3" /> {memberMap.get(captainMemberId)?.name || "Captain"}
                  </span>
                )}
                {isCaptain && <Badge variant="secondary" className="text-[10px]">You captain this</Badge>}
              </div>
            </div>

            {fullPool.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No players in pool.</p>
            ) : (
              <div className="space-y-1">
                {fullPool.map((p, pi) => {
                  const mem = memberMap.get(p.memberId);
                  const st = statusMap.get(statusKey(lg.id, p.memberId));
                  const status = st?.status || "playing";
                  const prevPos = prevPosByMember.get(p.memberId);
                  const moveDelta = prevPos !== undefined ? Math.abs((pi + 1) - prevPos) : null;
                  const violatesRule = moveDelta !== null && moveDelta > 2;

                  return (
                    <div key={`${lg.id}-${p.memberId}`} className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0">
                      <span className="text-xs text-muted-foreground w-6 text-right">{pi + 1}.</span>
                      <Checkbox
                        checked={status === "playing"}
                        disabled={!isCaptain}
                        onCheckedChange={(v) =>
                          setStatus.mutate({
                            league_id: lg.id,
                            club_member_id: p.memberId,
                            status: v ? "playing" : "unavailable",
                            cascaded_from_league_id: p.source === "cascaded" ? (p as any).fromLeagueId : null,
                          })
                        }
                      />
                      <span className={`text-sm flex-1 truncate ${status === "unavailable" ? "line-through text-muted-foreground" : ""}`}>
                        {mem?.name || "Unknown"}
                      </span>
                      {p.source === "cascaded" && <Badge variant="outline" className="text-[10px]">↓ from {prevLeague?.code}</Badge>}
                      {p.source === "ladies" && <Badge variant="outline" className="text-[10px]">♀ guest</Badge>}
                      {mem?.gender && p.source !== "ladies" && (mem.gender.toLowerCase().startsWith("f")) && <Badge variant="outline" className="text-[10px]">♀</Badge>}
                      {violatesRule && (
                        <Badge variant="destructive" className="text-[10px]">±{moveDelta} &gt; 2</Badge>
                      )}
                      {isCaptain && status !== "excess" && nextLeague && (
                        <Button size="icon" variant="ghost" className="h-6 w-6"
                          title={`Move to ${nextLeague.code || nextLeague.name}`}
                          onClick={() =>
                            setStatus.mutate({
                              league_id: lg.id,
                              club_member_id: p.memberId,
                              status: "excess",
                            })
                          }
                        >
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                      )}
                      {isCaptain && status === "unavailable" && (
                        <Button size="icon" variant="ghost" className="h-6 w-6" title="Unavailable"
                          onClick={() =>
                            setStatus.mutate({ league_id: lg.id, club_member_id: p.memberId, status: "playing" })
                          }
                        >
                          <UserMinus className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
