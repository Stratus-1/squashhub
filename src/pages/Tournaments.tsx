import { allocateAllFixedStages, scheduleTimedRounds } from "@/lib/tournaments/formal-stage-schedule";
import { useMatchDayDevice, useMdNavigate } from "@/contexts/MatchDayDevice";
import { schedulePlannedPlayoffGames } from "@/lib/smart-builder/playoff-schedule";
import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { SEO } from "@/components/SEO";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Trophy, ChevronRight, Loader2, Calendar, User, BarChart3, Gavel, Settings2, Printer, BellRing, GripVertical, MoreVertical, Plus, Trash2, Eraser, PauseCircle } from "lucide-react";
import { ClipboardCheck, CalendarClock } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AddSlotDialog } from "@/components/tournaments/AddSlotDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { hydrateTournamentNames } from "@/lib/tournament-names";
import { fromExt } from "@/lib/supabase-ext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { useMemberContext } from "@/contexts/MemberContext";
import { useNavigate } from "react-router-dom";
import { format, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinalizeTournamentSetupDialog } from "@/components/tournaments/FinalizeTournamentSetupDialog";
import { SwapFixtureButton } from "@/components/tournaments/SwapFixtureButton"
import { isByeFixture } from "@/lib/tournaments/bye-side";
import { ReplacePlayerDialog } from "@/components/tournaments/ReplacePlayerDialog";
import { eliminatedMemberIds } from "@/lib/tournaments/survivors";
import { getTournamentFormat } from "@/lib/tournament-formats";
import { getGroupLabel } from "@/lib/tournament-formats/group-labels";
import { playoffHeadingText } from "@/lib/smart-builder/playoff-placeholders";
import { structuredMatchups, matchupForMatchGroup, matchupHeading, type StructuredMatchup } from "@/lib/tournaments/structured-matchups";
import { getBucketColor, buildBucketColorMap } from "@/lib/tournament-colors";
import { entityIdForEntry, type Entry as SwissEntry } from "@/lib/swiss-pairing";
import { distributeIntoPools, normalisePoolAllocation } from "@/lib/tournaments/pools";
import { useAuth } from "@/contexts/AuthContext";
import { fetchChampMarkerLock, isLockFresh, useChampMarkerLocks } from "@/hooks/use-champ-marker-lock";
import { MarkerTakeoverDialog } from "@/components/tournaments/MarkerTakeoverDialog";
import { splitTournamentsByLifecycle, todayISO, isCancelledTournament } from "@/lib/tournaments/lifecycle";
import { EnterResultDialog } from "@/components/tournaments/EnterResultDialog";
import { canEnterChampResult } from "@/lib/tournaments/quick-result";
import { ScheduleMatchDialog } from "@/components/tournaments/ScheduleMatchDialog";
import { WithdrawPlayerButton } from "@/components/tournaments/WithdrawPlayerButton";
import { JoinWhatsAppGroupButton } from "@/components/tournaments/JoinWhatsAppGroupButton";
import { canScheduleFixture, scheduleActionShortLabel } from "@/lib/tournaments/fixture-scheduling";
import { fixtureRoundRow, resolveFixtureSchedule, stageScheduleIndex, type StageScheduleInfo } from "@/lib/tournaments/stage-schedule";
import { parseRoundDeadlines, deadlineForRound, deadlineForStage, playByNudge, mergeRoundDeadlines } from "@/lib/tournaments/round-deadlines";
import { parseMilestones } from "@/lib/tournaments/round-definitions";
import { isPlayoffGame, playoffDeadline, stageModeForGame, stageSchedulingFromChamp } from "@/lib/tournaments/round-plan";
import { isTerminalMatchStatus } from "@/lib/tournaments/actionable-match";
import { chronologicalTournamentMatches, tournamentMatchDays } from "@/lib/tournaments/schedule-order";
import { knockoutCategoryNames, pacedKnockoutRound } from "@/lib/tournaments/knockout-round-display";
import { DiamondStandings } from "@/components/tournaments/DiamondStandings";

import { eliminatedSide, ELIMINATED_NAME_CLASS } from "@/lib/tournaments/elimination";

import { useHasPermission } from "@/hooks/use-club-permissions";
import { AssignCourtsTimesButton } from "@/components/tournaments/AssignCourtsTimesButton";
import { hasAssumptions, scheduleWithAssumptions } from "@/lib/tournaments/assumed-schedule";

const GENDER_LABELS: Record<string, string> = { men: "Men's", ladies: "Ladies'", mixed: "Mixed", open: "Open" };

