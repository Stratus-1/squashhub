import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Ban, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, startOfWeek, addDays } from "date-fns";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { LeagueColumn } from "./fill-leagues/LeagueColumn";
import { DroppableZone } from "./fill-leagues/DroppableZone";
import { DraggablePlayer } from "./fill-leagues/DraggablePlayer";
import {
  naDropId,
  parseDragId,
  parseDropId,
  type LeagueRow,
  type RegRow,
  type StatusRow,
  type LineupRow,
  type MemberLite,
  type FixtureLite,
} from "./fill-leagues/types";

type Props = { clubId: string; activeMemberId?: string | null };

function leagueOrder(name: string, code: string | null): number {
  const m = (code || name).match(/(\d+)/);
  return m ? parseInt(m[1]) : 99;
}
const isLadiesLeague = (n: string) => /ladies|women/i.test(n);
const isMensLeague = (n: string) => /\bmen\b/i.test(n) && !/women/i.test(n);

export function FillUpLeaguesTab({ clubId, activeMemberId }: Props) {
  const qc = useQueryClient();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [selectedWeekOverride, setSelectedWeekOverride] = useState<string | null>(null);

  // Club settings
  const { data: club } = useQuery({
    queryKey: ["club-fill-settings", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clubs").select("fill_top_down_enabled, league_week_start_dow").eq("id", clubId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Detect club admin role for active member
  const { data: amIAdmin } = useQuery({
    queryKey: ["am-i-admin", clubId, activeMemberId],
    queryFn: async () => {
      if (!activeMemberId) return false;
      const { data, error } = await supabase.from("club_members").select("role").eq("id", activeMemberId).maybeSingle();
      if (error) return false;
      return data?.role === "admin" || data?.role === "captain";
    },
    enabled: !!activeMemberId,
  });

  const meMember = useMemo(() => (activeMemberId ? { id: activeMemberId } : null), [activeMemberId]);

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

  const sortedLeagues = useMemo(
    () => [...leagues].sort((a, b) => leagueOrder(a.name, a.code) - leagueOrder(b.name, b.code)),
    [leagues],
  );

  // Build a list of candidate planning weeks.
  // Always start with the CURRENT squash week (the one containing today) so an
  // in-progress week whose fixtures haven't been played yet (e.g. a Tue fixture when
  // the squash week starts on Wed) remains plannable. Then add the next 7 weeks.
  const candidateWeeks = useMemo(() => {
    const dow = club?.league_week_start_dow ?? 3;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    let currentStart = addDays(monday, ((dow + 6) % 7));
    if (currentStart > today) currentStart = addDays(currentStart, -7);
    return Array.from({ length: 8 }, (_, i) => format(addDays(currentStart, i * 7), "yyyy-MM-dd"));
  }, [club?.league_week_start_dow]);

  const { data: lookaheadLineups = [] } = useQuery<{ week_start_date: string; league_id: string; club_member_id: string }[]>({
    queryKey: ["lwl-lookahead", clubId, candidateWeeks.join(",")],
    queryFn: async () => {
      if (candidateWeeks.length === 0) return [];
      const { data, error } = await supabase
        .from("league_week_lineups")
        .select("week_start_date, league_id, club_member_id")
        .eq("club_id", clubId)
        .in("week_start_date", candidateWeeks);
      if (error) throw error;
      return data || [];
    },
    enabled: candidateWeeks.length > 0,
  });

  // Auto-pick: earliest candidate week with any incomplete lineup
  const autoWeekStart = useMemo(() => {
    if (candidateWeeks.length === 0) return format(new Date(), "yyyy-MM-dd");
    if (sortedLeagues.length === 0) return candidateWeeks[0];
    const counts = new Map<string, Map<string, Set<string>>>();
    for (const row of lookaheadLineups) {
      if (!counts.has(row.week_start_date)) counts.set(row.week_start_date, new Map());
      const lm = counts.get(row.week_start_date)!;
      if (!lm.has(row.league_id)) lm.set(row.league_id, new Set());
      lm.get(row.league_id)!.add(row.club_member_id);
    }
    for (const wk of candidateWeeks) {
      const lm = counts.get(wk);
      const allComplete = sortedLeagues.every(lg => (lm?.get(lg.id)?.size ?? 0) >= 4);
      if (!allComplete) return wk;
    }
    return candidateWeeks[candidateWeeks.length - 1];
  }, [candidateWeeks, lookaheadLineups, sortedLeagues]);

  // User can override via selector; otherwise show auto-picked week
  const weekStart = useMemo(
    () => (selectedWeekOverride && candidateWeeks.includes(selectedWeekOverride) ? selectedWeekOverride : autoWeekStart),
    [selectedWeekOverride, autoWeekStart, candidateWeeks],
  );

  const weekEnd = useMemo(() => format(addDays(new Date(weekStart), 7), "yyyy-MM-dd"), [weekStart]);

  const chosenWeekIndex = useMemo(() => Math.max(0, candidateWeeks.indexOf(weekStart)), [candidateWeeks, weekStart]);

  // Per-week completeness summary (used to badge tabs in the selector)
  const weekCompletion = useMemo(() => {
    const result = new Map<string, { filled: number; total: number }>();
    if (sortedLeagues.length === 0) return result;
    const counts = new Map<string, Map<string, Set<string>>>();
    for (const row of lookaheadLineups) {
      if (!counts.has(row.week_start_date)) counts.set(row.week_start_date, new Map());
      const lm = counts.get(row.week_start_date)!;
      if (!lm.has(row.league_id)) lm.set(row.league_id, new Set());
      lm.get(row.league_id)!.add(row.club_member_id);
    }
    for (const wk of candidateWeeks) {
      const lm = counts.get(wk);
      let filled = 0;
      for (const lg of sortedLeagues) filled += Math.min(4, lm?.get(lg.id)?.size ?? 0);
      result.set(wk, { filled, total: sortedLeagues.length * 4 });
    }
    return result;
  }, [candidateWeeks, lookaheadLineups, sortedLeagues]);

  // Registrations
  const leagueIds = sortedLeagues.map(l => l.id);
  const { data: registrations = [] } = useQuery<RegRow[]>({
    queryKey: ["club-regs", leagueIds.join(",")],
    queryFn: async () => {
      if (leagueIds.length === 0) return [];
      const { data, error } = await fromExt("member_league_registrations")
        .select("id, club_member_id, league_id, player_rank, is_captain, league_association_number, ssa_number")
        .in("league_id", leagueIds);
      if (error) throw error;
      return (data as RegRow[]) || [];
    },
    enabled: leagueIds.length > 0,
  });

  // Members
  const memberIds = useMemo(() => {
    const ids = new Set<string>();
    registrations.forEach(r => ids.add(r.club_member_id));
    leagues.forEach(l => { if (l.captain_member_id) ids.add(l.captain_member_id); });
    return Array.from(ids);
  }, [registrations, leagues]);

  const { data: members = [] } = useQuery<MemberLite[]>({
    queryKey: ["fill-members", memberIds.join(",")],
    queryFn: async () => {
      if (memberIds.length === 0) return [];
      const { data, error } = await supabase
        .from("club_members")
        .select("id, name, gender, ladder_position")
        .in("id", memberIds);
      if (error) throw error;
      return (data || []) as MemberLite[];
    },
    enabled: memberIds.length > 0,
  });
  const memberMap = useMemo(() => {
    const m = new Map<string, MemberLite>();
    for (const x of members) m.set(x.id, x);
    return m;
  }, [members]);

  // memberId → league association/SSA number (prefers league_association_number)
  const leagueNumberByMember = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of registrations) {
      const num = r.league_association_number || r.ssa_number;
      if (num && !m.has(r.club_member_id)) m.set(r.club_member_id, num);
    }
    return m;
  }, [registrations]);

  // Per-league weekly status (for cascade tracking)
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

  // Persisted lineups (positions 1-4 per league per week)
  const { data: lineups = [] } = useQuery<LineupRow[]>({
    queryKey: ["lwl", clubId, weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_week_lineups")
        .select("id, league_id, position, club_member_id")
        .eq("club_id", clubId)
        .eq("week_start_date", weekStart);
      if (error) throw error;
      return (data as LineupRow[]) || [];
    },
  });

  // Week-wide unavailability
  const { data: unavailable = [] } = useQuery<{ id: string; club_member_id: string }[]>({
    queryKey: ["lwu", clubId, weekStart],
    queryFn: async () => {
      const { data, error } = await fromExt("league_week_unavailability")
        .select("id, club_member_id")
        .eq("club_id", clubId)
        .eq("week_start_date", weekStart);
      if (error) throw error;
      return data || [];
    },
  });
  const unavailableSet = useMemo(() => new Set(unavailable.map(u => u.club_member_id)), [unavailable]);

  // Next upcoming fixture per league code
  const leagueCodes = useMemo(
    () => sortedLeagues.map(l => l.code).filter((c): c is string => !!c),
    [sortedLeagues],
  );
  
  const { data: fixtures = [] } = useQuery<FixtureLite[]>({
    queryKey: ["next-fixtures-by-code", leagueCodes.join(","), weekStart, weekEnd],
    queryFn: async () => {
      if (leagueCodes.length === 0) return [];
      const { data, error } = await fromExt("platform_league_fixtures")
        .select("id, fixture_date, venue_name, home_team_code, away_team_code")
        .gte("fixture_date", weekStart)
        .lt("fixture_date", weekEnd)
        .or(leagueCodes.map(c => `home_team_code.eq.${c},away_team_code.eq.${c}`).join(","))
        .order("fixture_date", { ascending: true });
      if (error) throw error;
      return (data || []) as FixtureLite[];
    },
    enabled: leagueCodes.length > 0,
  });
  const nextFixtureByCode = useMemo(() => {
    const m = new Map<string, FixtureLite>();
    for (const f of fixtures) {
      for (const code of [f.home_team_code, f.away_team_code]) {
        if (leagueCodes.includes(code) && !m.has(code)) m.set(code, f);
      }
    }
    return m;
  }, [fixtures, leagueCodes]);

  // ---------- Mutations ----------

  const upsertLineup = useMutation({
    mutationFn: async (input: { league_id: string; position: number; club_member_id: string }) => {
      // Remove the player from any other lineup slots this week first (move semantics)
      await supabase
        .from("league_week_lineups")
        .delete()
        .eq("club_id", clubId)
        .eq("week_start_date", weekStart)
        .eq("club_member_id", input.club_member_id);

      // Then upsert into the target slot (unique on league+week+position)
      const { error } = await supabase.from("league_week_lineups").upsert(
        {
          club_id: clubId,
          league_id: input.league_id,
          week_start_date: weekStart,
          position: input.position,
          club_member_id: input.club_member_id,
        },
        { onConflict: "league_id,week_start_date,position" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lwl", clubId, weekStart] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to assign position"),
  });

  const clearLineupForMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("league_week_lineups")
        .delete()
        .eq("club_id", clubId)
        .eq("week_start_date", weekStart)
        .eq("club_member_id", memberId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lwl", clubId, weekStart] }),
  });

  const setStatusMut = useMutation({
    mutationFn: async (input: {
      league_id: string;
      club_member_id: string;
      status: "playing" | "unavailable" | "excess";
      cascaded_from_league_id?: string | null;
    }) => {
      const existing = statuses.find(s => s.league_id === input.league_id && s.club_member_id === input.club_member_id);
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

  const markUnavailable = useMutation({
    mutationFn: async (memberId: string) => {
      // Remove any existing lineup placement first
      await supabase
        .from("league_week_lineups")
        .delete()
        .eq("club_id", clubId)
        .eq("week_start_date", weekStart)
        .eq("club_member_id", memberId);
      const { error } = await fromExt("league_week_unavailability").insert({
        club_id: clubId,
        club_member_id: memberId,
        week_start_date: weekStart,
      });
      if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lwu", clubId, weekStart] });
      qc.invalidateQueries({ queryKey: ["lwl", clubId, weekStart] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to mark unavailable"),
  });

  const clearUnavailable = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await fromExt("league_week_unavailability")
        .delete()
        .eq("club_id", clubId)
        .eq("week_start_date", weekStart)
        .eq("club_member_id", memberId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lwu", clubId, weekStart] }),
  });

  // ---------- Derived: per-league pools & lineups ----------

  const lineupByLeague = useMemo(() => {
    const m = new Map<string, Map<number, string>>(); // leagueId -> (pos -> memberId)
    for (const l of lineups) {
      if (!m.has(l.league_id)) m.set(l.league_id, new Map());
      m.get(l.league_id)!.set(l.position, l.club_member_id);
    }
    return m;
  }, [lineups]);

  const memberCurrentLineup = useMemo(() => {
    const m = new Map<string, { leagueId: string; position: number }>();
    for (const l of lineups) m.set(l.club_member_id, { leagueId: l.league_id, position: l.position });
    return m;
  }, [lineups]);

  const isCaptainOfLeague = (lg: LeagueRow): boolean => {
    if (!meMember) return false;
    const cap = registrations.find(r => r.league_id === lg.id && r.is_captain);
    return (cap?.club_member_id || lg.captain_member_id) === meMember.id;
  };

  const canEditLeague = (lg: LeagueRow): boolean => isCaptainOfLeague(lg) || !!amIAdmin;

  // Build bench for a league = registered players + cascaded-in - already-in-position - unavailable
  const benchForLeague = (lg: LeagueRow, listForOrdering: LeagueRow[]) => {
    const idx = listForOrdering.findIndex(l => l.id === lg.id);
    const prevLeague = idx > 0 ? listForOrdering[idx - 1] : null;

    const baseRegs = registrations.filter(r => r.league_id === lg.id);
    const basePool = baseRegs.map(r => ({
      memberId: r.club_member_id,
      rank: r.player_rank,
      isPulled: false,
      isCascaded: false,
      cascadedFromCode: null as string | null,
    }));

    const cascaded = prevLeague
      ? statuses
          .filter(s => s.league_id === prevLeague.id && s.status === "excess")
          .filter(s => !baseRegs.some(r => r.club_member_id === s.club_member_id))
          .map(s => ({
            memberId: s.club_member_id,
            rank: null,
            isPulled: false,
            isCascaded: true,
            cascadedFromCode: prevLeague.code,
          }))
      : [];

    const ladiesPoolMemberIds = new Set(
      registrations
        .filter(r => sortedLeagues.find(l => l.id === r.league_id && isLadiesLeague(l.name)))
        .map(r => r.club_member_id),
    );
    const pulledLadies = isMensLeague(lg.name)
      ? statuses
          .filter(s => s.league_id === lg.id && ladiesPoolMemberIds.has(s.club_member_id))
          .filter(s => !baseRegs.some(r => r.club_member_id === s.club_member_id))
          .map(s => ({
            memberId: s.club_member_id,
            rank: null,
            isPulled: true,
            isCascaded: false,
            cascadedFromCode: null as string | null,
          }))
      : [];

    const positionedThisLeague = new Set<string>();
    const lp = lineupByLeague.get(lg.id);
    if (lp) for (const mid of lp.values()) positionedThisLeague.add(mid);

    return [...basePool, ...cascaded, ...pulledLadies]
      .filter(p => !unavailableSet.has(p.memberId))
      .filter(p => !positionedThisLeague.has(p.memberId))
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  };

  const positionsForLeague = (lg: LeagueRow) => {
    const lp = lineupByLeague.get(lg.id);
    return [1, 2, 3, 4].map(position => ({
      position,
      memberId: lp?.get(position) ?? null,
    }));
  };

  // ---------- DnD handlers ----------

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;
    const drag = parseDragId(String(active.id));
    const drop = parseDropId(String(over.id));
    if (!drag || !drop) return;

    const { memberId, origin } = drag;

    // NA zone — week-wide unavailable
    if (drop.kind === "na") {
      if (!amIAdmin && !sortedLeagues.some(canEditLeague)) {
        toast.error("Only captains/admins can mark unavailability");
        return;
      }
      markUnavailable.mutate(memberId);
      return;
    }

    // Position slot
    if (drop.kind === "pos") {
      const targetLeague = sortedLeagues.find(l => l.id === drop.leagueId);
      if (!targetLeague) return;
      if (!canEditLeague(targetLeague)) {
        toast.error("Only that league's captain or a club admin can edit positions");
        return;
      }
      // If from NA, lift the unavailability so they can play
      if (origin === "na") clearUnavailable.mutate(memberId);
      upsertLineup.mutate({
        league_id: drop.leagueId,
        position: drop.position,
        club_member_id: memberId,
      });
      return;
    }

    // Bench drop — moving across leagues = cascade
    if (drop.kind === "bench") {
      const targetLeague = sortedLeagues.find(l => l.id === drop.leagueId);
      if (!targetLeague) return;

      // From NA back to a bench
      if (origin === "na") {
        clearUnavailable.mutate(memberId);
        return;
      }

      // Same league bench drop → just remove from position (unassign)
      if (origin === targetLeague.id) {
        const cur = memberCurrentLineup.get(memberId);
        if (cur && cur.leagueId === targetLeague.id) clearLineupForMember.mutate(memberId);
        return;
      }

      // Cross-league bench drop = mark "excess" from origin → cascades into target league pool
      const originLeague = sortedLeagues.find(l => l.id === origin);
      if (originLeague && !canEditLeague(originLeague)) {
        toast.error("Only the source league's captain can push players to another league");
        return;
      }
      if (originLeague) {
        // Enforce "1 down" rule: target must be the immediately adjacent lower league
        // within the same gender group (Men's leagues cascade among Men's; Ladies among Ladies)
        const sameGroup = isMensLeague(originLeague.name) && isMensLeague(targetLeague.name)
          ? sortedLeagues.filter(l => isMensLeague(l.name))
          : isLadiesLeague(originLeague.name) && isLadiesLeague(targetLeague.name)
          ? sortedLeagues.filter(l => isLadiesLeague(l.name))
          : sortedLeagues.filter(l => !isMensLeague(l.name) && !isLadiesLeague(l.name));
        const originIdx = sameGroup.findIndex(l => l.id === originLeague.id);
        const targetIdx = sameGroup.findIndex(l => l.id === targetLeague.id);
        if (originIdx === -1 || targetIdx === -1) {
          toast.error("Players can only cascade within the same gender group");
          return;
        }
        if (targetIdx !== originIdx + 1) {
          toast.error(`Players can only be pushed to the next league down (${sameGroup[originIdx + 1]?.code || sameGroup[originIdx + 1]?.name || "—"})`);
          return;
        }

        // Clear any current lineup for the player (they're being pushed)
        clearLineupForMember.mutate(memberId);
        setStatusMut.mutate({
          league_id: originLeague.id,
          club_member_id: memberId,
          status: "excess",
        });
        toast.success(`${memberMap.get(memberId)?.name || "Player"} pushed to ${targetLeague.code || targetLeague.name}`);
      }
      return;
    }
  };

  const handleDragStart = (e: DragStartEvent) => setActiveDragId(String(e.active.id));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ---------- Early returns ----------
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

  // ---------- Layout split ----------
  const mensLeagues = sortedLeagues.filter(l => isMensLeague(l.name));
  const ladiesLeagues = sortedLeagues.filter(l => isLadiesLeague(l.name));
  const otherLeagues = sortedLeagues.filter(l => !isMensLeague(l.name) && !isLadiesLeague(l.name));
  const hasBothGenders = mensLeagues.length > 0 && ladiesLeagues.length > 0;

  // Active drag preview
  const activeDrag = activeDragId ? parseDragId(activeDragId) : null;
  const activeMemberName = activeDrag ? (memberMap.get(activeDrag.memberId)?.name || "Unknown") : null;

  const captainNameOf = (lg: LeagueRow) => {
    const captainReg = registrations.find(r => r.league_id === lg.id && r.is_captain);
    const id = captainReg?.club_member_id || lg.captain_member_id || null;
    return id ? memberMap.get(id)?.name || null : null;
  };

  const renderColumn = (lg: LeagueRow, list: LeagueRow[]) => (
    <LeagueColumn
      key={lg.id}
      league={lg}
      isCaptain={isCaptainOfLeague(lg)}
      captainName={captainNameOf(lg)}
      positions={positionsForLeague(lg)}
      benchMembers={benchForLeague(lg, list)}
      memberMap={memberMap}
      leagueNumberByMember={leagueNumberByMember}
      fixture={lg.code ? nextFixtureByCode.get(lg.code) || null : null}
      canEdit={canEditLeague(lg)}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragId(null)}
    >
      <div className="space-y-3">
        <Card className="p-3 space-y-2">
          {/* Week selector — switch between the next few candidate planning weeks */}
          {candidateWeeks.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mr-1">Plan week:</span>
              {candidateWeeks.slice(0, 3).map((wk, i) => {
                const completion = weekCompletion.get(wk);
                const isComplete = completion && completion.filled >= completion.total && completion.total > 0;
                const isActive = wk === weekStart;
                const isAuto = wk === autoWeekStart && !selectedWeekOverride;
                return (
                  <Button
                    key={wk}
                    type="button"
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    onClick={() => setSelectedWeekOverride(wk === autoWeekStart ? null : wk)}
                    className="h-7 px-2 text-[11px] gap-1"
                  >
                    {i === 0 ? "This week" : i === 1 ? "Next" : `+${i - 1} wk${i - 1 > 1 ? "s" : ""}`}
                    <span className="opacity-80">· {format(new Date(wk), "dd MMM")}</span>
                    {completion && (
                      <span className={`text-[10px] ml-0.5 ${isComplete ? "text-emerald-300" : "opacity-70"}`}>
                        ({completion.filled}/{completion.total})
                      </span>
                    )}
                    {isAuto && <span className="text-[9px] ml-0.5 opacity-70">auto</span>}
                  </Button>
                );
              })}
              {selectedWeekOverride && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedWeekOverride(null)}
                  className="h-7 px-2 text-[10px]"
                >
                  Reset to auto
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            <strong>
              Planning {chosenWeekIndex === 0 ? "next week" : chosenWeekIndex === 1 ? "the week after next" : `${chosenWeekIndex + 1} weeks ahead`}: {format(new Date(weekStart), "EEE dd MMM")} – {format(addDays(new Date(weekStart), 6), "EEE dd MMM")}
            </strong> —
            Lower leagues can start picking teams now so cascaded players land correctly. Drag players from the
            <em> Available </em> pool into <strong>positions 1–4</strong>, or onto another league's pool to push them down.
            Drag onto the red zone below to mark <strong>unavailable for the whole week</strong>.
          </p>
          <DroppableZone id={naDropId} variant="na" isEmpty={unavailable.length === 0} emptyHint="Drop a player here to mark them unavailable for the entire week (Wed → Tue)">
            <div className="flex flex-wrap gap-1 items-center">
              <Ban className="w-3.5 h-3.5 text-destructive shrink-0" />
              <span className="text-[10px] uppercase tracking-wide text-destructive font-semibold mr-1">Unavailable this week:</span>
              {unavailable.map(u => {
                const mem = memberMap.get(u.club_member_id);
                if (!mem) return null;
                return (
                  <DraggablePlayer
                    key={u.club_member_id}
                    memberId={u.club_member_id}
                    origin="na"
                    name={mem.name || "Unknown"}
                    muted
                    badge={{ label: "NA", variant: "destructive" }}
                  />
                );
              })}
            </div>
          </DroppableZone>
        </Card>

        {!hasBothGenders ? (
          <div className="space-y-3">
            {sortedLeagues.map(lg => renderColumn(lg, sortedLeagues))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground px-1">Men's Leagues</h3>
              {mensLeagues.map(lg => renderColumn(lg, mensLeagues))}
              {otherLeagues.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-muted-foreground px-1 pt-2">Other</h3>
                  {otherLeagues.map(lg => renderColumn(lg, otherLeagues))}
                </>
              )}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground px-1">Ladies' Leagues</h3>
              {ladiesLeagues.map(lg => renderColumn(lg, ladiesLeagues))}
            </div>
          </div>
        )}
      </div>

      <DragOverlay>
        {activeMemberName && (
          <div className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-medium shadow-lg">
            {activeMemberName}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
