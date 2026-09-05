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
import { fromExt } from "@/lib/supabase-ext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { useMemberContext } from "@/contexts/MemberContext";
import { useNavigate } from "react-router-dom";
import { format, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinalizeTournamentSetupDialog } from "@/components/tournaments/FinalizeTournamentSetupDialog";
import { SwapFixtureButton } from "@/components/tournaments/SwapFixtureButton";
import { getTournamentFormat } from "@/lib/tournament-formats";
import { getGroupLabel } from "@/lib/tournament-formats/group-labels";
import { getBucketColor, buildBucketColorMap } from "@/lib/tournament-colors";
import { assignPools, entityIdForEntry, type Entry as SwissEntry } from "@/lib/swiss-pairing";
import { useAuth } from "@/contexts/AuthContext";
import { fetchChampMarkerLock, isLockFresh, useChampMarkerLocks } from "@/hooks/use-champ-marker-lock";
import { MarkerTakeoverDialog } from "@/components/tournaments/MarkerTakeoverDialog";
import { splitTournamentsByLifecycle, todayISO, isCancelledTournament } from "@/lib/tournaments/lifecycle";
import { EnterResultDialog } from "@/components/tournaments/EnterResultDialog";
import { canEnterChampResult } from "@/lib/tournaments/quick-result";
import { ScheduleMatchDialog } from "@/components/tournaments/ScheduleMatchDialog";
import { canScheduleFixture, scheduleActionShortLabel } from "@/lib/tournaments/fixture-scheduling";
import { eliminatedSide, ELIMINATED_NAME_CLASS } from "@/lib/tournaments/elimination";

import { useHasPermission } from "@/hooks/use-club-permissions";

const GENDER_LABELS: Record<string, string> = { men: "Men's", ladies: "Ladies'", mixed: "Mixed", open: "Open" };