export default function Tournaments() {
  const navigate = useMdNavigate();
  const md = useMatchDayDevice();
  const { club: contextClub } = useClubContext();
  const { data: clubData } = useMyClub();
  const { activeMember: sessionMember } = useMemberContext();
  // Secure Match Day link: no member identity and no admin rights.
  const activeMember = md ? null : sessionMember;
  const isClubAdmin = useIsClubAdmin() && !md;
  const clubId = md ? md.clubId : contextClub?.id || clubData?.club?.id;
  const memberId = activeMember?.id;
  const [finalizeChamp, setFinalizeChamp] = useState<any | null>(null);
  // Club/tournament officials and super admins may capture any result;
  // everyone else only their own matches.
  const canManageChamps = useHasPermission("champs") && !md;
  const [resultMatch, setResultMatch] = useState<any | null>(null);
  const [scheduleMatch, setScheduleMatch] = useState<any | null>(null);
  const [replaceMatch, setReplaceMatch] = useState<any | null>(null);
  const { user: sessionUser } = useAuth();
  const user = md ? md.deviceUser : sessionUser;
  const [takeover, setTakeover] = useState<
    { matchId: string; markRoute: string; label: string; markerName: string } | null
  >(null);

  /**
   * Marking a tournament game: if someone else holds a fresh marker lock we
   * offer "watch live" or "ask to take over" instead of silently bouncing
   * (or, worse, letting two devices clobber each other's score).
   */
  const openMarker = async (m: any, markRoute: string, label: string) => {
    try {
      const lock = await fetchChampMarkerLock(m.id);
      if (lock && isLockFresh(lock) && lock.user_id !== user?.id) {
        setTakeover({
          matchId: m.id,
          // Approved/forced hand-over must not be bounced by the marker's own gate.
          markRoute: markRoute + (markRoute.includes("?") ? "&" : "?") + "takeover=1",
          label,
          markerName: lock.user_name,
        });
        return;
      }
    } catch (e) {
      // Never block scoring because the lock lookup failed.
      console.warn("Marker lock check failed", e);
    }
    navigate(markRoute);
  };

  const { data: allChamps = [], isLoading: champsLoading } = useQuery({
    queryKey: ["tournaments-list", clubId, user?.id],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs")
        .select("*")
        .eq("club_id", clubId!)
        .order("start_date");
      if (error) throw error;
      const own = data || [];
      // Also include tournaments hosted by OTHER clubs that this login is
      // entered in (e.g. inter-club league get-togethers), so visiting
      // players see and can mark their games.
      if (!user?.id || md) return own;
      const { data: mine } = await supabase
        .from("club_members").select("id").eq("user_id", user.id);
      const memberIds = (mine || []).map((m: any) => m.id);
      if (!memberIds.length) return own;
      const list = memberIds.join(",");
      const { data: regs } = await (supabase as any)
        .from("club_champs_registrations").select("champ_id")
        .or(`club_member_id.in.(${list}),partner_member_id.in.(${list})`);
      const ownIds = new Set(own.map((c: any) => c.id));
      const extraIds = Array.from(new Set((regs || []).map((r: any) => r.champ_id)))
        .filter((id: any) => id && !ownIds.has(id));
      if (!extraIds.length) return own;
      const { data: extra } = await fromExt("club_champs").select("*").in("id", extraIds as string[]);
      return [...own, ...(extra || [])].sort((a: any, b: any) =>
        String(a.start_date || "").localeCompare(String(b.start_date || "")));
    },
    enabled: !!clubId,
  });

  const todayStr = todayISO();
  // Lifecycle split lives in one shared place so every member-facing surface
  // agrees on what "current" means (see src/lib/tournaments/lifecycle.ts).
  const { current: champs, past: pastChamps, needsDates: undatedChamps } =
    splitTournamentsByLifecycle(allChamps as any[], todayStr);
  // Beta matchups (e.g. Men's A vs Men's B): games are stored under the first group, so labels must name both sides.
  const muChampIdsKey = (allChamps as any[]).map((c: any) => c.id).sort().join(",");
  const { data: matchupsByChamp } = useQuery({
    queryKey: ["structured-matchups", muChampIdsKey],
    queryFn: async () => {
      const { data } = await fromExt("tournaments").select("id,builder_architecture,builder_spec").in("id", muChampIdsKey.split(","));
      const m = new Map<string, StructuredMatchup[]>();
      for (const t of (data || []) as any[]) if (t.builder_architecture === "structured") m.set(t.id, structuredMatchups(t.builder_spec));
      return m;
    },
    enabled: !!muChampIdsKey,
  });
  // Target-stage schedules (structured tournaments): stage_key → planned rule/date/time/courts.
  const { data: stageSchedByChamp } = useQuery({
    queryKey: ["structured-stage-schedules", muChampIdsKey],
    queryFn: async () => {
      const { data } = await fromExt("tournaments").select("id,builder_architecture,builder_spec").in("id", muChampIdsKey.split(","));
      const m = new Map<string, Map<string, StageScheduleInfo>>();
      for (const t of (data || []) as any[]) if (t.builder_architecture === "structured") m.set(t.id, stageScheduleIndex(t.builder_spec));
      return m;
    },
    enabled: !!muChampIdsKey,
  });
  // Step-by-step setup keeps per-round modes (Round 1 fixed days, later rounds play-by) that the
  // compressed structured spec loses: round_number → fixed range from the setup.
  const { data: fixedRoundsByChamp } = useQuery({
    queryKey: ["setup-fixed-rounds", muChampIdsKey],
    queryFn: async () => {
      const { data } = await fromExt("tournaments").select("id,beta_lifecycle").in("id", muChampIdsKey.split(","));
      const m = new Map<string, Map<number, { from: string; to: string; timeFrom: string | null; timeTo: string | null }>>();
      for (const t of (data || []) as any[]) {
        const main = ((t.beta_lifecycle?.answers?.stages ?? []) as any[]).filter((s) => (s?.phase ?? "main") === "main");
        const r = new Map<number, any>();
        main.forEach((s, i) => {
          if (s?.mode !== "scheduled" || !s?.date) return;
          const dates = [s.date, ...((s.extraDays ?? []) as any[]).map((d) => d?.date)].filter(Boolean).sort();
          r.set(i + 1, { from: dates[0], to: dates[dates.length - 1], timeFrom: s.from || null, timeTo: s.to || null });
        });
        if (r.size) m.set(t.id, r);
      }
      return m;
    },
    enabled: !!muChampIdsKey,
  });
  // Fixed-date rounds that cannot be given times/courts: say why (admins only), never silent TBD.
  const { data: timedIssues } = useQuery({
    queryKey: ["timed-round-capacity", muChampIdsKey],
    queryFn: async () => {
      const out: Array<{ champId: string; issues: string[] }> = [];
      for (const id of muChampIdsKey.split(",")) {
        const r = await scheduleTimedRounds(id, { dryRun: true }).catch(() => null);
        if (r?.issues?.length) out.push({ champId: id, issues: r.issues });
      }
      return out;
    },
    enabled: !!muChampIdsKey && (isClubAdmin || canManageChamps),
  });
  const champById = useMemo(
    () => new Map((allChamps as any[]).map((champ: any) => [champ.id, champ] as const)),
    [allChamps],
  );

  const champIds = allChamps.map((c: any) => c.id);
  const champIdsKey = champIds.slice().sort().join("|");

  const { data: diamondTournamentIds = [] } = useQuery({
    queryKey: ["diamond-tournament-ids", champIdsKey],
    queryFn: async () => {
      if (!champIds.length) return [];
      const { data, error } = await fromExt("team_league_events").select("tournament_id").in("tournament_id", champIds);
      if (error) throw error;
      return (data || []).map((row: any) => row.tournament_id).filter(Boolean) as string[];
    }, enabled: champIds.length > 0,
  });
  const diamondTournamentSet = useMemo(() => new Set(diamondTournamentIds), [diamondTournamentIds]);


  // Supabase caps a single response at 1000 rows. Busy clubs have far more
  // tournament rows than that, and the undated (TBD) fixtures sort last — so
  // an unpaged query silently hid whole rounds. Always page through.
  const fetchAllPages = async (build: () => any) => {
    const PAGE = 1000;
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build().range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = data || [];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
    return rows;
  };

  const { data: allEntries = [] } = useQuery({
    queryKey: ["tournaments-all-entries", champIds],
    queryFn: async () => {
      if (!champIds.length) return [];
      return fetchAllPages(() =>
        fromExt("club_champs_entries")
          .select("*, club_members:club_member_id(id, name, profiles:user_id(name)), partner:partner_member_id(id, name, profiles:user_id(name))")
          .in("champ_id", champIds)
          .order("id"),
      );
    },
    enabled: champIds.length > 0,
  });

  // All scheduled matches per tournament (full schedule view)
  const { data: allMatches = [] } = useQuery({
    queryKey: ["tournaments-all-matches", champIds, md?.court ?? null],
    queryFn: async () => {
      if (!champIds.length) return [];
      const rows = await fetchAllPages(() =>
        fromExt("club_champs_matches")
          .select("*, player_a:player_a_member_id(id, name, profiles:user_id(name)), player_b:player_b_member_id(id, name, profiles:user_id(name)), partner_a:partner_a_member_id(id, name, profiles:user_id(name)), partner_b:partner_b_member_id(id, name, profiles:user_id(name)), court:court_id(name)")
          .in("champ_id", champIds)
          .order("scheduled_date")
          .order("scheduled_time")
          .order("id"),
      );
      const named = await hydrateTournamentNames(rows as any[]);
      // Court-specific Match Day link: only that court's games.
      return md?.court != null ? (named as any[]).filter((m: any) => m.court_id === md.court) : named;
    },
    enabled: champIds.length > 0,
    refetchInterval: 10000,
  });

  // Rounds created later from the draw hold the live play-by dates (round 4
  // added after setup, etc.) — they beat the plan captured in the wizard.
  const { data: allRounds = [] } = useQuery({
    queryKey: ["tournaments-all-rounds", champIds],
    queryFn: async () => {
      if (!champIds.length) return [];
      const { data, error } = await fromExt("club_champs_rounds")
        .select("id, champ_id, round_number, group_number, section_number, label, play_by, stage_key")
        .in("champ_id", champIds);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: champIds.length > 0,
  });
  const roundsByChamp = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of allRounds as any[]) {
      if (!map.has(r.champ_id)) map.set(r.champ_id, []);
      map.get(r.champ_id)!.push(r);
    }
    return map;
  }, [allRounds]);

  const today = todayStr;

  // Marker presence drives the LIVE chip: a game is only "live" while someone
  // is actually scoring it (fresh heartbeat in champ_marker_locks). When the
  // marker walks away the game stays in_progress with its score intact, but is
  // shown as "Paused · Resume" so anyone may pick it up.
  const { freshMatchIds } = useChampMarkerLocks(
    (allMatches || []).filter((m: any) => m.status === "in_progress").map((m: any) => m.id),
  );
  const inPlay = (m: any) => {
    if (m.status !== "in_progress") return false;
    const champ = champById.get(m.champ_id);
    if (champ?.scoring_mode !== "time_capped_points") return true;
    const bellActive = !!m.bell_ends_at && new Date(m.bell_ends_at).getTime() > Date.now();
    const paused = typeof m.bell_paused_seconds === "number" && m.bell_paused_seconds > 0;
    return bellActive || paused;
  };
  const isLive = (m: any) => inPlay(m) && freshMatchIds.has(m.id);
  const isPaused = (m: any) => inPlay(m) && !freshMatchIds.has(m.id);

  const activeChampIds = new Set(champs.map((c: any) => c.id));
  const upcomingMatches = allMatches
    .filter((m: any) => activeChampIds.has(m.champ_id) && (m.status === "scheduled" || m.status === "in_progress" || m.status === "placeholder" || isLive(m)) && m.status !== "completed" && (!m.scheduled_date || m.scheduled_date >= today))
    .sort((a: any, b: any) => {
      // Live (actively marked) matches float to the top, paused ones just below
      const rank = (m: any) => (isLive(m) ? 0 : isPaused(m) ? 1 : 2);
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;

      const aKey = `${a.scheduled_date || "9999-12-31"} ${a.scheduled_time || "23:59:59"}`;
      const bKey = `${b.scheduled_date || "9999-12-31"} ${b.scheduled_time || "23:59:59"}`;
      const k = aKey.localeCompare(bKey);
      if (k !== 0) return k;
      // Same slot → sort by court name ascending (Court 1, 2, 3…)
      const ac = a.court?.name || "";
      const bc = b.court?.name || "";
      const c = ac.localeCompare(bc, undefined, { numeric: true, sensitivity: "base" });
      if (c !== 0) return c;
      // Undated play-off games share one key — order them by bracket position
      // (Pos 1 final first) instead of leaving them in random database order.
      // Strongest (Pos 1) listed last, matching the order it will be played.
      const bp = (b.bracket_position ?? 0) - (a.bracket_position ?? 0);
      if (bp !== 0) return bp;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });


  const getName = (p: any) => p?.name || p?.profiles?.name || "Unknown";
  const getTeam = (a: any, b: any) => (b ? `${getName(a)} & ${getName(b)}` : getName(a));
  // Placeholder-aware side label — playoff/finals slots have no player yet
  // (player_a is null) but do have a human-readable placeholder like
  // "Winner Pool A". Fall back to that before showing "Unknown".
  // A bye round leaves one side without a player (is_bye) — show "BYE", never
  // "Unknown", so odd-sized groups read cleanly.
  const sideLabel = (player: any, partner: any, placeholder: string | null | undefined, isDoubles: boolean, match?: any) => {
    if (!player && isByeFixture(match)) return "BYE";
    if (!player && placeholder) return placeholder;
    return isDoubles ? getTeam(player, partner) : getName(player);
  };


  const myUpcoming = memberId
    ? upcomingMatches.filter(
        (m: any) =>
          m.player_a_member_id === memberId ||
          m.player_b_member_id === memberId ||
          m.partner_a_member_id === memberId ||
          m.partner_b_member_id === memberId,
      )
    : [];

  // --- Pool / league filter + color coding -----------------------------------
  // A "bucket" is a unique (champ, league group, pool) combination. Each bucket
  // gets its own colour so admins can visually separate pools even across
  // different leagues in the same tournament (Pool A in League 1 ≠ Pool A in
  // League 2). The dropdown lets the user narrow the list to one bucket.
  const poolLetter = (p: number | null | undefined) =>
    p == null ? null : String.fromCharCode(64 + p);

  // Some champs never persist `pool_number` on matches. To keep the Pool A/B
  // filter working everywhere (especially for admins who aren't in the draw),
  // derive the pool for each match from the tournament's pools-per-league config
  // + entry order_index using the same block distribution the generator uses.
  const poolByMatchId = useMemo(() => {
    const out = new Map<string, number>();
    // Precompute per-champ pool maps: champId -> groupNum -> Map(entityId, pool)
    const champPoolMaps = new Map<string, Map<number, Map<string, number>>>();
    for (const champ of allChamps) {
      const cfg: Record<string, number> = ((champ as any).swiss_pools as any) || {};
      if (!Object.values(cfg).some((v) => Number(v) > 1)) continue;
      const isDoubles = (champ as any).match_type === "doubles";
      const champEntries = (allEntries as any[]).filter((e) => e.champ_id === champ.id);
      const groupMap = new Map<number, Map<string, number>>();
      const groupNums = [...new Set(champEntries.map((e) => e.group_number))] as number[];
      const mode = normalisePoolAllocation((champ as any).pool_allocation);
      const manualDivs = new Set<number>(
        (((champ as any).manual_seed_divisions as number[] | null) || []).map((d) => Number(d) + 1),
      );
      for (const gn of groupNums) {
        const pc = Math.max(1, Number(cfg[String(gn)]) || 1);
        if (pc <= 1) continue;
        // Must mirror the draw generator exactly (serpentine / banded / manual),
        // otherwise a game shows the wrong Pool letter.
        const ordered = (champEntries as any[])
          .filter((e) => e.group_number === gn)
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        const pools = distributeIntoPools(ordered, pc, { manual: manualDivs.has(Number(gn)), mode });
        const map = new Map<string, number>();
        pools.forEach((poolEntries, pi) =>
          poolEntries.forEach((e: any) => map.set(entityIdForEntry(e as SwissEntry, isDoubles), pi + 1)),
        );
        groupMap.set(gn, map);
      }
      if (groupMap.size) champPoolMaps.set(champ.id, groupMap);
    }
    for (const m of allMatches as any[]) {
      if (m.pool_number != null) { out.set(m.id, m.pool_number); continue; }
      const gm = champPoolMaps.get(m.champ_id);
      if (!gm) continue;
      const poolMap = gm.get(m.group_number);
      if (!poolMap) continue;
      const champ = champById.get(m.champ_id);
      const isDoubles = (champ as any)?.match_type === "doubles";
      const memberIds: string[] = [m.player_a_member_id, m.partner_a_member_id, m.player_b_member_id, m.partner_b_member_id].filter(Boolean);
      for (const mid of memberIds) {
        const e = (allEntries as any[]).find(
          (x) => x.champ_id === m.champ_id && x.group_number === m.group_number && (x.club_member_id === mid || x.partner_member_id === mid),
        );
        if (!e) continue;
        const p = poolMap.get(entityIdForEntry(e as SwissEntry, isDoubles));
        if (p) { out.set(m.id, p); break; }
      }
    }
    return out;
  }, [allChamps, allEntries, allMatches, champById]);

  // `section_number` is what the draw engine persists for pool/section branches
  // (knockout rows), so it is authoritative whenever `pool_number` is absent.
  // Only fall back to the derived map when neither column is set.
  const poolOf = (m: any): number | null =>
    m.pool_number ?? m.section_number ?? poolByMatchId.get(m.id) ?? null;
  const isPlayoff = (m: any) => typeof m?.stage === "string" && m.stage.startsWith("playoff");

  // Which champ+league still has unplayed pool games? Seeds in those play-off
  // fixtures can still change, so they are shown as "(Provisional)".
  const openPoolLeagues = useMemo(() => {
    const set = new Set<string>();
    for (const m of allMatches as any[]) {
      if (isPlayoff(m)) continue;
      if (m.status === "completed" || m.status === "placeholder") continue;
      set.add(`${m.champ_id}|${m.group_number ?? "-"}`);
      set.add(`${m.champ_id}|*`);
    }
    return set;
  }, [allMatches]);

  // Collapse all playoff stages into a single "Play-offs" bucket per tournament
  // so admins can filter with one click instead of scrolling through every
  // individual final/semifinal/etc.
  // Diamond League (team) games: bucket per tie ("Week 1 · Division A · Team 1 v Team 4"),
  // never by the player-league group/pool columns, which don't apply.
  const diamondTieLabel = (m: any): string | null =>
    typeof m?.stage_key === "string" && m.stage_key.startsWith("dl:")
      ? String(m.stage_label || "Diamond League").split(" · ").slice(0, -1).join(" · ") || "Diamond League"
      : null;
  const bucketKeyOf = (m: any) =>
    diamondTieLabel(m) ? `${m.champ_id}|dl|${diamondTieLabel(m)}` : isPlayoff(m)
      ? `${m.champ_id}|playoff|all`
      : `${m.champ_id}|${m.group_number ?? "-"}|${poolOf(m) ?? "-"}`;

  const buckets = useMemo(() => {
    const seen = new Map<string, { key: string; champId: string; group: number | null; pool: number | null; stage: string | null; stageLabel: string | null; count: number }>();
    for (const m of upcomingMatches) {
      const key = bucketKeyOf(m);
      const existing = seen.get(key);
      if (existing) { existing.count++; continue; }
      const dl = diamondTieLabel(m);
      if (dl) {
        seen.set(key, { key, champId: m.champ_id, group: null, pool: null, stage: "diamond", stageLabel: dl, count: 1 });
        continue;
      }
      seen.set(key, {
        key,
        champId: m.champ_id,
        group: isPlayoff(m) ? null : (m.group_number ?? null),
        pool: isPlayoff(m) ? null : poolOf(m),
        stage: isPlayoff(m) ? "playoff" : null,
        stageLabel: isPlayoff(m) ? "Play-offs" : null,
        count: 1,
      });
    }
    // Sort by champ name, then group-stage before playoffs, then group, then pool
    return [...seen.values()].sort((a, b) => {
      const ca = champById.get(a.champId)?.name || "";
      const cb = champById.get(b.champId)?.name || "";
      if (ca !== cb) return ca.localeCompare(cb);
      if (!!a.stage !== !!b.stage) return a.stage ? 1 : -1;
      const ga = a.group ?? 999; const gb = b.group ?? 999;
      if (ga !== gb) return ga - gb;
      return (a.pool ?? 999) - (b.pool ?? 999);
    });
  }, [upcomingMatches, champById, poolByMatchId]);

  // Give every league/pool bucket its own distinct colour (sorted order), so
  // Pool A and Pool B of the same league never look alike.
  const bucketColorMap = useMemo(
    () => buildBucketColorMap(buckets.map((b) => b.key)),
    [buckets]
  );
  const bucketColor = (key: string) => bucketColorMap.get(key) ?? getBucketColor(key);

  const bucketLabel = (b: { champId: string; group: number | null; pool: number | null; stage?: string | null; stageLabel?: string | null }, opts: { withChamp?: boolean } = {}) => {
    const champ = champById.get(b.champId);
    const parts: string[] = [];
    if (opts.withChamp && champ) parts.push(champ.name);
    if (b.stage) {
      parts.push(b.stageLabel || "Play-offs");
      return parts.join(" · ");
    }
    const mu = matchupForMatchGroup(matchupsByChamp?.get(b.champId) ?? [], b.group);
    if (mu) parts.push(matchupHeading(mu, (g) => getGroupLabel(champ, g)));
    else if (b.group != null) parts.push(getGroupLabel(champ, b.group));
    const pl = poolLetter(b.pool);
    if (pl) parts.push(`Pool ${pl}`);
    return parts.join(" · ") || "Unassigned";
  };

  // Members always land on what is running/coming up; history is one tap away.
  const [champTab, setChampTab] = useState<string>("upcoming");
  const [showAllPast, setShowAllPast] = useState(false);
  const [poolFilter, setPoolFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  // ?champ=<id> deep-links straight to one tournament's games (e.g. after Generate draw & fixtures).
  const [champFilter, setChampFilter] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return new URLSearchParams(window.location.search).get("champ") ?? "all";
  });
  const gamesCardRef = useRef<HTMLDivElement | null>(null);
  // "round" (default) | "slot" | "flat"
  const [groupMode, setGroupMode] = useState<"round" | "slot" | "flat">(() => {
    if (typeof window === "undefined") return "round";
    const saved = window.localStorage.getItem("tournaments.groupMode");
    if (saved === "round" || saved === "slot" || saved === "flat") return saved;
    // Migrate the old boolean toggle.
    return window.localStorage.getItem("tournaments.groupBySlot") === "1" ? "slot" : "round";
  });
  useEffect(() => {
    try { window.localStorage.setItem("tournaments.groupMode", groupMode); } catch {}
  }, [groupMode]);



  const availableDates = useMemo(() => {
    const set = new Set<string>();
    for (const m of upcomingMatches) if (m.scheduled_date) set.add(m.scheduled_date);
    return [...set].sort();
  }, [upcomingMatches]);

  const applyFilters = (list: any[]) =>
    list.filter(
      (m) =>
        (champFilter === "all" || m.champ_id === champFilter) &&
        (poolFilter === "all" || bucketKeyOf(m) === poolFilter) &&
        (dateFilter === "all" || m.scheduled_date === dateFilter),
    );
  const filteredUpcoming = applyFilters(upcomingMatches);
  const filteredMine = applyFilters(myUpcoming);
  const scheduleChamp = scheduleMatch ? champById.get(scheduleMatch.champ_id) ?? null : null;
  const resultChamp = resultMatch ? champById.get(resultMatch.champ_id) ?? null : null;


  const hcLabel = (h: any) => {
    const n = Number(h) || 0;
    return n !== 0 ? ` (${n > 0 ? "+" : ""}${n})` : "";
  };

  const qc = useQueryClient();
  useEffect(() => {
    if (!champIdsKey) return;
    const watchedChampIds = new Set(champIdsKey.split("|").filter(Boolean));
    const channel = supabase
      .channel(`tournament-live-matches:${champIdsKey.slice(0, 60)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "club_champs_matches" },
        (payload: any) => {
          const champId = payload?.new?.champ_id || payload?.old?.champ_id;
          if (!champId || watchedChampIds.has(champId)) {
            qc.invalidateQueries({ queryKey: ["tournaments-all-matches"] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [champIdsKey, qc]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  /** Fixture whose drag handle is currently held — only that row may be dragged. */
  const [dragArmedId, setDragArmedId] = useState<string | null>(null);
  const [addSlotOpen, setAddSlotOpen] = useState(false);
  const [addSlotChampId, setAddSlotChampId] = useState<string | undefined>(undefined);

  const deleteSlot = async (m: any) => {
    const isPh = m.status === "placeholder";
    const msg = isPh
      ? "Delete this empty slot? The court will be freed."
      : "Delete this time slot? The pair will be kept and moved back to the unscheduled list so you can re-slot them.";
    if (!window.confirm(msg)) return;
    if (isPh) {
      const { error } = await (supabase as any).from("club_champs_matches").delete().eq("id", m.id);
      if (error) return toast.error(error.message || "Delete failed");
      toast.success("Empty slot removed");
    } else {
      // Preserve the pair — just clear the schedule so the match returns to
      // the unscheduled pool and can be placed into another slot later.
      const { error } = await (supabase as any).from("club_champs_matches")
        .update({ scheduled_date: null, scheduled_time: null, court_id: null })
        .eq("id", m.id);
      if (error) return toast.error(error.message || "Update failed");
      toast.success("Slot freed — pair moved back to unscheduled");
    }
    qc.invalidateQueries({ queryKey: ["tournaments-all-matches", champIds] });
  };

  const markSlotEmpty = async (m: any) => {
    if (m.status === "placeholder") return;
    if (!window.confirm(
      "Turn this into an empty cell? The pair will be kept and moved back to the unscheduled list so you can re-slot them into another time.",
    )) return;
    // Two-step swap-style change so the pair keeps their match record
    // (unscheduled) and a fresh placeholder takes over this exact slot.
    const { error: e1 } = await (supabase as any).from("club_champs_matches")
      .update({ scheduled_date: null, scheduled_time: null, court_id: null })
      .eq("id", m.id);
    if (e1) return toast.error(e1.message || "Update failed");
    const { error: e2 } = await (supabase as any).from("club_champs_matches").insert({
      champ_id: m.champ_id,
      group_number: m.group_number,
      round_number: 99,
      scheduled_date: m.scheduled_date,
      scheduled_time: m.scheduled_time,
      court_id: m.court_id,
      status: "placeholder",
      placeholder_a: "Empty slot",
      placeholder_b: "Drag a match here",
    });
    if (e2) {
      // Roll back so we don't strand the pair
      await (supabase as any).from("club_champs_matches")
        .update({ scheduled_date: m.scheduled_date, scheduled_time: m.scheduled_time, court_id: m.court_id })
        .eq("id", m.id);
      return toast.error(e2.message || "Could not create empty slot");
    }
    toast.success("Slot emptied — pair moved back to unscheduled");
    qc.invalidateQueries({ queryKey: ["tournaments-all-matches", champIds] });
  };


  const playersOf = (m: any): string[] =>
    [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id].filter(Boolean) as string[];
  const toMinutes = (t?: string | null) => {
    if (!t) return null;
    const [h, mn] = String(t).slice(0, 5).split(":").map(Number);
    return h * 60 + mn;
  };
  const readSwapFlag = (k: string) => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(k) === "1";
  };
  const canSwap = (a: any, b: any): { ok: boolean; reason?: string; warn?: string } => {
    if (!a || !b || a.id === b.id) return { ok: false, reason: "same match" };
    if (a.status === "completed" || b.status === "completed") return { ok: false, reason: "completed match" };
    if (!a.scheduled_date || !a.scheduled_time || !b.scheduled_date || !b.scheduled_time) return { ok: false, reason: "unscheduled" };
    if (a.champ_id !== b.champ_id) return { ok: false, reason: "different tournament" };
    const showAllCourts = readSwapFlag("sh.swap.showAllCourts");
    if (!showAllCourts && a.court_id !== b.court_id) return { ok: false, reason: "different court" };
    const allowConflict = readSwapFlag("sh.swap.allowConflict");
    const allowB2B = readSwapFlag("sh.swap.allowB2B");
    // Player conflict — same slot
    const aPlayers = new Set(playersOf(a));
    const bPlayers = new Set(playersOf(b));
    if (!allowConflict) {
      for (const m of allMatches as any[]) {
        if (m.id === a.id || m.id === b.id) continue;
        if (!m.scheduled_date || !m.scheduled_time) continue;
        if (m.scheduled_date === b.scheduled_date && String(m.scheduled_time).slice(0,5) === String(b.scheduled_time).slice(0,5)) {
          for (const pid of aPlayers) if (playersOf(m).includes(pid)) return { ok: false, reason: "player clash at target slot" };
        }
        if (m.scheduled_date === a.scheduled_date && String(m.scheduled_time).slice(0,5) === String(a.scheduled_time).slice(0,5)) {
          for (const pid of bPlayers) if (playersOf(m).includes(pid)) return { ok: false, reason: "player clash at target slot" };
        }
      }
    }
    // Back-to-back warning (≤20 min gap on same date for same player)
    if (!allowB2B) {
      const near = (d1: string, t1: string, d2: string, t2: string) => {
        if (d1 !== d2) return false;
        const m1 = toMinutes(t1); const m2 = toMinutes(t2);
        if (m1 == null || m2 == null) return false;
        const gap = Math.abs(m1 - m2);
        return gap > 0 && gap <= 20;
      };
      for (const m of allMatches as any[]) {
        if (m.id === a.id || m.id === b.id) continue;
        if (!m.scheduled_date || !m.scheduled_time) continue;
        for (const pid of aPlayers) {
          if (playersOf(m).includes(pid) && near(b.scheduled_date, b.scheduled_time, m.scheduled_date, m.scheduled_time)) {
            return { ok: true, warn: "back-to-back for a player" };
          }
        }
        for (const pid of bPlayers) {
          if (playersOf(m).includes(pid) && near(a.scheduled_date, a.scheduled_time, m.scheduled_date, m.scheduled_time)) {
            return { ok: true, warn: "back-to-back for a player" };
          }
        }
      }
    }
    return { ok: true };
  };

  const doSwap = async (a: any, b: any) => {
    setSwapping(true);
    try {
      const { error: e1 } = await (supabase as any).from("club_champs_matches")
        .update({ scheduled_date: b.scheduled_date, scheduled_time: b.scheduled_time, court_id: b.court_id })
        .eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await (supabase as any).from("club_champs_matches")
        .update({ scheduled_date: a.scheduled_date, scheduled_time: a.scheduled_time, court_id: a.court_id })
        .eq("id", b.id);
      if (e2) {
        await (supabase as any).from("club_champs_matches")
          .update({ scheduled_date: a.scheduled_date, scheduled_time: a.scheduled_time, court_id: a.court_id })
          .eq("id", a.id);
        throw e2;
      }
      toast.success("Fixtures swapped");
      qc.invalidateQueries({ queryKey: ["tournaments-all-matches", champIds] });
    } catch (err: any) {
      toast.error(err?.message || "Swap failed");
    } finally {
      setSwapping(false);
      setDragId(null);
      setHoverId(null);
    }
  };

  // Distinct color tint per court (helps visually match court columns while dragging)
  const COURT_TINTS: { badge: string; ring: string }[] = [
    { badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40", ring: "ring-sky-400/60" },
    { badge: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/40", ring: "ring-fuchsia-400/60" },
    { badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40", ring: "ring-emerald-400/60" },
    { badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40", ring: "ring-orange-400/60" },
    { badge: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40", ring: "ring-violet-400/60" },
    { badge: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/40", ring: "ring-teal-400/60" },
  ];
  const courtTint = (name?: string | null) => {
    if (!name) return null;
    const digits = name.match(/\d+/)?.[0];
    const idx = digits ? (parseInt(digits, 10) - 1) % COURT_TINTS.length : Math.abs(name.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % COURT_TINTS.length;
    return COURT_TINTS[idx];
  };

  // Round name + play-by date for a given match, taken from the round plan
  // merged with the rounds actually created from the draw.
  const roundPlan = (champId: string) => {
    const champ = champs.find((c: any) => c.id === champId);
    return mergeRoundDeadlines(
      parseRoundDeadlines((champ as any)?.round_play_by),
      roundsByChamp.get(champId) || [],
    );
  };

  const roundMeta = (champId: string, roundNumber?: number | null) => {
    const list = roundPlan(champId);
    const n = Number(roundNumber);
    const entry = Number.isFinite(n) && n >= 1 ? list[n - 1] : undefined;
    return {
      label: (entry?.label || "").trim() || (Number.isFinite(n) ? `Round ${n}` : ""),
      date: deadlineForRound(list, roundNumber),
      notes: entry?.notes || "",
    };
  };

  /**
   * The round row that belongs to ONE fixture: its own league + section first,
   * then the league, then the tournament. Sections of the same round number can
   * be at completely different stages (a pool round-5 game and a semi-final),
   * so a fixture must never read another section's row.
   */
  const matchRoundRow = (m: any): any | undefined => fixtureRoundRow(m, roundsByChamp.get(m.champ_id) || []);

  const isGenericRoundLabel = (s: string) => !s || /^round\s*\d+$/i.test(s.trim());

  /** Semi-final / Quarter-final / Round 5 — the stage THIS fixture belongs to. */
  /**
   * A section's last game is not the league's final while another section is
   * still running — the two section winners must still meet. Older rows were
   * stored as "Section B · Final", so they are read back as a semi-final.
   */
  const demoteSectionFinal = (label: string): string => {
    const [section, stage] = label.split("·").map((s) => s.trim());
    if (!stage || /league final/i.test(section)) return label;
    return /^finals?$/i.test(stage) ? `${section} · Semi-final` : label;
  };

  const matchStageLabel = (m: any): string => {
    const own = demoteSectionFinal(String(m?.stage_label || "").trim());
    if (!isGenericRoundLabel(own)) return own;
    const row = String(matchRoundRow(m)?.label || "").trim();
    if (!isGenericRoundLabel(row)) return row;
    const planned = roundMeta(m.champ_id, m.round_number).label;
    return planned || `Round ${Number(m.round_number) || 1}`;
  };

  /**
   * The play-by date for ONE fixture. The fixture's OWN date wins: that is what
   * the organiser set when the round was drawn, and it is the date players were
   * told. Only when a fixture carries none do we fall back to its section's
   * round row, then to the planned date for that STAGE (round numbers drift
   * between leagues, so position in the plan means nothing), and finally to the
   * positional plan entry.
   */
  const matchStage = (m: any): StageScheduleInfo | null => {
    const st = (m?.stage_key && stageSchedByChamp?.get(m.champ_id)?.get(m.stage_key)) || null;
    // A main-phase round set to fixed days in setup is centrally scheduled, even if the spec says play-by.
    const fixed = (!st || st.order === 0) ? fixedRoundsByChamp?.get(m.champ_id)?.get(Number(m.round_number)) : undefined;
    if (fixed) return { stageId: st?.stageId ?? String(m.stage_key ?? ""), name: st?.name ?? "", order: 0, rule: "fixed", date: fixed.from, deadline: null, timeFrom: fixed.timeFrom, timeTo: fixed.timeTo, courtIds: [] };
    return st;
  };
  const matchSchedule = (m: any) => {
    const champ = champs.find((c: any) => c.id === m.champ_id);
    const milestones = parseMilestones((champ as any)?.milestone_play_by);
    return resolveFixtureSchedule(m, {
      stage: matchStage(m),
      organiserScheduled: !m.stage_key && !m.booking_id && !!m.scheduled_date && !!m.scheduled_time &&
        stageModeForGame(m, stageSchedulingFromChamp(champ as any), (champ as any)?.scheduling_mode) === "club",
      rows: roundsByChamp.get(m.champ_id) || [],
      fallback: () => {
        // Legacy (non-structured) tournaments only — structured stages never reach here.
        if (m?.stage_key) return null;
        if (isPlayoffGame(m)) return playoffDeadline(milestones, m.stage_label, m.stage);
        return deadlineForStage(roundPlan(m.champ_id), m.round_number, matchStageLabel(m), milestones) ??
          roundMeta(m.champ_id, m.round_number).date;
      },
    });
  };
  const matchPlayBy = (m: any): string | null => matchSchedule(m).playBy;
  const isMatchCentrallyScheduled = (m: any) => matchSchedule(m).mode === "scheduled";

  /**
   * "By round" container key. Round-robin/pool games group by their ACTUAL round
   * (round_number → round row / planned label), never by stage_label — structured
   * cross-league games carry seed slots there ("A1 v B1"), which are matchup info,
   * not rounds. Play-off/knockout games keep their stage name.
   */
  const roundGroupKey = (m: any): string => {
    const koRound = pacedKnockoutRound(m);
    if (koRound != null) return `\u0001ko:${koRound}`;
    const st = String(m?.stage || "");
    if (isPlayoffGame(m) || (st && st !== "group" && st !== "pool")) return matchStageLabel(m);
    const row = String(matchRoundRow(m)?.label || "").trim();
    if (row && !/^[A-Z]\d+\s+v(s)?\.?\s+[A-Z]\d+$/i.test(row)) return row;
    return roundMeta(m.champ_id, m.round_number).label || `Round ${Number(m.round_number) || 1}`;
  };

  const renderRoundGroups = (list: any[]) => {
    // Grouped by STAGE, not by round number: a league that reached its
    // semi-final in round 5 must not sit under another league's "Round 5".
    const groups = new Map<string, any[]>();
    const order = new Map<string, number>();
    list.forEach((m) => {
      // A bye is not a game to play — it never appears in the games list.
      if (isByeFixture(m)) return;
      const n = Number(m.round_number);
      const num = Number.isFinite(n) && n >= 1 && n < 99 ? n : 0;
      const key = num === 0 ? "\u0000pool" : roundGroupKey(m);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
      const prev = order.get(key);
      if (prev === undefined || num < prev) order.set(key, num);
    });
    // Play-off stages always lead, in draw order: Quarter-final, Semi-final,
    // Final — then numbered rounds, then pool games last.
    const stageRank = (key: string): number => {
      const k = key.trim().toLowerCase();
      if (k === "quarter-final" || k === "quarterfinal") return 0;
      if (k === "semi-final" || k === "semifinal") return 1;
      if (k === "final") return 2;
      return 3;
    };
    // Date order first: a group's date is the earliest fixture date (or
    // play-by deadline) among its games, so Semifinals (25 Oct) list before
    // the Final (28 Oct). Undated groups fall back to stage/round order.
    const groupDate = (key: string): string | null => {
      const dates = (groups.get(key) || [])
        .map((m: any) => {
          const s = matchSchedule(m);
          return m.date || (s.mode === "scheduled" ? s.date : null) || s.playBy || null;
        })
        .filter(Boolean)
        .sort() as string[];
      return dates[0] || null;
    };
    const keys = Array.from(groups.keys()).sort((a, b) => {
      if (a === "\u0000pool") return 1;
      if (b === "\u0000pool") return -1;
      const da = groupDate(a);
      const db = groupDate(b);
      if (da && db && da !== db) return da.localeCompare(db);
      if (da && !db) return -1;
      if (!da && db) return 1;
      return (
        stageRank(a) - stageRank(b) ||
        (order.get(a) ?? 0) - (order.get(b) ?? 0) ||
        a.localeCompare(b)
      );
    });

    return (
      <div className="space-y-2">
        {keys.map((key) => {
          const items = groups.get(key)!;
          const isPool = key === "\u0000pool";
          // Progress is measured against every game at this stage, not just
          // the filtered view — and only for the tournaments shown here.
          const champsHere = new Set(items.map((m: any) => m.champ_id));
          const all = (allMatches as any[]).filter((m: any) => {
            if (m.status === "placeholder" || isByeFixture(m) || !champsHere.has(m.champ_id)) return false;
            const r = Number(m.round_number);
            const num = Number.isFinite(r) && r >= 1 && r < 99 ? r : 0;
            return isPool ? num === 0 : num !== 0 && roundGroupKey(m) === key;
          });
          const done = all.filter((m: any) => isTerminalMatchStatus(m.status)).length;
          const outstanding = all.length - done;
          const koRound = key.startsWith("\u0001ko:") ? Number(key.slice(4)) : null;
          const koItems = koRound == null ? [] : items;
          const koCategories = knockoutCategoryNames(koItems, (m: any) => getGroupLabel(champById.get(m.champ_id), m.group_number));
          const heading = isPool ? "Pool games" : koRound != null ? `Knockout Round ${koRound}` : key;
          const koCategoryGroups = new Map<string, any[]>();
          koItems.forEach((m: any) => {
            const categoryKey = `${m.champ_id}:${m.group_number ?? "-"}`;
            if (!koCategoryGroups.has(categoryKey)) koCategoryGroups.set(categoryKey, []);
            koCategoryGroups.get(categoryKey)?.push(m);
          });
          const dates = Array.from(
            new Set(items.map((m: any) => matchPlayBy(m)).filter(Boolean)),
          ).sort() as string[];
          const playBy = dates[0] || null;
          // Centrally scheduled stage: show the target stage's own date (no booking prompt).
          const schedDates = Array.from(new Set(items.map((m: any) => {
            const r = matchSchedule(m);
            return r.mode === "scheduled" ? r.date : null;
          }).filter(Boolean))).sort() as string[];
          const allScheduled = !isPool && items.length > 0 && items.every((m: any) => matchSchedule(m).mode === "scheduled");
          const notes = Array.from(
            new Set(items.map((m: any) => roundMeta(m.champ_id, m.round_number).notes).filter(Boolean)),
          );
          return (
            <details key={key} open className="rounded-lg border border-border bg-card/60 overflow-hidden group">
              <summary className="cursor-pointer select-none flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 bg-muted/40 hover:bg-muted/60 text-xs font-semibold">
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                 <span className="uppercase tracking-wider">{heading}</span>
                 {koRound != null && <span className="font-medium min-w-0 break-words">{koCategories.length > 3 ? `${koCategories.length} categories` : koCategories.join(", ")}</span>}
                 {!isPool && playBy ? <span className="uppercase tracking-wider">· Play by {format(new Date(`${playBy}T00:00:00`), "dd MMM yyyy")}</span> : allScheduled && schedDates[0] ? (() => {
                   const times = Array.from(new Set(items.map((m: any) => m.scheduled_time ? String(m.scheduled_time).slice(0, 5) : null))).filter(Boolean) as string[];
                   const first = schedDates[0];
                   const last = schedDates[schedDates.length - 1];
                   const bell = times.length === 1 && items.every((m: any) => m.scheduled_time) ? ` · ${times[0]}` : "";
                   // Multi-day rounds read as a range (13–15 Oct), single days keep the weekday.
                   const when = schedDates.length > 1
                     ? `${format(new Date(`${first}T00:00:00`), "d")}–${format(new Date(`${last}T00:00:00`), "d MMM yyyy")}`
                     : format(new Date(`${first}T00:00:00`), "EEE dd MMM");
                   return <span className="uppercase tracking-wider">· {when}{bell}</span>;
                 })() : null}
                <span className="text-muted-foreground font-normal">
                  {all.length > 0 && outstanding > 0
                    ? `${outstanding} game${outstanding === 1 ? "" : "s"} left of ${all.length}`
                    : `${items.length} game${items.length === 1 ? "" : "s"}`}
                </span>
                {!isPool && outstanding > 0 && done > 0 && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/60 text-amber-700 dark:text-amber-300">
                    still outstanding
                  </Badge>
                )}
                {allScheduled && !playBy && (() => {
                  const unallocated = items.filter((m: any) => !m.court_id || !m.scheduled_time);
                  const champIdsHere = Array.from(new Set(unallocated.map((m: any) => m.champ_id))) as string[];
                  return (
                    <span className="ml-auto flex items-center gap-2 font-normal text-[11px] text-muted-foreground">
                      {unallocated.length === 0
                        ? "Scheduled by the organiser — no court booking needed"
                        : `Scheduled by the organiser — court & time still to be assigned (${unallocated.length})`}
                      {unallocated.length > 0 && (canManageChamps || isClubAdmin) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          onClick={async (e) => {
                            e.preventDefault(); e.stopPropagation();
                            try {
                              let booked = 0; const notes: string[] = [];
                              for (const id of champIdsHere) {
                                // Weekend setups with Courts & Dates scheduling assumptions use that planner.
                                if (await hasAssumptions(id)) {
                                  const w = await scheduleWithAssumptions(id);
                                  if (w.missing.length) { toast.error(`Courts & Dates is missing: ${w.missing.join(" ")}`, { action: { label: "Open Courts & Dates", onClick: () => navigate(`/club-admin?tab=champs&setup=${id}&step=Courts`) } }); continue; }
                                  booked += w.scheduled; notes.push(...w.issues);
                                  if (w.relaxed.length) notes.push(`${w.relaxed.length} game(s) needed less than the minimum rest.`);
                                  continue;
                                }
                                const r = await schedulePlannedPlayoffGames(id);
                                booked += r.booked; notes.push(...r.unplaced.map((u) => `${u.stage}: ${u.reason}`));
                                for (const a of await allocateAllFixedStages(id)) { booked += a.scheduled; notes.push(...(a.issues ?? [])); }
                              }
                              if (booked) toast.success(`Assigned ${booked} game${booked === 1 ? "" : "s"} to courts`);
                              if (notes.length) toast.warning(notes.join("\n"));
                              qc.invalidateQueries({ queryKey: ["tournaments-all-matches"] });
                              qc.invalidateQueries({ queryKey: ["timed-round-capacity"] });
                            } catch (err: any) { toast.error(err.message); }
                          }}
                        >
                          Assign courts &amp; times
                        </Button>
                      )}
                    </span>
                  );
                })()}
                {playBy && (
                  <span className="ml-auto font-normal text-[11px] text-amber-700 dark:text-amber-300">
                    Please book your court and play by {format(new Date(`${playBy}T00:00:00`), "EEE dd MMM")}
                  </span>
                )}
              </summary>
               {koCategories.length > 3 && <details className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
                 <summary className="cursor-pointer font-medium">Show categories</summary>
                 <span className="block py-1 break-words">{koCategories.join(", ")}</span>
               </details>}
              {notes.length > 0 && (
                <p className="px-3 pt-2 text-[11px] text-muted-foreground">{notes.join(" · ")}</p>
              )}
               <div className="p-2 space-y-1.5">{koRound == null ? items.map((m, i) => renderMatchRow(m, i, items)) : Array.from(koCategoryGroups.entries()).map(([categoryKey, categoryItems]) => (
                 <div key={categoryKey} className="space-y-1.5">
                   <div className="border-b border-border px-1 py-1 text-xs font-semibold text-foreground">
                     {getGroupLabel(champById.get(categoryItems[0].champ_id), categoryItems[0].group_number)} · Knockout Round {koRound}
                   </div>
                   {categoryItems.map((m, i) => renderMatchRow(m, i, categoryItems))}
                 </div>
               ))}</div>
            </details>
          );
        })}

      </div>
    );
  };

  /**
   * Rounds only exist for the player when the ADMIN created them: rounds with
   * play-by dates or real labels set up in the tournament, or self-scheduled
   * events where players book their own courts. A pre-planned event whose
   * games already carry times is one continuous programme — generated round
   * numbers are internal scheduling detail and must never split or reorder it.
   */
  const hasAdminRounds = (list: any[]) =>
    list.some((m: any) => {
      const champ = champById.get(m.champ_id) as any;
      if (String(champ?.scheduling_mode || "") === "self") return true;
      return (roundsByChamp.get(m.champ_id) || []).some(
        (r: any) => r.play_by || !isGenericRoundLabel(String(r.label || "")),
      );
    });

  /**
   * A tournament is shown as one flat chronological programme when it is a
   * Bells (timed) event, or when its games already carry times and the admin
   * never created real rounds. This is decided PER tournament — a timed event
   * running alongside a multi-round club championship must never flatten the
   * other tournament's round view.
   */
  const champIsChronological = (champId: string, list: any[]) => {
    const champ = champById.get(champId) as any;
    if (diamondTournamentSet.has(champId)) return true;
    if (champ?.scoring_mode === "time_capped_points") return true;
    const own = list.filter((m: any) => m.champ_id === champId);
    return own.some((m: any) => m.scheduled_time) && !hasAdminRounds(own);
  };

  /** True only when every tournament in the list is a flat chronological one. */
  const listIsChronological = (list: any[]) => {
    if (!list.length) return false;
    const ids = Array.from(new Set(list.map((m: any) => m.champ_id)));
    return ids.every((id) => champIsChronological(id as string, list));
  };

  const renderMatchList = (list: any[]) => {
    // Diamond's generated week numbers span different division nights;
    // only the actual match date can group its public programme.
    if (list.length > 0 && list.every((m: any) => diamondTournamentSet.has(m.champ_id))) {
      return (
        <div className="space-y-2">
          {tournamentMatchDays(list).map(([date, items]) => (
            <details key={date} open className="rounded-lg border border-border bg-card/60 overflow-hidden group">
              <summary className="cursor-pointer select-none flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 text-xs font-semibold">
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                <span>{date === "TBD" ? "Unscheduled" : format(new Date(`${date}T00:00:00`), "EEEE, d MMMM")}</span>
                <span className="text-muted-foreground font-normal">({items.length} {items.length === 1 ? "game" : "games"})</span>
              </summary>
              <div className="p-2 space-y-1.5">{items.map((m, i) => renderMatchRow(m, i, items))}</div>
            </details>
          ))}
        </div>
      );
    }
    if (listIsChronological(list)) {
      const schedule = chronologicalTournamentMatches(list);
      // Bells/timed events keep programme order inside a round, but the
      // organiser asked for the generated rounds to show as headings
      // (Round 1, Round 2, …) so players can see which round they are in.
      // Games with no real round number (empty slots) collect at the end.
      const roundOf = (m: any) => {
        const n = Number(m.round_number);
        return Number.isFinite(n) && n >= 1 && n < 99 ? n : 0;
      };
      if (schedule.some((m: any) => roundOf(m) > 0)) {
        const groups = new Map<number, any[]>();
        schedule.forEach((m: any) => {
          if (isByeFixture(m)) return; // a bye is not a game to play
          const n = roundOf(m);
          if (!groups.has(n)) groups.set(n, []);
          groups.get(n)!.push(m);
        });
        const champIdsHere = new Set(schedule.map((m: any) => m.champ_id));
        const keys = Array.from(groups.keys()).sort((a, b) => a - b);
        return (
          <div className="space-y-2">
            {keys.map((n) => {
              const items = groups.get(n)!;
              const isUnslotted = n === 0;
              const all = (allMatches as any[]).filter(
                (m: any) =>
                  m.status !== "placeholder" &&
                  !isByeFixture(m) &&
                  champIdsHere.has(m.champ_id) &&
                  (isUnslotted ? roundOf(m) === 0 : roundOf(m) === n),
              );
              const done = all.filter((m: any) => isTerminalMatchStatus(m.status)).length;
              const outstanding = all.length - done;
              const heading = isUnslotted ? "Unscheduled" : `Round ${n}`;
              // Rounds without an organiser play-by plan (e.g. Bells) get the
              // date span of the games inside the round so the heading still
              // tells players when it runs.
              const roundDates = all
                .map((m: any) => m.scheduled_date)
                .filter(Boolean)
                .sort();
              const firstD = roundDates[0];
              const lastD = roundDates[roundDates.length - 1];
              const dateSpan =
                firstD && lastD
                  ? firstD === lastD
                    ? format(new Date(`${firstD}T00:00:00`), "EEE dd MMM")
                    : `${format(new Date(`${firstD}T00:00:00`), "dd MMM")} – ${format(new Date(`${lastD}T00:00:00`), "dd MMM")}`
                  : null;
              return (
                <details key={n} open className="rounded-lg border border-border bg-card/60 overflow-hidden group">
                  <summary className="cursor-pointer select-none flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 bg-muted/40 hover:bg-muted/60 text-xs font-semibold">
                    <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                    <span className="uppercase tracking-wider">{heading}</span>
                    {dateSpan && (
                      <span className="text-foreground/80 font-normal">{dateSpan}</span>
                    )}
                    <span className="text-muted-foreground font-normal">
                      {all.length > 0 && outstanding > 0
                        ? `${outstanding} game${outstanding === 1 ? "" : "s"} left of ${all.length}`
                        : `${items.length} game${items.length === 1 ? "" : "s"}`}
                    </span>
                    {!isUnslotted && outstanding > 0 && done > 0 && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/60 text-amber-700 dark:text-amber-300">
                        still outstanding
                      </Badge>
                    )}
                  </summary>
                  <div className="p-2 space-y-1.5">{items.map((m, i) => renderMatchRow(m, i, items))}</div>
                </details>
              );
            })}
          </div>
        );
      }
      return <div className="space-y-1.5">{schedule.map(renderMatchRow)}</div>;
    }
    if (groupMode === "round") {
      return renderRoundGroups(list);
    }
    if (groupMode === "flat") {
      return <div className="space-y-1.5">{list.map(renderMatchRow)}</div>;
    }

    // Group by date + time slot
    const groups = new Map<string, any[]>();
    list.forEach((m) => {
      const key = `${m.scheduled_date || "TBD"}|${m.scheduled_time || "TBD"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    });
    // Always show the date/time groups chronologically — a rescheduled or
    // live game must never push a later date above an earlier one.
    const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
      const ak = a.replace("TBD", "9999-12-31");
      const bk = b.replace("TBD", "9999-12-31");
      return ak.localeCompare(bk);
    });
    return (
      <div className="space-y-2">
        {sortedGroups.map(([key, items]) => {
          const [d, t] = key.split("|");
          const dateObj = d && d !== "TBD" ? new Date(`${d}T00:00:00`) : null;
          const courts = Array.from(new Set(items.map((m: any) => m.court?.name).filter(Boolean)));
          return (
            <details key={key} open className="rounded-lg border border-border bg-card/60 overflow-hidden group">
              <summary className="cursor-pointer select-none flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 text-xs font-semibold">
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                <span className="uppercase tracking-wider">
                  {dateObj ? format(dateObj, "EEE dd MMM") : "TBD"} · {t !== "TBD" ? t.slice(0, 5) : "—"}
                </span>
                <span className="text-muted-foreground font-normal">({items.length} {items.length === 1 ? "match" : "matches"})</span>
                <div className="ml-auto flex gap-1 flex-wrap">
                  {courts.map((c: any) => {
                    const tint = courtTint(c);
                    return (
                      <Badge key={c} variant="outline" className={cn("text-[9px] px-1.5 py-0", tint?.badge)}>{c}</Badge>
                    );
                  })}
                </div>
              </summary>
              <div className="p-2 space-y-1.5">{items.map((m, i) => renderMatchRow(m, i, items))}</div>
            </details>
          );
        })}
      </div>
    );
  };


  const renderMatchRow = (m: any, idx: number, arr: any[]) => {
    const prev = idx > 0 ? arr[idx - 1] : null;
    const slotChanged = !prev || prev.scheduled_date !== m.scheduled_date || prev.scheduled_time !== m.scheduled_time;
    const tint = courtTint(m.court?.name);

    const champ = champs.find((c: any) => c.id === m.champ_id);
    const isDoubles = champ?.match_type === "doubles" || !!m.partner_a_member_id || !!m.partner_b_member_id;
    const isPlaceholder = m.status === "placeholder";
    // A bye has no opponent — nothing to schedule, mark or score.
    const isBye = isByeFixture(m);
    const tournamentFormat = getTournamentFormat(champ?.scoring_mode);
    const teamA = isPlaceholder ? "Empty slot" : sideLabel(m.player_a, m.partner_a, m.placeholder_a, isDoubles, m) + hcLabel(m.handicap_a ?? m.n_a);
    const teamB = isPlaceholder ? "Drag a match here" : sideLabel(m.player_b, m.partner_b, m.placeholder_b, isDoubles, m) + hcLabel(m.handicap_b ?? m.n_b);

    // Play-off heading always names its event, e.g. "Men's Singles · Semi-final 1 · Pool A #1 vs Pool B #2"
    const isPlayoffMatch = typeof m.stage === "string" && m.stage.startsWith("playoff");
    const seedPair = m.placeholder_a && m.placeholder_b ? `${m.placeholder_a} vs ${m.placeholder_b}` : null;
    const playoffHeading = isPlayoffMatch
      ? playoffHeadingText(m.group_number != null ? getGroupLabel(champ, m.group_number) : null, m.stage_label, seedPair)
      : null;
    // Provisional only while outstanding pool games can still change who plays here.
    // Fixed (no tag) when: match is done, that league's pool games are all played,
    // or both sides came through completed knockout feeders (Winner/Loser of ...).
    const feederDriven =
      /winner|loser/i.test(String(m.placeholder_a || "")) || /winner|loser/i.test(String(m.placeholder_b || ""));
    const bothSidesKnown = !!m.player_a && !!m.player_b;
    const poolStillOpen =
      openPoolLeagues.has(`${m.champ_id}|${m.group_number ?? "-"}`) ||
      (m.group_number == null && openPoolLeagues.has(`${m.champ_id}|*`));
    const playoffProvisional =
      isPlayoffMatch &&
      m.status !== "completed" &&
      poolStillOpen &&
      !(feederDriven && bothSidesKnown);


    const matchDate = m.scheduled_date ? new Date(m.scheduled_date) : null;
    const today = matchDate && isToday(matchDate);
    const markRoute = tournamentFormat.markerRoute(m.id);

    const live = isLive(m);
    const aPts = m.side_a_points ?? 0;
    const bPts = m.side_b_points ?? 0;
    const aAhead = live && aPts > bPts;
    const bAhead = live && bPts > aPts;
    // A knockout / play-off loss ends that player's run in the division: keep
    // the name visible in the draw, but strike it through.
    const koOut = eliminatedSide(m);
    const teamAClass = cn(
      aAhead
        ? "bg-green-500/20 text-green-700 dark:text-green-300 px-1 rounded"
        : bAhead
          ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 px-1 rounded"
          : "",
      koOut === "a" && ELIMINATED_NAME_CLASS,
    );
    const teamBClass = cn(
      bAhead
        ? "bg-green-500/20 text-green-700 dark:text-green-300 px-1 rounded"
        : aAhead
          ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 px-1 rounded"
          : "",
      koOut === "b" && ELIMINATED_NAME_CLASS,
    );

    // Self-scheduled rounds carry a "must be played by" date. Repeat it on
    // EVERY uncompleted fixture card — the round header scrolls away on
    // mobile, so the deadline must travel with the fixture. "Book by …" when
    // this viewer can book the court, otherwise read-only "Play by …".
    const playByDeadline = !isPlaceholder && m.status !== "completed"
      ? matchPlayBy(m)
      : null;
    const playBy = playByDeadline ? playByNudge(playByDeadline, todayISO()) : null;
    const playByText = playByDeadline
      ? `${!isPlaceholder && canScheduleFixture(m, memberId, { canManage: canManageChamps || isClubAdmin, centrallyScheduled: isMatchCentrallyScheduled(m) }).allowed ? "Book by" : "Play by"} ${format(new Date(`${playByDeadline.slice(0, 10)}T00:00:00`), "d MMM")}`
      : null;


    const bKey = bucketKeyOf(m);
    const bMeta = buckets.find((x) => x.key === bKey) || null;
    const color = bucketColor(bKey);
    const rowStyle = color
      ? { borderLeft: `4px solid ${color.border}`, backgroundColor: color.bg }
      : undefined;

    const chipStyle = color
      ? { backgroundColor: color.chipBg, color: color.chipText, borderColor: color.border }
      : undefined;

    // Dragging is only allowed once the admin has actually grabbed the handle.
    // Making the whole row draggable meant a normal finger-scroll over the
    // list could pick a fixture up and drop it on another slot.
    const canDrag = isClubAdmin && !isByeFixture(m) && !!m.scheduled_date && !!m.scheduled_time && m.status !== "completed" && !swapping;
    const armed = dragArmedId === m.id;
    const isDragging = dragId === m.id;
    const draggingMatch = dragId ? (allMatches as any[]).find((x) => x.id === dragId) : null;
    const isHoverTarget = hoverId === m.id && dragId && dragId !== m.id;
    const hoverCheck = isHoverTarget && draggingMatch ? canSwap(draggingMatch, m) : null;
    const dropOk = hoverCheck?.ok;
    const dropWarn = hoverCheck?.ok && hoverCheck.warn;
    const dropBad = hoverCheck && !hoverCheck.ok;

    return (
      <div key={m.id}>
        {slotChanged && (idx > 0 || !!m.scheduled_time) && (
          <div className="flex items-center gap-2 pt-2 pb-1 select-none">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-1.5">
              {matchDate ? format(matchDate, "EEE dd MMM") : "TBD"} · {m.scheduled_time?.slice(0, 5) || "—"}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}
        <div
          style={rowStyle}
          draggable={canDrag && armed}

        onDragStart={(e) => { setDragId(m.id); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDragId(null); setHoverId(null); setDragArmedId(null); }}
        onDragOver={(e) => { if (dragId && dragId !== m.id) { e.preventDefault(); setHoverId(m.id); } }}
        onDragLeave={() => { if (hoverId === m.id) setHoverId(null); }}
        onDrop={(e) => {
          e.preventDefault();
          if (!draggingMatch) return;
          const chk = canSwap(draggingMatch, m);
          if (!chk.ok) {
            if (chk.reason === "player clash at target slot") {
              toast.error("Player clash at target slot", {
                description: "Tick 'Allow player conflict' in the ⇆ Swap popover to override this restriction on future drags.",
              });
            } else {
              toast.error(`Cannot swap: ${chk.reason}`);
            }
            setDragId(null); setHoverId(null); return;
          }
          const extra = chk.warn ? `\n\nWarning: this will create a ${chk.warn}.` : "";
          if (!window.confirm(`Swap these two fixtures' courts and times?${extra}`)) {
            setDragId(null); setHoverId(null); setDragArmedId(null); return;
          }
          doSwap(draggingMatch, m);
        }}

        className={cn(
          "w-full flex flex-col sm:flex-row sm:items-center gap-2 text-sm p-2 rounded transition-all",
          today && !color ? "bg-primary/10 border border-primary/20" : (today && color ? "ring-1 ring-primary/40" : !color && "bg-muted/50"),
          armed && "cursor-grabbing",
          isDragging && "opacity-40",
          isPlaceholder && "bg-muted/30 border border-dashed border-muted-foreground/30 italic text-muted-foreground",
          dropOk && !dropWarn && "ring-2 ring-green-500",
          dropWarn && "ring-2 ring-amber-500",
          dropBad && "ring-2 ring-red-500",
        )}
      >
        {isClubAdmin && (
          <span
            className={cn(
              "shrink-0 flex items-center justify-center rounded touch-none p-1 -m-1",
              canDrag ? "cursor-grab active:cursor-grabbing text-muted-foreground hover:bg-muted hover:text-foreground" : "text-muted-foreground/30",
              armed && "bg-muted text-foreground",
            )}
            title={canDrag ? "Hold this handle to drag and swap with another fixture" : "Drag not available"}
            aria-label="Drag to swap"
            onPointerDown={() => { if (canDrag) setDragArmedId(m.id); }}
            onPointerUp={() => setDragArmedId((cur) => (cur === m.id ? null : cur))}
            onPointerCancel={() => setDragArmedId((cur) => (cur === m.id ? null : cur))}
          >
            <GripVertical className="w-4 h-4" />
          </span>
        )}
        <button
          onClick={() => navigate(`/club-champs/${m.champ_id}`)}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 flex-1 min-w-0 text-left hover:opacity-80"
        >
          <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground shrink-0">
            {matchDate ? format(matchDate, "EEE dd MMM") : isPlayoffGame(m) && !playBy ? "Date to be set" : "TBD"}
          </span>
          <span className="text-muted-foreground shrink-0">{m.scheduled_time?.slice(0, 5) || ""}</span>
          {playBy && (
            <span
              title={playBy.label}
              className={cn(
                "inline-flex items-center gap-1 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                playBy.tone === "late"
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : playBy.tone === "soon"
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    : "border-primary/40 bg-primary/10 text-primary",
              )}
            >
              <CalendarClock className="w-3 h-3" /> {playByText}
            </span>
          )}

          <span className="font-medium text-xs sm:text-sm break-words basis-full sm:basis-auto sm:flex-1 sm:min-w-0">
            {playoffHeading && (
              <span className="block text-[10px] uppercase tracking-wide font-semibold text-primary mb-0.5 break-words">
                {playoffHeading}
                {playoffProvisional && (
                  <span className="ml-1 text-destructive font-semibold">(Provisional)</span>
                )}
              </span>
            )}
            <span className={teamAClass}>{teamA}</span>
            <span className="text-muted-foreground"> vs </span>
            <span className={teamBClass}>{teamB}</span>
          </span>
          {(() => {
            let sets: { a: number; b: number }[] = [];
            if (m.game_scores) {
              try { sets = (JSON.parse(m.game_scores)?.sets) || []; } catch { /* ignore */ }
            }
            if (!sets.length) return null;
            return (
              <span className="flex flex-wrap gap-1 shrink-0">
                {sets.map((g, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] tabular-nums px-1.5">
                    {g.a}-{g.b}
                  </Badge>
                ))}
              </span>
            );
          })()}

          {bMeta && (bMeta.group != null || bMeta.pool != null || bMeta.stage) && (
            <span
              style={chipStyle}
              className="text-[10px] shrink-0 px-1.5 py-0.5 rounded border font-medium"
            >
              {bucketLabel(bMeta)}
            </span>
          )}
          {champ && (
            <Badge variant="outline" className="text-[10px] shrink-0 max-w-[140px] truncate">
              {champ.name}
            </Badge>
          )}
          {tournamentFormat.badge && (
            <Badge variant={tournamentFormat.badge.variant ?? "secondary"} className="text-[10px] shrink-0">
              {tournamentFormat.badge.label}
            </Badge>
          )}
          {m.court && (
            <Badge
              variant="outline"
              className={cn("text-[10px] shrink-0 font-semibold", tint?.badge)}
            >
              {m.court.name}
            </Badge>
          )}

          {today && !isLive(m) && !isPaused(m) && <Badge className="text-[10px] shrink-0">Today</Badge>}
        </button>

        {isLive(m) && (
          <button
            type="button"
            title="Watch this game live"
            className="live-indicator text-[10px] shrink-0 px-2.5 py-1 hover:opacity-90"
            onClick={(e) => { e.stopPropagation(); navigate(`/tournament-live/${m.id}`); }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" /> LIVE {m.side_a_points ?? 0}-{m.side_b_points ?? 0}
          </button>
        )}

        {isPaused(m) && (
          <button
            type="button"
            title="Nobody is marking this game — resume from the current score"
            className="inline-flex items-center gap-1 rounded-full border border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-semibold shrink-0 px-2.5 py-1 hover:bg-amber-500/20"
            onClick={(e) => { e.stopPropagation(); openMarker(m, markRoute, `${teamA} vs ${teamB}`); }}
          >
            <PauseCircle className="w-3 h-3" /> Paused {m.side_a_points ?? 0}-{m.side_b_points ?? 0} · Resume
          </button>
        )}


        {(() => {
          // Set / move the court & time. Available to the two players in this
          // match and to club / tournament admins — same rule as the standings
          // page, so a player can arrange their own game from the games list.
          if (isPlaceholder || isBye) return null;
          const perm = canScheduleFixture(m, memberId, { canManage: canManageChamps || isClubAdmin, centrallyScheduled: isMatchCentrallyScheduled(m) });
          if (!perm.allowed) return null;
          return (
            <Button
              size="sm"
              className="h-7 px-2.5 gap-1 shrink-0 self-end sm:self-auto rounded-full bg-reschedule text-reschedule-foreground hover:bg-reschedule/90 font-semibold shadow-sm"
              title="Set or change the court, date and time for this match"
              onClick={(e) => { e.stopPropagation(); setScheduleMatch(m); }}
            >
              <CalendarClock className="w-3 h-3" /> {scheduleActionShortLabel(m, { centrallyScheduled: isMatchCentrallyScheduled(m) })}
            </Button>
          );
        })()}

        {(() => {
          // Capture a score for a game already played away from the marker.
          // Allowed for the two players in THIS match, club/tournament admins
          // and super admins — never for an uninvolved player.
          if (isPlaceholder || isBye) return null;
          const perm = canEnterChampResult(m, memberId, { canManage: canManageChamps || isClubAdmin, anyClubMember: true });
          if (!perm.allowed) return null;
          return (
            <Button
              size="sm"
              className="h-7 px-2.5 gap-1 shrink-0 self-end sm:self-auto rounded-full bg-accent text-accent-foreground hover:bg-accent/90 font-semibold shadow-sm"
              title="Capture the score of a match that has already been played"
              onClick={(e) => {
                e.stopPropagation();
                const mine = !!memberId && [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id].includes(memberId);
                if (!mine && !window.confirm("This is not your game. Are you sure you want to enter the result?")) return;
                setResultMatch(m);
              }}
            >
              <ClipboardCheck className="w-3 h-3" /> Enter result
            </Button>
          );
        })()}

        {/* Point-by-point marking. Club-scheduled matches always show the
            format's marker button; self-scheduled knockout matches offer the
            same thing to the two players as "Score it live". */}
        {(() => {
          if (isPlaceholder || isBye) return null;
          const selfScheduled = stageModeForGame(m, stageSchedulingFromChamp(champ as any), (champ as any)?.scheduling_mode) === "self";
          if (selfScheduled) {
            const perm = canEnterChampResult(m, memberId, { canManage: canManageChamps, anyClubMember: true });
            if (!perm.allowed) return null;
          }
          return (
            <Button
              size="sm"
              className="h-7 px-2.5 gap-1 shrink-0 self-end sm:self-auto rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-sm animate-pulse-slow"
              title={
                selfScheduled
                  ? "Score this match point by point while you play"
                  : tournamentFormat.key === "time_capped_points"
                    ? "Start the bell timer and score this game"
                    : "Open the marker to score this match"
              }
              onClick={(e) => {
                e.stopPropagation();
                openMarker(m, markRoute, `${teamA} vs ${teamB}`);
              }}
            >
              {tournamentFormat.key === "time_capped_points"
                ? <BellRing className="w-3 h-3" />
                : <Gavel className="w-3 h-3" />}{" "}
              {selfScheduled ? "Score it live" : tournamentFormat.markerLabel}
            </Button>
          );
        })()}

        {isClubAdmin && !isBye && m.scheduled_date && m.scheduled_time && (
          <SwapFixtureButton
            match={m}
            allMatches={allMatches.filter((x: any) => x.champ_id === m.champ_id && x.id !== m.id && x.status !== "placeholder" && x.status !== "completed")}
            label={isPlaceholder ? "Fill slot" : undefined}
            unscheduledOnly={isPlaceholder}
            getMatchLabel={(x) => {
              const c = champById.get(x.champ_id);
              const dbl = c?.match_type === "doubles";
              const a = sideLabel(x.player_a, x.partner_a, x.placeholder_a, dbl, x);
              const b = sideLabel(x.player_b, x.partner_b, x.placeholder_b, dbl, x);
              return `${a} vs ${b}`;
            }}
            getCourtName={(x) => x.court?.name || ""}
            getRowColor={(x) => bucketColor(bucketKeyOf(x))}
            getBucketLabel={(x) => {
              const bk = bucketKeyOf(x);
              const bm = buckets.find((bb) => bb.key === bk);
              return bm ? bucketLabel(bm) : null;
            }}
            invalidateKeys={[["tournaments-all-matches", champIds]]}
            size="icon"
          />
        )}

        {(isClubAdmin || canManageChamps) && !isBye && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                title="Slot actions"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {!isPlaceholder && m.status !== "completed" && (m.side_a_points ?? 0) === 0 && (m.side_b_points ?? 0) === 0 && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setReplaceMatch(m); }}>
                  <User className="w-3.5 h-3.5 mr-2" /> Replace a player
                </DropdownMenuItem>
              )}
              {!isPlaceholder && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); markSlotEmpty(m); }}>
                  <Eraser className="w-3.5 h-3.5 mr-2" /> Mark as empty (no game)
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); deleteSlot(m); }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete slot
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        </div>
      </div>
    );
  };



  const getScheduleHeaders = (matches: any[]) => {
    // Only customise when every match belongs to the same cross-league tournament
    const champIds = [...new Set(matches.map((m) => m.champ_id))];
    if (champIds.length !== 1) return { a: "Player / Team A", b: "Player / Team B" };
    const champ = champById.get(champIds[0]);
    if (!champ) {
      return { a: "Player / Team A", b: "Player / Team B" };
    }

    const sample = matches.find(
      (m) => m.player_a_member_id && m.player_b_member_id,
    );
    if (!sample) return { a: "Player / Team A", b: "Player / Team B" };

    const entryGroup = (memberId: string | null) => {
      if (!memberId) return null;
      const e = allEntries.find(
        (entry: any) =>
          entry.champ_id === champ.id &&
          (entry.club_member_id === memberId || entry.partner_member_id === memberId),
      );
      return e?.group_number ?? null;
    };

    const groupA =
      entryGroup(sample.player_a_member_id) ??
      entryGroup(sample.partner_a_member_id);
    const groupB =
      entryGroup(sample.player_b_member_id) ??
      entryGroup(sample.partner_b_member_id);

    if (groupA == null || groupB == null || groupA === groupB) {
      return { a: "Player / Team A", b: "Player / Team B" };
    }

    return {
      a: getGroupLabel(champ, groupA),
      b: getGroupLabel(champ, groupB),
    };
  };

  const buildScheduleHtml = (title: string, matches: any[]) => {
    const { a: headerA, b: headerB } = getScheduleHeaders(matches);
    const rows = matches
      .map((m) => {
        const champ = champById.get(m.champ_id);
        const isDoubles = champ?.match_type === "doubles";
        const teamA = sideLabel(m.player_a, m.partner_a, m.placeholder_a, isDoubles, m) + hcLabel(m.handicap_a);
        const teamB = sideLabel(m.player_b, m.partner_b, m.placeholder_b, isDoubles, m) + hcLabel(m.handicap_b);

        const date = m.scheduled_date ? format(new Date(m.scheduled_date), "EEE dd MMM") : "TBD";
        const time = m.scheduled_time?.slice(0, 5) || "";
        const court = m.court?.name || "";
        const tName = champ?.name || "";
        return `<tr><td>${date}</td><td>${time}</td><td>${court}</td><td>${teamA}</td><td>${teamB}</td><td>${tName}</td></tr>`;
      })
      .join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style id="pagestyle">@page{size:A4 portrait;margin:10mm}</style>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:16px;color:#111}
  h1{margin:0 0 6px;font-size:22px}
  .sub{color:#666;font-size:13px;margin-bottom:12px}
  table{width:100%;border-collapse:collapse;font-size:var(--fs,13px);table-layout:fixed}
  th,td{border:1px solid #ddd;padding:var(--pad,5px 7px);text-align:left;white-space:normal;word-break:break-word}
  th{background:#1E3A5F;color:#fff}
  tr:nth-child(even) td{background:#f7f7f9}
  col.date{width:12%}col.time{width:8%}col.court{width:9%}col.team{width:25%}col.tour{width:21%}
  .toolbar{margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:13px}
  button{padding:5px 10px;font-size:13px;cursor:pointer;border:1px solid #ccc;background:#fff;border-radius:4px}
  button.on{background:#1E3A5F;color:#fff;border-color:#1E3A5F}
  @media print{ .toolbar{display:none} body{padding:0} }
</style></head><body>
<div class="toolbar">
  <span>Page:</span>
  <button id="btnP" class="on" onclick="setOrient('portrait')">Portrait</button>
  <button id="btnL" onclick="setOrient('landscape')">Landscape</button>
  <span style="margin-left:10px">Text:</span>
  <button onclick="setSize(-1)">A−</button>
  <button onclick="setSize(1)">A+</button>
  <button style="margin-left:10px" onclick="window.print()">Print / Save PDF</button>
</div>
<h1>${title}</h1>
<div class="sub">${matches.length} match${matches.length === 1 ? "" : "es"} · Generated ${format(new Date(), "dd MMM yyyy HH:mm")}</div>
<table>
<colgroup><col class="date"><col class="time"><col class="court"><col class="team"><col class="team"><col class="tour"></colgroup>
<thead><tr><th>Date</th><th>Time</th><th>Court</th><th>${headerA}</th><th>${headerB}</th><th>Tournament</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:#888">No matches</td></tr>`}</tbody></table>
<script>
  var fs = ${matches.length > 55 ? 10 : matches.length > 35 ? 11.5 : 13};
  function apply(){
    document.body.style.setProperty('--fs', fs + 'px');
    document.body.style.setProperty('--pad', (fs < 11 ? '3px 5px' : fs < 13 ? '4px 6px' : '5px 7px'));
  }
  function setSize(d){ fs = Math.min(18, Math.max(7, fs + d)); apply(); }
  function setOrient(o){
    document.getElementById('pagestyle').textContent = '@page{size:A4 ' + o + ';margin:10mm}';
    document.getElementById('btnP').className = o === 'portrait' ? 'on' : '';
    document.getElementById('btnL').className = o === 'landscape' ? 'on' : '';
  }
  apply();
</script>
</body></html>`;


  };

  const openSchedule = (title: string, matches: any[]) => {
    const html = buildScheduleHtml(title, matches);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const downloadScheduleCsv = (title: string, matches: any[]) => {
    const { a: headerA, b: headerB } = getScheduleHeaders(matches);
    const header = ["Date", "Time", "Court", headerA, headerB, "Tournament"];
    const esc = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
    const lines = [header.join(",")];
    matches.forEach((m) => {
      const champ = champById.get(m.champ_id);
      const isDoubles = champ?.match_type === "doubles";
      const teamA = sideLabel(m.player_a, m.partner_a, m.placeholder_a, isDoubles, m) + hcLabel(m.handicap_a);
      const teamB = sideLabel(m.player_b, m.partner_b, m.placeholder_b, isDoubles, m) + hcLabel(m.handicap_b);

      lines.push([
        m.scheduled_date || "",
        m.scheduled_time?.slice(0, 5) || "",
        m.court?.name || "",
        teamA,
        teamB,
        champ?.name || "",
      ].map(esc).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const courtNames = Array.from(
    new Set(upcomingMatches.map((m: any) => m.court?.name).filter(Boolean)),
  ).sort() as string[];



  return (
    <div className="bottom-nav-safe">
      <SEO title="Tournaments" description="Club championships and internal leagues" path="/tournaments" noIndex />
      <PageHeader title="Tournaments" subtitle="Championships & internal leagues" />

      <div className="px-4 sm:px-6 lg:px-[5%] mt-3 mb-20">
        {champsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : allChamps.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No tournaments yet
          </Card>
        ) : (
          <Tabs value={champTab} onValueChange={setChampTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-auto gap-1 bg-muted p-1">
              <TabsTrigger
                value="upcoming"
                className="text-sm py-2.5 font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                🗓️ Current{champs.length > 0 ? ` (${champs.length})` : ""}
              </TabsTrigger>
              <TabsTrigger
                value="standings"
                className="text-sm py-2.5 font-semibold border-2 border-amber-500/60 data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:border-amber-500 data-[state=active]:shadow-md transition-all"
              >
                🏆 Standings
              </TabsTrigger>
              <TabsTrigger
                value="past"
                className="text-sm py-2.5 font-semibold border-2 border-slate-500/60 data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:border-slate-700 data-[state=active]:shadow-md transition-all"
              >
                ✓ Past{pastChamps.length > 0 ? ` (${pastChamps.length})` : ""}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="w-4 h-4" /> Current &amp; upcoming tournaments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {champs.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Nothing running or scheduled right now.
                      </p>
                      {pastChamps.length > 0 && (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => setChampTab("past")}>
                          View {pastChamps.length} past tournament{pastChamps.length === 1 ? "" : "s"}
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ) : (

                    <div className="space-y-1.5">
                      {champs.map((champ: any) => {
                        const isDoubles = champ.match_type === "doubles";
                        const closesAt = champ.registration_closes_at ? new Date(champ.registration_closes_at) : null;
                        const opensAt = champ.registration_opens_at ? new Date(champ.registration_opens_at) : null;
                        const now = new Date();
                        const regOpen = (!opensAt || now >= opensAt) && (!closesAt || now <= closesAt) && !champ.entries_locked;
                        return (
                          <div
                            key={champ.id}
                            role="button"
                            tabIndex={0}
                            title="Open tournament (standings & details)"
                            onClick={() => navigate(`/club-champs/${champ.id}`)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                navigate(`/club-champs/${champ.id}`);
                              }
                            }}
                            className="w-full flex items-center justify-between gap-2 p-2 rounded bg-muted/50 hover:bg-muted text-left cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{champ.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {GENDER_LABELS[champ.gender] || champ.gender} {isDoubles ? "Doubles" : "Singles"} · {champ.start_date} to {champ.end_date}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {regOpen && <Badge variant="default" className="text-[10px]">Open</Badge>}
                              <Badge variant="secondary" className="text-[10px]">{champ.status}</Badge>
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isClubAdmin && undatedChamps.length > 0 && (
                    <div className="mt-3 rounded-md border border-dashed p-2">
                      <p className="text-[11px] font-medium">Needs dates (admin only)</p>
                      <p className="text-[11px] text-muted-foreground mb-1.5">
                        These tournaments have no start or end date yet, so members don't see them.
                      </p>
                      <div className="space-y-1">
                        {undatedChamps.map((champ: any) => (
                          <button
                            key={champ.id}
                            onClick={() => navigate(`/club-champs/${champ.id}`)}
                            className="w-full flex items-center justify-between gap-2 p-1.5 rounded bg-muted/40 hover:bg-muted text-left"
                          >
                            <span className="text-xs truncate">{champ.name}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">Needs dates</Badge>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>


              <Card ref={gamesCardRef} className="scroll-mt-4">
                <CardHeader className="pb-2">
                  {(isClubAdmin || canManageChamps) && (timedIssues ?? []).map((t) => (
                    <div key={t.champId} role="alert" className="mb-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <div className="font-semibold">{(champById.get(t.champId) as any)?.name ?? "Tournament"}: fixed rounds can't be given times and courts</div>
                      <ul className="list-disc pl-4 mt-1 space-y-0.5">{t.issues.slice(0, 4).map((x, i) => <li key={i}>{x}</li>)}</ul>
                      <div className="mt-1">Add courts, widen the time window or add a match date in setup, then press "Assign courts &amp; times".</div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> Tournament Games
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                      {isClubAdmin && champs.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 h-7"
                          onClick={() => { setAddSlotChampId(champs[0].id); setAddSlotOpen(true); }}
                          title="Insert an empty time slot (admin only)"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add slot
                        </Button>
                      )}
                      {(isClubAdmin || canManageChamps) && champs.length > 0 && (
                        <AssignCourtsTimesButton champs={(champFilter !== "all" ? champs.filter((c: any) => c.id === champFilter) : champs) as any} />
                      )}
                      {(isClubAdmin || canManageChamps) && champs.length > 0 && (
                        <WithdrawPlayerButton champs={champs} />
                      )}
                      {champs.length === 1 && <JoinWhatsAppGroupButton champId={champs[0].id} />}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1 h-7">
                          <Printer className="w-3.5 h-3.5" /> Print / Download
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>Full schedule</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => openSchedule("Full Tournament Schedule", upcomingMatches)}>
                          <Printer className="w-3.5 h-3.5 mr-2" /> Print full schedule
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadScheduleCsv("Full Tournament Schedule", upcomingMatches)}>
                          <Calendar className="w-3.5 h-3.5 mr-2" /> Download CSV
                        </DropdownMenuItem>
                        {champs.length > 1 && <DropdownMenuSeparator />}
                        {champs.length > 1 && <DropdownMenuLabel>Per tournament</DropdownMenuLabel>}
                        {champs.length > 1 && champs.map((c: any) => {
                          const list = upcomingMatches.filter((m: any) => m.champ_id === c.id);
                          if (list.length === 0) return null;
                          return (
                            <React.Fragment key={c.id}>
                              <DropdownMenuItem onClick={() => openSchedule(`${c.name} – Schedule`, list)}>
                                <Printer className="w-3.5 h-3.5 mr-2" /> Print {c.name} ({list.length})
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => downloadScheduleCsv(`${c.name} – Schedule`, list)}>
                                <Calendar className="w-3.5 h-3.5 mr-2" /> CSV {c.name}
                              </DropdownMenuItem>
                            </React.Fragment>
                          );
                        })}
                        {courtNames.length > 0 && <DropdownMenuSeparator />}
                        {courtNames.length > 0 && <DropdownMenuLabel>Per court</DropdownMenuLabel>}
                        {courtNames.map((c) => {
                          const list = upcomingMatches.filter((m: any) => m.court?.name === c);
                          return (
                            <DropdownMenuItem
                              key={c}
                              onClick={() => openSchedule(`${c} – Schedule`, list)}
                            >
                              <Printer className="w-3.5 h-3.5 mr-2" /> {c} ({list.length})
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {(buckets.length > 1 || availableDates.length > 1 || champFilter !== "all") && (
                    <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-2">
                      <label className="text-xs text-muted-foreground shrink-0">Filter:</label>
                      {champs.length > 1 && (
                        <Select value={champFilter} onValueChange={setChampFilter}>
                          <SelectTrigger className="h-8 text-xs w-full sm:max-w-[200px]">
                            <SelectValue placeholder="All tournaments" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All tournaments ({upcomingMatches.length})</SelectItem>
                            {champs.map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name} ({upcomingMatches.filter((m: any) => m.champ_id === c.id).length})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {availableDates.length > 1 && (
                        <Select value={dateFilter} onValueChange={setDateFilter}>
                          <SelectTrigger className="h-8 text-xs w-full sm:max-w-[180px]">
                            <SelectValue placeholder="All dates" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All dates ({upcomingMatches.length})</SelectItem>
                            {availableDates.map((d) => {
                              const count = upcomingMatches.filter((m: any) => m.scheduled_date === d).length;
                              return (
                                <SelectItem key={d} value={d}>
                                  {format(new Date(d), "EEE dd MMM")} ({count})
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      )}
                      {buckets.length > 1 && (
                        <Select value={poolFilter} onValueChange={setPoolFilter}>
                          <SelectTrigger className="h-8 text-xs w-full sm:max-w-[280px]">
                            <SelectValue placeholder="All leagues & pools" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All leagues & pools ({upcomingMatches.length})</SelectItem>
                            {buckets.map((b) => {
                              const color = bucketColor(b.key);
                              return (
                                <SelectItem key={b.key} value={b.key}>
                                  <span className="inline-flex items-center gap-2">
                                    <span
                                      className="inline-block w-2.5 h-2.5 rounded-sm"
                                      style={{ backgroundColor: color?.border }}
                                    />
                                    {bucketLabel(b, { withChamp: champs.length > 1 })} ({b.count})
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      )}
                      {!listIsChronological(filteredUpcoming) && (
                        <div className="inline-flex rounded-md border overflow-hidden">
                          {([
                            { v: "round", l: "By round" },
                            { v: "slot", l: "By slot" },
                            { v: "flat", l: "List" },
                          ] as const).map((o) => (
                            <button
                              key={o.v}
                              type="button"
                              onClick={() => setGroupMode(o.v)}
                              className={cn(
                                "h-8 px-2.5 text-xs font-medium",
                                groupMode === o.v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                              )}
                            >
                              {o.l}
                            </button>
                          ))}
                        </div>
                      )}

                      {(poolFilter !== "all" || dateFilter !== "all" || champFilter !== "all") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => { setPoolFilter("all"); setDateFilter("all"); setChampFilter("all"); }}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  )}


                  {memberId && myUpcoming.length > 0 ? (
                    <Tabs defaultValue="all" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 h-auto mb-3">
                        <TabsTrigger value="all" className="text-xs py-1.5">All Games ({filteredUpcoming.length})</TabsTrigger>
                        <TabsTrigger value="mine" className="text-xs py-1.5 gap-1"><User className="w-3 h-3" /> My Games ({filteredMine.length})</TabsTrigger>
                      </TabsList>
                      <TabsContent value="all" className="mt-0">
                        {filteredUpcoming.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No scheduled games match these filters.</p>
                        ) : (
                          renderMatchList(filteredUpcoming)
                        )}
                      </TabsContent>
                      <TabsContent value="mine" className="mt-0">
                        {filteredMine.length === 0 ? (
                          <p className="text-sm text-muted-foreground">None of your games match these filters.</p>
                        ) : (
                          renderMatchList(filteredMine)
                        )}
                      </TabsContent>
                    </Tabs>
                  ) : filteredUpcoming.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No scheduled games.</p>
                  ) : (
                    renderMatchList(filteredUpcoming)
                  )}


                </CardContent>

              </Card>
            </TabsContent>




            <TabsContent value="standings" className="mt-4 space-y-3">
              {champs.length === 0 && (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  No tournament is running. Standings for finished events are under <span className="font-medium">Past</span>.
                </Card>
              )}
              {champs.map((champ: any) => {
                if (diamondTournamentSet.has(champ.id)) return <DiamondStandings key={champ.id} tournamentId={champ.id} canManage={canManageChamps || isClubAdmin} />;
                return (

                  <Card key={champ.id}>
                    <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-primary" /> {champ.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {GENDER_LABELS[champ.gender] || champ.gender} ·{" "}
                          {(() => { const v = Object.values(champ.league_match_types || {}).map((x: any) => String(x).toLowerCase()); const d = champ.match_type === "doubles" || v.includes("doubles"); const sg = champ.match_type !== "doubles" && (v.length === 0 || v.includes("singles")); return d && sg && v.length ? "Singles and Doubles" : d ? "Doubles" : "Singles"; })()}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => navigate(`/club-champs/${champ.id}`)}
                      >
                        <BarChart3 className="w-3.5 h-3.5" /> View Standings
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground">
                        Tap <span className="font-medium">View Standings</span> to open the full standings table.
                      </p>
                    </CardContent>

                  </Card>
                );
              })}
            </TabsContent>

            <TabsContent value="past" className="mt-4 space-y-3">
              {pastChamps.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  No past tournaments yet. Completed events will be archived here.
                </Card>
              ) : (
                <>
                  {(showAllPast ? pastChamps : pastChamps.slice(0, 8)).map((champ: any) => {
                  const isDoubles = champ.match_type === "doubles";
                  return (
                    <Card key={champ.id} className="opacity-90">
                      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                        <div className="min-w-0">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-muted-foreground" />
                            <span className="truncate">{champ.name}</span>
                          </CardTitle>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {GENDER_LABELS[champ.gender] || champ.gender} {isDoubles ? "Doubles" : "Singles"}
                            {" · "}
                            {champ.start_date} to {champ.end_date}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge
                            variant={isCancelledTournament(champ) ? "destructive" : "secondary"}
                            className="text-[10px]"
                          >
                            {isCancelledTournament(champ)
                              ? "Cancelled"
                              : champ.status === "completed"
                                ? "completed"
                                : "ended"}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => navigate(`/club-champs/${champ.id}`)}
                          >
                            View <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </CardHeader>
                    </Card>
                  );
                  })}
                  {!showAllPast && pastChamps.length > 8 && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAllPast(true)}>
                      Show all {pastChamps.length} past tournaments
                    </Button>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
      <BackToDashboard />

      {finalizeChamp && clubId && (
        <FinalizeTournamentSetupDialog
          open={!!finalizeChamp}
          onOpenChange={(o) => { if (!o) setFinalizeChamp(null); }}
          champId={finalizeChamp.id}
          champName={finalizeChamp.name}
          clubId={clubId}
          gender={finalizeChamp.gender}
          isDoubles={finalizeChamp.match_type === "doubles"}
        />
      )}

      <AddSlotDialog
        open={addSlotOpen}
        onOpenChange={setAddSlotOpen}
        champs={champs}
        allMatches={allMatches}
        defaultChampId={addSlotChampId}
        invalidateKeys={[["tournaments-all-matches", champIds]]}
      />

      <MarkerTakeoverDialog
        open={!!takeover}
        onOpenChange={(o) => { if (!o) setTakeover(null); }}
        matchId={takeover?.matchId || null}
        markRoute={takeover?.markRoute || ""}
        matchLabel={takeover?.label}
        markerName={takeover?.markerName}
        requesterName={activeMember?.name || user?.email || "A marker"}
        isAdmin={isClubAdmin}
      />

      <ScheduleMatchDialog
        open={!!scheduleMatch}
        onOpenChange={(o) => { if (!o) setScheduleMatch(null); }}
        clubId={clubId}
        match={scheduleMatch}
        canManage={canManageChamps || isClubAdmin}
        allowedCourtIds={(scheduleChamp as any)?.court_ids ?? []}
        opponentName={scheduleMatch ? `${sideLabel(scheduleMatch.player_a, scheduleMatch.partner_a, scheduleMatch.placeholder_a, (scheduleChamp as any)?.match_type === "doubles", scheduleMatch)} vs ${sideLabel(scheduleMatch.player_b, scheduleMatch.partner_b, scheduleMatch.placeholder_b, (scheduleChamp as any)?.match_type === "doubles", scheduleMatch)}` : undefined}
        durationMinutes={(scheduleChamp as any)?.match_duration_minutes ?? undefined}
      />

      <ReplacePlayerDialog
        open={!!replaceMatch}
        onOpenChange={(o) => { if (!o) setReplaceMatch(null); }}
        clubId={clubId}
        match={replaceMatch}
        isDoubles={replaceMatch ? champById.get(replaceMatch.champ_id)?.match_type === "doubles" || champById.get(replaceMatch.champ_id)?.match_type === "mixed" : false}
        candidates={(() => {
          if (!replaceMatch) return [];
          const champMatches = (allMatches as any[]).filter((x: any) => x.champ_id === replaceMatch.champ_id);
          const out = eliminatedMemberIds(champMatches);
          const gn = (replaceMatch as any).group_number ?? null;
          const seen = new Set<string>();
          const list: { id: string; name: string }[] = [];
          (allEntries as any[])
            .filter((e: any) => e.champ_id === replaceMatch.champ_id)
            .forEach((e: any) => {
              if (gn != null && e.group_number != null && e.group_number !== gn) return;
              [e.club_members, e.partner].forEach((pl: any) => {
                if (!pl?.id || seen.has(pl.id) || out.has(pl.id)) return;
                seen.add(pl.id);
                list.push({ id: pl.id, name: pl.profiles?.name || pl.name || "Player" });
              });
            });
          return list.sort((a, b) => a.name.localeCompare(b.name));
        })()}
        getName={(memberId) => {
          if (!memberId || !replaceMatch) return "";
          const p = [replaceMatch.player_a, replaceMatch.player_b, replaceMatch.partner_a, replaceMatch.partner_b]
            .find((x: any) => x?.id === memberId);
          return p?.profiles?.name || p?.name || "";
        }}
        onSaved={() => {
          setReplaceMatch(null);
          qc.invalidateQueries({ queryKey: ["tournaments-all-matches", champIds] });
        }}
      />

      <EnterResultDialog
        open={!!resultMatch}
        onOpenChange={(o) => { if (!o) setResultMatch(null); }}
        clubId={clubId}
        match={resultMatch}
        playerAName={resultMatch ? sideLabel(resultMatch.player_a, resultMatch.partner_a, resultMatch.placeholder_a, (resultChamp as any)?.match_type === "doubles", resultMatch) : ""}
        playerBName={resultMatch ? sideLabel(resultMatch.player_b, resultMatch.partner_b, resultMatch.placeholder_b, (resultChamp as any)?.match_type === "doubles", resultMatch) : ""}
        bestOf={(resultChamp as any)?.best_of}
        pointsTarget={(resultChamp as any)?.points_per_game}
        scoringMode={(resultChamp as any)?.scoring_mode ?? null}
        onSaved={() => {
          setResultMatch(null);
          qc.invalidateQueries({ queryKey: ["tournaments-all-matches", champIds] });
        }}
      />



    </div>
  );
}
