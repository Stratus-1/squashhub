import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Crown, UserMinus, ArrowDown, Users, ArrowLeft } from "lucide-react";
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

  const memberIds = useMemo(() => {
    const ids = new Set<string>();
    registrations.forEach(r => ids.add(r.club_member_id));
    leagues.forEach(l => { if (l.captain_member_id) ids.add(l.captain_member_id); });
    return Array.from(ids);
  }, [registrations, leagues]);
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

  // Split leagues by category
  const mensLeagues = sortedLeagues.filter(l => isMensLeague(l.name));
  const ladiesLeagues = sortedLeagues.filter(l => isLadiesLeague(l.name));
  const otherLeagues = sortedLeagues.filter(l => !isMensLeague(l.name) && !isLadiesLeague(l.name));

  const hasBothGenders = mensLeagues.length > 0 && ladiesLeagues.length > 0;

  // Ladies pool (all ladies registered in any ladies league)
  const ladiesPoolMemberIds = Array.from(new Set(
    registrations
      .filter(r => ladiesLeagues.some(l => l.id === r.league_id))
      .map(r => r.club_member_id)
  ));

  // Members already pulled into a men's league this week (status row in any men's league)
  const ladiesAlreadyPulled = new Set(
    statuses
      .filter(s => mensLeagues.some(ml => ml.id === s.league_id) && ladiesPoolMemberIds.includes(s.club_member_id))
      .map(s => `${s.league_id}|${s.club_member_id}`)
  );

  // Determine which men's leagues current user captains (for the "pull" UI)
  const mensCaptainOf = mensLeagues.filter(lg => {
    const cap = registrations.find(r => r.league_id === lg.id && r.is_captain);
    return !!meMember && (cap?.club_member_id || lg.captain_member_id) === meMember.id;
  });

  const renderLeagueCard = (lg: LeagueRow, idx: number, listForOrdering: LeagueRow[]) => {
    const captainReg = registrations.find(r => r.league_id === lg.id && r.is_captain);
    const captainMemberId = captainReg?.club_member_id || lg.captain_member_id || null;
    const isCaptain = !!meMember && captainMemberId === meMember.id;
    const nextLeague = listForOrdering[idx + 1] || null;
    const prevLeague = listForOrdering[idx - 1] || null;

    const baseRegs = registrations.filter(r => r.league_id === lg.id);
    const basePool = baseRegs
      .map(r => ({ memberId: r.club_member_id, rank: r.player_rank, source: "registered" as const }))
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

    const cascaded = prevLeague
      ? statuses
          .filter(s => s.league_id === prevLeague.id && s.status === "excess")
          .filter(s => !statusMap.get(statusKey(lg.id, s.club_member_id)))
          .map(s => ({ memberId: s.club_member_id, rank: null, source: "cascaded" as const, fromLeagueId: prevLeague.id }))
      : [];

    // Pulled ladies: ladies players who have a "playing" status row in this men's league but no registration here
    const pulledLadies = isMensLeague(lg.name)
      ? statuses
          .filter(s => s.league_id === lg.id && ladiesPoolMemberIds.includes(s.club_member_id))
          .filter(s => !baseRegs.some(r => r.club_member_id === s.club_member_id))
          .map(s => ({ memberId: s.club_member_id, rank: null, source: "ladies-pulled" as const }))
      : [];

    const fullPool = [...basePool, ...cascaded, ...pulledLadies];

    return (
      <Card key={lg.id} className="p-3 space-y-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="default" className="text-xs">{lg.code || `#${idx + 1}`}</Badge>
            <span className="font-semibold text-sm">{lg.name}</span>
            {isCaptain && <Badge variant="secondary" className="text-[10px]">You captain this</Badge>}
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Crown className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-muted-foreground">Captain:</span>
            <span className="font-medium">
              {captainMemberId ? (memberMap.get(captainMemberId)?.name || "—") : <span className="italic text-muted-foreground">Not assigned</span>}
            </span>
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
                  {p.source === "ladies-pulled" && <Badge variant="outline" className="text-[10px]">♀ guest</Badge>}
                  {mem?.gender && p.source !== "ladies-pulled" && (mem.gender.toLowerCase().startsWith("f")) && <Badge variant="outline" className="text-[10px]">♀</Badge>}
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
                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Mark playing"
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
  };

  const headerCard = (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">
        <strong>Week of {format(new Date(weekStart), "EEE dd MMM")}</strong> — Captains tick players who are <strong>playing</strong>, mark <strong>unavailable</strong>, or push to <strong>excess</strong> (cascades to next league).
      </p>
    </Card>
  );

  // Single-column fallback (no clear gender split)
  if (!hasBothGenders) {
    return (
      <div className="space-y-3">
        {headerCard}
        {sortedLeagues.map((lg, idx) => renderLeagueCard(lg, idx, sortedLeagues))}
      </div>
    );
  }

  // Two-column layout: men's leagues left, ladies pool + ladies leagues right
  return (
    <div className="space-y-3">
      {headerCard}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Left: Men's leagues (2/3 width) */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground px-1">Men's Leagues</h3>
          {mensLeagues.map((lg, idx) => renderLeagueCard(lg, idx, mensLeagues))}
          {otherLeagues.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-muted-foreground px-1 pt-2">Other</h3>
              {otherLeagues.map((lg, idx) => renderLeagueCard(lg, idx, otherLeagues))}
            </>
          )}
        </div>

        {/* Right: Ladies side (1/3 width) */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground px-1">Ladies' Leagues</h3>
          {ladiesLeagues.map((lg, idx) => renderLeagueCard(lg, idx, ladiesLeagues))}

          {/* Pull-a-lady panel: shown when current user captains any men's league */}
          {mensCaptainOf.length > 0 && ladiesPoolMemberIds.length > 0 && (
            <Card className="p-3 space-y-2 border-dashed">
              <div className="flex items-center gap-2">
                <ArrowLeft className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs font-semibold">Pull a lady to your men's league</span>
              </div>
              <div className="space-y-1">
                {ladiesPoolMemberIds.map(mid => {
                  const mem = memberMap.get(mid);
                  // Find which ladies league she's in (for context label)
                  const homeReg = registrations.find(r =>
                    r.club_member_id === mid && ladiesLeagues.some(l => l.id === r.league_id)
                  );
                  const homeLeague = homeReg ? ladiesLeagues.find(l => l.id === homeReg.league_id) : null;

                  return (
                    <div key={mid} className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0">
                      <span className="text-sm flex-1 truncate">{mem?.name || "Unknown"}</span>
                      {homeLeague && <Badge variant="outline" className="text-[10px]">{homeLeague.code || homeLeague.name}</Badge>}
                      <select
                        className="text-[11px] bg-background border border-border rounded px-1 py-0.5"
                        defaultValue=""
                        onChange={(e) => {
                          const targetLeagueId = e.target.value;
                          if (!targetLeagueId) return;
                          if (ladiesAlreadyPulled.has(`${targetLeagueId}|${mid}`)) {
                            toast.info("Already pulled into that league");
                            e.target.value = "";
                            return;
                          }
                          setStatus.mutate({
                            league_id: targetLeagueId,
                            club_member_id: mid,
                            status: "playing",
                          });
                          e.target.value = "";
                        }}
                      >
                        <option value="">Pull to…</option>
                        {mensCaptainOf.map(ml => (
                          <option key={ml.id} value={ml.id}>{ml.code || ml.name}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