export default function Tournaments() {
  const navigate = useNavigate();
  const { club: contextClub } = useClubContext();
  const { data: clubData } = useMyClub();
  const { activeMember } = useMemberContext();
  const isClubAdmin = useIsClubAdmin();
  const clubId = contextClub?.id || clubData?.club?.id;
  const memberId = activeMember?.id;
  const [finalizeChamp, setFinalizeChamp] = useState<any | null>(null);
  // Club/tournament officials and super admins may capture any result;
  // everyone else only their own matches.
  const canManageChamps = useHasPermission("champs");
  const [resultMatch, setResultMatch] = useState<any | null>(null);
  const [scheduleMatch, setScheduleMatch] = useState<any | null>(null);
  const { user } = useAuth();
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
    queryKey: ["tournaments-list", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs")
        .select("*")
        .eq("club_id", clubId!)
        .order("start_date");
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  const todayStr = todayISO();
  // Lifecycle split lives in one shared place so every member-facing surface
  // agrees on what "current" means (see src/lib/tournaments/lifecycle.ts).
  const { current: champs, past: pastChamps, needsDates: undatedChamps } =
    splitTournamentsByLifecycle(allChamps as any[], todayStr);
  const champById = useMemo(
    () => new Map((allChamps as any[]).map((champ: any) => [champ.id, champ] as const)),
    [allChamps],
  );

  const champIds = allChamps.map((c: any) => c.id);
  const champIdsKey = champIds.slice().sort().join("|");


  const { data: allEntries = [] } = useQuery({
    queryKey: ["tournaments-all-entries", champIds],
    queryFn: async () => {
      if (!champIds.length) return [];
      const { data, error } = await fromExt("club_champs_entries")
        .select("*, club_members:club_member_id(id, name, profiles:user_id(name)), partner:partner_member_id(id, name, profiles:user_id(name))")
        .in("champ_id", champIds);
      if (error) throw error;
      return data || [];
    },
    enabled: champIds.length > 0,
  });

  // All scheduled matches per tournament (full schedule view)
  const { data: allMatches = [] } = useQuery({
    queryKey: ["tournaments-all-matches", champIds],
    queryFn: async () => {
      if (!champIds.length) return [];
      const { data, error } = await fromExt("club_champs_matches")
        .select("*, player_a:player_a_member_id(id, name, profiles:user_id(name)), player_b:player_b_member_id(id, name, profiles:user_id(name)), partner_a:partner_a_member_id(id, name, profiles:user_id(name)), partner_b:partner_b_member_id(id, name, profiles:user_id(name)), court:court_id(name)")
        .in("champ_id", champIds)
        .order("scheduled_date")
        .order("scheduled_time");
      if (error) throw error;
      return data || [];
    },
    enabled: champIds.length > 0,
    refetchInterval: 10000,
  });

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
      return ac.localeCompare(bc, undefined, { numeric: true, sensitivity: "base" });
    });


  const getName = (p: any) => p?.name || p?.profiles?.name || "Unknown";
  const getTeam = (a: any, b: any) => (b ? `${getName(a)} & ${getName(b)}` : getName(a));
  // Placeholder-aware side label — playoff/finals slots have no player yet
  // (player_a is null) but do have a human-readable placeholder like
  // "Winner Pool A". Fall back to that before showing "Unknown".
  const sideLabel = (player: any, partner: any, placeholder: string | null | undefined, isDoubles: boolean) => {
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
      for (const gn of groupNums) {
        const pc = Math.max(1, Number(cfg[String(gn)]) || 1);
        if (pc <= 1) continue;
        groupMap.set(gn, assignPools(champEntries as SwissEntry[], gn, pc, isDoubles));
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
  const bucketKeyOf = (m: any) =>
    isPlayoff(m)
      ? `${m.champ_id}|playoff|all`
      : `${m.champ_id}|${m.group_number ?? "-"}|${poolOf(m) ?? "-"}`;

  const buckets = useMemo(() => {
    const seen = new Map<string, { key: string; champId: string; group: number | null; pool: number | null; stage: string | null; stageLabel: string | null; count: number }>();
    for (const m of upcomingMatches) {
      const key = bucketKeyOf(m);
      const existing = seen.get(key);
      if (existing) { existing.count++; continue; }
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
    if (b.group != null) parts.push(getGroupLabel(champ, b.group));
    const pl = poolLetter(b.pool);
    if (pl) parts.push(`Pool ${pl}`);
    return parts.join(" · ") || "Unassigned";
  };

  // Members always land on what is running/coming up; history is one tap away.
  const [champTab, setChampTab] = useState<string>("upcoming");
  const [showAllPast, setShowAllPast] = useState(false);
  const [poolFilter, setPoolFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [groupBySlot, setGroupBySlot] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("tournaments.groupBySlot") === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem("tournaments.groupBySlot", groupBySlot ? "1" : "0"); } catch {}
  }, [groupBySlot]);


  const availableDates = useMemo(() => {
    const set = new Set<string>();
    for (const m of upcomingMatches) if (m.scheduled_date) set.add(m.scheduled_date);
    return [...set].sort();
  }, [upcomingMatches]);

  const applyFilters = (list: any[]) =>
    list.filter(
      (m) =>
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

  const renderMatchList = (list: any[]) => {
    if (!groupBySlot) {
      return <div className="space-y-1.5">{list.map(renderMatchRow)}</div>;
    }
    // Group by date + time slot
    const groups = new Map<string, any[]>();
    list.forEach((m) => {
      const key = `${m.scheduled_date || "TBD"}|${m.scheduled_time || "TBD"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    });
    return (
      <div className="space-y-2">
        {Array.from(groups.entries()).map(([key, items]) => {
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
    const isDoubles = champ?.match_type === "doubles";
    const isPlaceholder = m.status === "placeholder";
    const tournamentFormat = getTournamentFormat(champ?.scoring_mode);
    const teamA = isPlaceholder ? "Empty slot" : sideLabel(m.player_a, m.partner_a, m.placeholder_a, isDoubles) + hcLabel(m.handicap_a ?? m.n_a);
    const teamB = isPlaceholder ? "Drag a match here" : sideLabel(m.player_b, m.partner_b, m.placeholder_b, isDoubles) + hcLabel(m.handicap_b ?? m.n_b);

    // Play-off heading — e.g. "Play-off · League 1 · Semi-final — Pool A #1 vs Pool B #2"
    const isPlayoffMatch = typeof m.stage === "string" && m.stage.startsWith("playoff");
    const seedPair = m.placeholder_a && m.placeholder_b ? `${m.placeholder_a} vs ${m.placeholder_b}` : null;
    const playoffHeading = isPlayoffMatch
      ? ["Play-off", m.stage_label, seedPair].filter(Boolean).join(" · ")
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


    const bKey = bucketKeyOf(m);
    const bMeta = buckets.find((x) => x.key === bKey) || null;
    const color = bucketColor(bKey);
    const rowStyle = color
      ? { borderLeft: `4px solid ${color.border}`, backgroundColor: color.bg }
      : undefined;

    const chipStyle = color
      ? { backgroundColor: color.chipBg, color: color.chipText, borderColor: color.border }
      : undefined;

    const canDrag = isClubAdmin && !!m.scheduled_date && !!m.scheduled_time && m.status !== "completed" && !swapping;
    const isDragging = dragId === m.id;
    const draggingMatch = dragId ? (allMatches as any[]).find((x) => x.id === dragId) : null;
    const isHoverTarget = hoverId === m.id && dragId && dragId !== m.id;
    const hoverCheck = isHoverTarget && draggingMatch ? canSwap(draggingMatch, m) : null;
    const dropOk = hoverCheck?.ok;
    const dropWarn = hoverCheck?.ok && hoverCheck.warn;
    const dropBad = hoverCheck && !hoverCheck.ok;

    return (
      <div key={m.id}>
        {slotChanged && idx > 0 && (
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
          draggable={canDrag}

        onDragStart={(e) => { setDragId(m.id); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDragId(null); setHoverId(null); }}
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
          if (chk.warn) {
            const ok = window.confirm(`Warning: this swap will create a ${chk.warn}. Continue?`);
            if (!ok) { setDragId(null); setHoverId(null); return; }
          }
          doSwap(draggingMatch, m);
        }}

        className={cn(
          "w-full flex flex-col sm:flex-row sm:items-center gap-2 text-sm p-2 rounded transition-all",
          today && !color ? "bg-primary/10 border border-primary/20" : (today && color ? "ring-1 ring-primary/40" : !color && "bg-muted/50"),
          canDrag && "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-40",
          isPlaceholder && "bg-muted/30 border border-dashed border-muted-foreground/30 italic text-muted-foreground",
          dropOk && !dropWarn && "ring-2 ring-green-500",
          dropWarn && "ring-2 ring-amber-500",
          dropBad && "ring-2 ring-red-500",
        )}
      >
        {isClubAdmin && (
          <span
            className={cn("shrink-0 flex items-center justify-center rounded", canDrag ? "cursor-grab active:cursor-grabbing text-muted-foreground hover:bg-muted hover:text-foreground" : "text-muted-foreground/30")}
            title={canDrag ? "Drag to swap with another fixture on the same court" : "Drag not available"}
            aria-label="Drag to swap"
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
            {matchDate ? format(matchDate, "EEE dd MMM") : "TBD"}
          </span>
          <span className="text-muted-foreground shrink-0">{m.scheduled_time?.slice(0, 5) || ""}</span>
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
          if (isPlaceholder) return null;
          const perm = canScheduleFixture(m, memberId, { canManage: canManageChamps || isClubAdmin });
          if (!perm.allowed) return null;
          return (
            <Button
              size="sm"
              className="h-7 px-2.5 gap-1 shrink-0 self-end sm:self-auto rounded-full bg-reschedule text-reschedule-foreground hover:bg-reschedule/90 font-semibold shadow-sm"
              title="Set or change the court, date and time for this match"
              onClick={(e) => { e.stopPropagation(); setScheduleMatch(m); }}
            >
              <CalendarClock className="w-3 h-3" /> {scheduleActionShortLabel(m)}
            </Button>
          );
        })()}

        {(() => {
          // Capture a score for a game already played away from the marker.
          // Allowed for the two players in THIS match, club/tournament admins
          // and super admins — never for an uninvolved player.
          if (isPlaceholder) return null;
          const perm = canEnterChampResult(m, memberId, { canManage: canManageChamps, anyClubMember: true });
          if (!perm.allowed) return null;
          return (
            <Button
              size="sm"
              className="h-7 px-2.5 gap-1 shrink-0 self-end sm:self-auto rounded-full bg-accent text-accent-foreground hover:bg-accent/90 font-semibold shadow-sm"
              title="Capture the score of a match that has already been played"
              onClick={(e) => { e.stopPropagation(); setResultMatch(m); }}
            >
              <ClipboardCheck className="w-3 h-3" /> Enter your result
            </Button>
          );
        })()}

        {/* Point-by-point marking. Club-scheduled matches always show the
            format's marker button; self-scheduled knockout matches offer the
            same thing to the two players as "Score it live". */}
        {(() => {
          if (isPlaceholder) return null;
          const selfScheduled = String((champ as any)?.scheduling_mode || "") === "self";
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

        {isClubAdmin && m.scheduled_date && m.scheduled_time && (
          <SwapFixtureButton
            match={m}
            allMatches={allMatches.filter((x: any) => x.champ_id === m.champ_id && x.id !== m.id && x.status !== "placeholder" && x.status !== "completed")}
            label={isPlaceholder ? "Fill slot" : undefined}
            unscheduledOnly={isPlaceholder}
            getMatchLabel={(x) => {
              const c = champById.get(x.champ_id);
              const dbl = c?.match_type === "doubles";
              const a = sideLabel(x.player_a, x.partner_a, x.placeholder_a, dbl);
              const b = sideLabel(x.player_b, x.partner_b, x.placeholder_b, dbl);
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

        {isClubAdmin && (
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
        const teamA = sideLabel(m.player_a, m.partner_a, m.placeholder_a, isDoubles);
        const teamB = sideLabel(m.player_b, m.partner_b, m.placeholder_b, isDoubles);

        const date = m.scheduled_date ? format(new Date(m.scheduled_date), "EEE dd MMM") : "TBD";
        const time = m.scheduled_time?.slice(0, 5) || "";
        const court = m.court?.name || "";
        const tName = champ?.name || "";
        return `<tr><td>${date}</td><td>${time}</td><td>${court}</td><td>${teamA}</td><td>${teamB}</td><td>${tName}</td></tr>`;
      })
      .join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page{size:A4 portrait;margin:10mm}
  body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:16px;color:#111}
  h1{margin:0 0 6px;font-size:24px}
  .sub{color:#666;font-size:13px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed}
  th,td{border:1px solid #ddd;padding:7px 9px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  th{background:#1E3A5F;color:#fff;font-size:13px}
  tr:nth-child(even) td{background:#f7f7f9}
  col.date{width:14%}col.time{width:9%}col.court{width:10%}col.team{width:23%}col.tour{width:21%}
  .toolbar{margin-bottom:12px}
  button{padding:6px 12px;font-size:13px;cursor:pointer}
  @media print{
    .toolbar{display:none}
    body{padding:0}
    table.dense{font-size:12px}
    table.dense th,table.dense td{padding:4px 6px}
    table.veryDense{font-size:10.5px}
    table.veryDense th,table.veryDense td{padding:3px 5px}
  }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Print</button></div>
<h1>${title}</h1>
<div class="sub">${matches.length} match${matches.length === 1 ? "" : "es"} · Generated ${format(new Date(), "dd MMM yyyy HH:mm")}</div>
<table class="${matches.length > 55 ? "veryDense" : matches.length > 35 ? "dense" : ""}">
<colgroup><col class="date"><col class="time"><col class="court"><col class="team"><col class="team"><col class="tour"></colgroup>
<thead><tr><th>Date</th><th>Time</th><th>Court</th><th>${headerA}</th><th>${headerB}</th><th>Tournament</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:#888">No matches</td></tr>`}</tbody></table>
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
      const teamA = sideLabel(m.player_a, m.partner_a, m.placeholder_a, isDoubles);
      const teamB = sideLabel(m.player_b, m.partner_b, m.placeholder_b, isDoubles);

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
                          <button
                            key={champ.id}
                            onClick={() => navigate(`/club-champs/${champ.id}`)}
                            className="w-full flex items-center justify-between gap-2 p-2 rounded bg-muted/50 hover:bg-muted text-left"
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
                          </button>
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


              <Card>
                <CardHeader className="pb-2">
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
                  {(buckets.length > 1 || availableDates.length > 1) && (
                    <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-2">
                      <label className="text-xs text-muted-foreground shrink-0">Filter:</label>
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
                      <Button
                        variant={groupBySlot ? "default" : "outline"}
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setGroupBySlot((v) => !v)}
                        title="Toggle grouping by time slot"
                      >
                        {groupBySlot ? "Grouped by slot" : "Group by slot"}
                      </Button>
                      {(poolFilter !== "all" || dateFilter !== "all") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => { setPoolFilter("all"); setDateFilter("all"); }}
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
                return (

                  <Card key={champ.id}>
                    <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-primary" /> {champ.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {GENDER_LABELS[champ.gender] || champ.gender} ·{" "}
                          {champ.match_type === "doubles" ? "Doubles" : "Singles"}
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
        opponentName={scheduleMatch ? `${sideLabel(scheduleMatch.player_a, scheduleMatch.partner_a, scheduleMatch.placeholder_a, (scheduleChamp as any)?.match_type === "doubles")} vs ${sideLabel(scheduleMatch.player_b, scheduleMatch.partner_b, scheduleMatch.placeholder_b, (scheduleChamp as any)?.match_type === "doubles")}` : undefined}
        durationMinutes={(scheduleChamp as any)?.match_duration_minutes ?? undefined}
      />

      <EnterResultDialog
        open={!!resultMatch}
        onOpenChange={(o) => { if (!o) setResultMatch(null); }}
        clubId={clubId}
        match={resultMatch}
        playerAName={resultMatch ? sideLabel(resultMatch.player_a, resultMatch.partner_a, resultMatch.placeholder_a, (resultChamp as any)?.match_type === "doubles") : ""}
        playerBName={resultMatch ? sideLabel(resultMatch.player_b, resultMatch.partner_b, resultMatch.placeholder_b, (resultChamp as any)?.match_type === "doubles") : ""}
        bestOf={(resultChamp as any)?.best_of}
        pointsTarget={(resultChamp as any)?.points_per_game}
        onSaved={() => {
          setResultMatch(null);
          qc.invalidateQueries({ queryKey: ["tournaments-all-matches", champIds] });
        }}
      />



    </div>
  );
}
