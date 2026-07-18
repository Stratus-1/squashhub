import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { SEO } from "@/components/SEO";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Trophy, ChevronRight, Loader2, Calendar, User, BarChart3, Gavel, Settings2, Printer, BellRing } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { useMemberContext } from "@/contexts/MemberContext";
import { useNavigate } from "react-router-dom";
import { format, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinalizeTournamentSetupDialog } from "@/components/tournaments/FinalizeTournamentSetupDialog";
import { getTournamentFormat } from "@/lib/tournament-formats";
import { getGroupLabel } from "@/lib/tournament-formats/group-labels";
import { assignPools, entityIdForEntry, type Entry as SwissEntry } from "@/lib/swiss-pairing";

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

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isPastChamp = (c: any) =>
    c.status === "completed" || (c.end_date && c.end_date < todayStr);
  const champs = allChamps.filter((c: any) => !isPastChamp(c));
  const pastChamps = allChamps
    .filter(isPastChamp)
    .sort((a: any, b: any) => (b.end_date || "").localeCompare(a.end_date || ""));

  const champIds = allChamps.map((c: any) => c.id);

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
  // LIVE means an active marker is currently scoring. A scheduled Bells match
  // may still have a future bell_ends_at after the marker exits; that keeps the
  // countdown resumable without showing the flickering LIVE badge.
  const isLive = (m: any) => {
    if (m.status !== "in_progress") return false;
    const champ = allChamps.find((c: any) => c.id === m.champ_id);
    if (champ?.scoring_mode !== "time_capped_points") return true;
    const bellActive = !!m.bell_ends_at && new Date(m.bell_ends_at).getTime() > Date.now();
    const paused = typeof m.bell_paused_seconds === "number" && m.bell_paused_seconds > 0;
    return bellActive || paused;
  };
  const activeChampIds = new Set(champs.map((c: any) => c.id));
  const upcomingMatches = allMatches
    .filter((m: any) => activeChampIds.has(m.champ_id) && (m.status === "scheduled" || m.status === "in_progress" || isLive(m)) && m.status !== "completed" && (!m.scheduled_date || m.scheduled_date >= today))
    .sort((a: any, b: any) => {
      // Live matches float to the top
      const aLive = isLive(a);
      const bLive = isLive(b);
      if (aLive && !bLive) return -1;
      if (bLive && !aLive) return 1;
      const aKey = `${a.scheduled_date || "9999-12-31"} ${a.scheduled_time || "23:59:59"}`;
      const bKey = `${b.scheduled_date || "9999-12-31"} ${b.scheduled_time || "23:59:59"}`;
      return aKey.localeCompare(bKey);
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
      const champ = allChamps.find((c: any) => c.id === m.champ_id);
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
  }, [allChamps, allEntries, allMatches]);

  const poolOf = (m: any): number | null => (m.pool_number ?? poolByMatchId.get(m.id) ?? null);
  const isPlayoff = (m: any) => typeof m?.stage === "string" && m.stage.startsWith("playoff");
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
      const ca = allChamps.find((c: any) => c.id === a.champId)?.name || "";
      const cb = allChamps.find((c: any) => c.id === b.champId)?.name || "";
      if (ca !== cb) return ca.localeCompare(cb);
      if (!!a.stage !== !!b.stage) return a.stage ? 1 : -1;
      const ga = a.group ?? 999; const gb = b.group ?? 999;
      if (ga !== gb) return ga - gb;
      return (a.pool ?? 999) - (b.pool ?? 999);
    });
  }, [upcomingMatches, allChamps, poolByMatchId]);

  const bucketColor = (key: string) => {
    const idx = buckets.findIndex((b) => b.key === key);
    if (idx < 0) return null;
    // Evenly-spaced hues around the wheel with a small offset so first bucket
    // isn't pure red.
    const hue = Math.round(((idx * 360) / Math.max(buckets.length, 1) + 15) % 360);
    return {
      border: `hsl(${hue} 70% 45%)`,
      bg: `hsl(${hue} 70% 45% / 0.10)`,
      chipBg: `hsl(${hue} 70% 45% / 0.18)`,
      chipText: `hsl(${hue} 70% 30%)`,
    };
  };

  const bucketLabel = (b: { champId: string; group: number | null; pool: number | null; stage?: string | null; stageLabel?: string | null }, opts: { withChamp?: boolean } = {}) => {
    const champ = allChamps.find((c: any) => c.id === b.champId);
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

  const [poolFilter, setPoolFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

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


  const hcLabel = (h: any) => {
    const n = Number(h) || 0;
    return n !== 0 ? ` (${n > 0 ? "+" : ""}${n})` : "";
  };

  const renderMatchRow = (m: any) => {
    const champ = champs.find((c: any) => c.id === m.champ_id);
    const isDoubles = champ?.match_type === "doubles";
    const tournamentFormat = getTournamentFormat(champ?.scoring_mode);
    const teamA = sideLabel(m.player_a, m.partner_a, m.placeholder_a, isDoubles) + hcLabel(m.handicap_a ?? m.n_a);
    const teamB = sideLabel(m.player_b, m.partner_b, m.placeholder_b, isDoubles) + hcLabel(m.handicap_b ?? m.n_b);

    const matchDate = m.scheduled_date ? new Date(m.scheduled_date) : null;
    const today = matchDate && isToday(matchDate);
    const markRoute = tournamentFormat.markerRoute(m.id);

    const live = isLive(m);
    const aPts = m.side_a_points ?? 0;
    const bPts = m.side_b_points ?? 0;
    const aAhead = live && aPts > bPts;
    const bAhead = live && bPts > aPts;
    const teamAClass = aAhead
      ? "bg-green-500/20 text-green-700 dark:text-green-300 px-1 rounded"
      : bAhead
        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 px-1 rounded"
        : "";
    const teamBClass = bAhead
      ? "bg-green-500/20 text-green-700 dark:text-green-300 px-1 rounded"
      : aAhead
        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 px-1 rounded"
        : "";

    const bKey = bucketKeyOf(m);
    const bMeta = buckets.find((x) => x.key === bKey) || null;
    const color = bucketColor(bKey);
    const rowStyle = color
      ? { borderLeft: `4px solid ${color.border}`, backgroundColor: today ? undefined : color.bg }
      : undefined;
    const chipStyle = color
      ? { backgroundColor: color.chipBg, color: color.chipText, borderColor: color.border }
      : undefined;

    return (
      <div
        key={m.id}
        style={rowStyle}
        className={cn(
          "w-full flex flex-col sm:flex-row sm:items-center gap-2 text-sm p-2 rounded",
          today ? "bg-primary/10 border border-primary/20" : !color && "bg-muted/50",
        )}
      >
        <button
          onClick={() => navigate(`/club-champs/${m.champ_id}`)}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 flex-1 min-w-0 text-left hover:opacity-80"
        >
          <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground shrink-0">
            {matchDate ? format(matchDate, "EEE dd MMM") : "TBD"}
          </span>
          <span className="text-muted-foreground shrink-0">{m.scheduled_time?.slice(0, 5) || ""}</span>
          <span className="font-medium text-xs sm:text-sm truncate basis-full sm:basis-auto sm:flex-1 sm:min-w-0">
            <span className={teamAClass}>{teamA}</span>
            <span className="text-muted-foreground"> vs </span>
            <span className={teamBClass}>{teamB}</span>
          </span>
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
          {m.court && <Badge variant="outline" className="text-[10px] shrink-0">{m.court.name}</Badge>}
          {isLive(m) && (
            <span className="live-indicator text-[10px] shrink-0 px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current" /> LIVE {m.side_a_points ?? 0}-{m.side_b_points ?? 0}
            </span>
          )}
          {today && !isLive(m) && <Badge className="text-[10px] shrink-0">Today</Badge>}
        </button>

        <Button
          size="sm"
          variant="default"
          className="h-7 px-2 gap-1 shrink-0 self-end sm:self-auto animate-pulse-slow"
          title={tournamentFormat.key === "time_capped_points" ? "Start the bell timer and score this game" : "Open the marker to score this match"}
          onClick={(e) => {
            e.stopPropagation();
            navigate(markRoute);
          }}
        >
          {tournamentFormat.key === "time_capped_points"
            ? <BellRing className="w-3 h-3" />
            : <Gavel className="w-3 h-3" />} {tournamentFormat.markerLabel}
        </Button>
      </div>
    );
  };

  const getScheduleHeaders = (matches: any[]) => {
    // Only customise when every match belongs to the same cross-league tournament
    const champIds = [...new Set(matches.map((m) => m.champ_id))];
    if (champIds.length !== 1) return { a: "Player / Team A", b: "Player / Team B" };
    const champ = allChamps.find((c: any) => c.id === champIds[0]);
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
        const champ = allChamps.find((c: any) => c.id === m.champ_id);
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
      const champ = allChamps.find((c: any) => c.id === m.champ_id);
      const isDoubles = champ?.match_type === "doubles";
      const teamA = isDoubles ? getTeam(m.player_a, m.partner_a) : getName(m.player_a);
      const teamB = isDoubles ? getTeam(m.player_b, m.partner_b) : getName(m.player_b);
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
          <Tabs defaultValue={champs.length === 0 ? "past" : "upcoming"} className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-auto gap-1 bg-muted p-1">
              <TabsTrigger
                value="upcoming"
                className="text-sm py-2.5 font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                🗓️ Upcoming
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
                ✓ Past
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="w-4 h-4" /> Upcoming Tournaments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {champs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No upcoming tournaments.</p>
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> Tournament Games
                    </CardTitle>
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
                          <div className="space-y-1.5">{filteredUpcoming.map(renderMatchRow)}</div>
                        )}
                      </TabsContent>
                      <TabsContent value="mine" className="mt-0">
                        {filteredMine.length === 0 ? (
                          <p className="text-sm text-muted-foreground">None of your games match these filters.</p>
                        ) : (
                          <div className="space-y-1.5">{filteredMine.map(renderMatchRow)}</div>
                        )}
                      </TabsContent>
                    </Tabs>
                  ) : filteredUpcoming.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No scheduled games.</p>
                  ) : (
                    <div className="space-y-1.5">{filteredUpcoming.map(renderMatchRow)}</div>
                  )}

                </CardContent>

              </Card>
            </TabsContent>




            <TabsContent value="standings" className="mt-4 space-y-3">
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
                pastChamps.map((champ: any) => {
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
                          <Badge variant="secondary" className="text-[10px]">
                            {champ.status === "completed" ? "completed" : "ended"}
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
                })
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
    </div>
  );
}
