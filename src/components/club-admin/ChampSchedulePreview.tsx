import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Calendar as CalendarIcon, ChevronLeft, Check, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { assignPools, entityIdForEntry, type Entry as SwissEntry } from "@/lib/swiss-pairing";
import { getBucketColor, buildBucketColorMap } from "@/lib/tournament-colors";
import { getGroupLabel } from "@/lib/tournament-formats/group-labels";
import { cn } from "@/lib/utils";

interface Props {
  champId: string;
  onBack: () => void;
  onFinalize: () => void;
  onMakeBookings: () => void;
  isBooking?: boolean;
}

/**
 * Post-rebuild preview shown inside the tournament wizard. Renders the
 * full generated schedule (like the Tournaments → Upcoming page) with
 * league/pool + date filters and colour-coding so the admin can review
 * before finalizing, or step back to tweak and rebuild again.
 */
export function ChampSchedulePreview({ champId, onBack, onFinalize, onMakeBookings, isBooking }: Props) {
  const { data: champ } = useQuery({
    queryKey: ["champ-preview-champ", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs").select("*").eq("id", champId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["champ-preview-entries", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_entries")
        .select("*, member:club_member_id(id, name, profiles:user_id(name)), partner:partner_member_id(id, name, profiles:user_id(name))")
        .eq("champ_id", champId);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["champ-preview-matches", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_matches")
        .select("*, player_a:player_a_member_id(id, name, profiles:user_id(name)), player_b:player_b_member_id(id, name, profiles:user_id(name)), partner_a:partner_a_member_id(id, name, profiles:user_id(name)), partner_b:partner_b_member_id(id, name, profiles:user_id(name)), court:court_id(name)")
        .eq("champ_id", champId)
        .order("scheduled_date")
        .order("scheduled_time");
      if (error) throw error;
      return data || [];
    },
  });

  const isDoubles = (champ as any)?.match_type === "doubles";
  const swissCfg: Record<string, number> = ((champ as any)?.swiss_pools as any) || {};

  const poolByMatchId = useMemo(() => {
    const out = new Map<string, number>();
    if (!Object.values(swissCfg).some((v) => Number(v) > 1)) return out;
    const groupNums = [...new Set((entries as any[]).map((e) => e.group_number))] as number[];
    const groupPoolMaps = new Map<number, Map<string, number>>();
    for (const gn of groupNums) {
      const pc = Math.max(1, Number(swissCfg[String(gn)]) || 1);
      if (pc <= 1) continue;
      groupPoolMaps.set(gn, assignPools(entries as SwissEntry[], gn, pc, isDoubles));
    }
    for (const m of matches as any[]) {
      if (m.pool_number != null) { out.set(m.id, m.pool_number); continue; }
      const poolMap = groupPoolMaps.get(m.group_number);
      if (!poolMap) continue;
      const memberIds: string[] = [m.player_a_member_id, m.partner_a_member_id, m.player_b_member_id, m.partner_b_member_id].filter(Boolean);
      for (const mid of memberIds) {
        const e = (entries as any[]).find(
          (x) => x.group_number === m.group_number && (x.club_member_id === mid || x.partner_member_id === mid),
        );
        if (!e) continue;
        const p = poolMap.get(entityIdForEntry(e as SwissEntry, isDoubles));
        if (p) { out.set(m.id, p); break; }
      }
    }
    return out;
  }, [matches, entries, swissCfg, isDoubles]);

  const poolLetter = (p: number | null | undefined) => (p == null ? null : String.fromCharCode(64 + p));
  // Authoritative order: the pool stored on the fixture, then the knockout
  // section it was drawn into (sections mirror pools), and only then the
  // recomputed snake fallback for legacy fixtures that carry neither.
  const poolOf = (m: any): number | null =>
    m.pool_number ?? m.section_number ?? poolByMatchId.get(m.id) ?? null;
  const isPlayoff = (m: any) => typeof m?.stage === "string" && m.stage.startsWith("playoff");
  // All playoff stages collapse into a single "Play-offs" bucket so the
  // filter dropdown stays short — one entry instead of one per final.
  const bucketKeyOf = (m: any) =>
    isPlayoff(m)
      ? `playoff|all`
      : `${m.group_number ?? "-"}|${poolOf(m) ?? "-"}`;

  const buckets = useMemo(() => {
    const seen = new Map<string, { key: string; group: number | null; pool: number | null; stage: string | null; stageLabel: string | null; count: number }>();
    for (const m of matches as any[]) {
      const key = bucketKeyOf(m);
      const existing = seen.get(key);
      if (existing) { existing.count++; continue; }
      seen.set(key, {
        key,
        group: isPlayoff(m) ? null : (m.group_number ?? null),
        pool: isPlayoff(m) ? null : poolOf(m),
        stage: isPlayoff(m) ? "playoff" : null,
        stageLabel: isPlayoff(m) ? "Play-offs" : null,
        count: 1,
      });
    }
    return [...seen.values()].sort((a, b) => {
      if (!!a.stage !== !!b.stage) return a.stage ? 1 : -1;
      const ga = a.group ?? 999; const gb = b.group ?? 999;
      if (ga !== gb) return ga - gb;
      return (a.pool ?? 999) - (b.pool ?? 999);
    });
  }, [matches, poolByMatchId]);

  // Distinct colour per league/pool bucket so pools within the same league
  // never share a colour.
  const bucketColorMap = useMemo(
    () => buildBucketColorMap(buckets.map((b) => b.key)),
    [buckets]
  );
  const bucketColor = (key: string) => bucketColorMap.get(key) ?? getBucketColor(key);

  const bucketLabel = (b: { group: number | null; pool: number | null; stage?: string | null; stageLabel?: string | null }) => {
    if (b.stage) return b.stageLabel || "Play-offs";
    const parts: string[] = [];
    if (b.group != null) parts.push(getGroupLabel(champ, b.group));
    const pl = poolLetter(b.pool);
    if (pl) parts.push(`Pool ${pl}`);
    return parts.join(" · ") || "Unassigned";
  };

  const [poolFilter, setPoolFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [sameCourtOnly, setSameCourtOnly] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const qc = useQueryClient();

  const playersOf = (m: any): string[] =>
    [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id].filter(Boolean) as string[];
  const slotKey = (m: any) =>
    m.scheduled_date && m.scheduled_time ? `${m.scheduled_date}|${String(m.scheduled_time).slice(0, 5)}` : null;

  const timesByDate = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of matches as any[]) {
      if (!m.scheduled_date || !m.scheduled_time) continue;
      const t = String(m.scheduled_time).slice(0, 5);
      if (!map.has(m.scheduled_date)) map.set(m.scheduled_date, []);
      const arr = map.get(m.scheduled_date)!;
      if (!arr.includes(t)) arr.push(t);
    }
    for (const arr of map.values()) arr.sort();
    return map;
  }, [matches]);

  const adjacentSlotKeys = (date: string | null, time: string | null): string[] => {
    if (!date || !time) return [];
    const arr = timesByDate.get(date) || [];
    const t = String(time).slice(0, 5);
    const i = arr.indexOf(t);
    const out: string[] = [];
    if (i > 0) out.push(`${date}|${arr[i - 1]}`);
    if (i >= 0 && i < arr.length - 1) out.push(`${date}|${arr[i + 1]}`);
    return out;
  };

  const canSwap = (a: any, b: any): { ok: boolean; reason?: string } => {
    if (!a || !b || a.id === b.id) return { ok: false, reason: "same match" };
    if (a.status === "completed" || b.status === "completed") return { ok: false, reason: "completed" };
    const sA = slotKey(a); const sB = slotKey(b);
    if (!sA || !sB) return { ok: false, reason: "unscheduled" };
    if (sameCourtOnly && a.court_id !== b.court_id) return { ok: false, reason: "different court" };
    // Player conflict + back-to-back check
    const occ = new Map<string, Set<string>>();
    for (const m of matches as any[]) {
      if (m.id === a.id || m.id === b.id) continue;
      const k = slotKey(m); if (!k) continue;
      for (const pid of playersOf(m)) {
        if (!occ.has(pid)) occ.set(pid, new Set());
        occ.get(pid)!.add(k);
      }
    }
    for (const pid of playersOf(a)) if (occ.get(pid)?.has(sB)) return { ok: false, reason: "player conflict" };
    for (const pid of playersOf(b)) if (occ.get(pid)?.has(sA)) return { ok: false, reason: "player conflict" };
    const adjForA = adjacentSlotKeys(b.scheduled_date, b.scheduled_time);
    for (const pid of playersOf(a)) if (adjForA.some((k) => occ.get(pid)?.has(k))) return { ok: false, reason: "back-to-back" };
    const adjForB = adjacentSlotKeys(a.scheduled_date, a.scheduled_time);
    for (const pid of playersOf(b)) if (adjForB.some((k) => occ.get(pid)?.has(k))) return { ok: false, reason: "back-to-back" };
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
      qc.invalidateQueries({ queryKey: ["champ-preview-matches", champId] });
    } catch (err: any) {
      toast.error(err?.message || "Swap failed");
    } finally {
      setSwapping(false);
      setDragId(null);
      setHoverId(null);
    }
  };

  const availableDates = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches as any[]) if (m.scheduled_date) set.add(m.scheduled_date);
    return [...set].sort();
  }, [matches]);

  const filtered = (matches as any[]).filter(
    (m) =>
      (poolFilter === "all" || bucketKeyOf(m) === poolFilter) &&
      (dateFilter === "all" || m.scheduled_date === dateFilter),
  );

  const getName = (p: any) => p?.name || p?.profiles?.name || "Unknown";
  const getTeam = (a: any, b: any) => (b ? `${getName(a)} & ${getName(b)}` : getName(a));

  const renderRow = (m: any) => {
    // Placeholder-aware side label — reserved playoff/finals slots have no
    // player yet but carry a human-readable placeholder ("Winner Pool A").
    const teamA = !m.player_a && m.placeholder_a
      ? m.placeholder_a
      : (isDoubles ? getTeam(m.player_a, m.partner_a) : getName(m.player_a));
    const teamB = !m.player_b && m.placeholder_b
      ? m.placeholder_b
      : (isDoubles ? getTeam(m.player_b, m.partner_b) : getName(m.player_b));

    const matchDate = m.scheduled_date ? new Date(m.scheduled_date) : null;
    const bKey = bucketKeyOf(m);
    const bMeta = buckets.find((x) => x.key === bKey) || null;
    const color = bucketColor(bKey);
    const rowStyle = color
      ? { borderLeft: `4px solid ${color.border}`, backgroundColor: color.bg }
      : undefined;
    const chipStyle = color
      ? { backgroundColor: color.chipBg, color: color.chipText, borderColor: color.border }
      : undefined;

    const isDragging = dragId === m.id;
    const isHovered = hoverId === m.id && dragId && dragId !== m.id;
    const draggingMatch = dragId ? (matches as any[]).find((x) => x.id === dragId) : null;
    const hoverCheck = isHovered && draggingMatch ? canSwap(draggingMatch, m) : null;
    const isValidDrop = hoverCheck?.ok;
    const isInvalidDrop = isHovered && hoverCheck && !hoverCheck.ok;
    const isCompleted = m.status === "completed";

    return (
      <div
        key={m.id}
        draggable={!isCompleted && !swapping}
        onDragStart={(e) => { setDragId(m.id); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDragId(null); setHoverId(null); }}
        onDragOver={(e) => { if (dragId && dragId !== m.id) { e.preventDefault(); setHoverId(m.id); } }}
        onDragLeave={() => { if (hoverId === m.id) setHoverId(null); }}
        onDrop={(e) => {
          e.preventDefault();
          if (!draggingMatch) return;
          const chk = canSwap(draggingMatch, m);
          if (!chk.ok) { toast.error(`Cannot swap: ${chk.reason}`); setDragId(null); setHoverId(null); return; }
          doSwap(draggingMatch, m);
        }}
        style={rowStyle}
        className={cn(
          "w-full flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm p-2 rounded transition-all",
          !color && "bg-muted/50",
          !isCompleted && !swapping && "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-40",
          isValidDrop && "ring-2 ring-green-500",
          isInvalidDrop && "ring-2 ring-red-500",
        )}
      >
        <GripVertical className={cn("w-3.5 h-3.5 shrink-0", isCompleted ? "text-transparent" : "text-muted-foreground/60")} />
        <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground shrink-0 w-24">
          {matchDate ? format(matchDate, "EEE dd MMM") : "TBD"}
        </span>
        <span className="text-muted-foreground shrink-0 w-12">{m.scheduled_time?.slice(0, 5) || ""}</span>
        <span className="font-medium flex-1 min-w-0 truncate">
          {teamA} <span className="text-muted-foreground">vs</span> {teamB}
        </span>
        {bMeta && (bMeta.group != null || bMeta.pool != null || bMeta.stage) && (
          <span
            style={chipStyle}
            className="text-[10px] shrink-0 px-1.5 py-0.5 rounded border font-medium"
          >
            {bucketLabel(bMeta)}
          </span>
        )}
        {m.court && <Badge variant="outline" className="text-[10px] shrink-0">{m.court.name}</Badge>}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview Schedule</CardTitle>
        <p className="text-xs text-muted-foreground">
          Review the generated fixtures before finalizing. Go back to change players, pairings or dates and rebuild.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading schedule…
          </div>
        ) : matches.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No matches were generated.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="h-8 text-xs w-auto min-w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All dates ({matches.length})</SelectItem>
                  {availableDates.map((d) => {
                    const count = (matches as any[]).filter((m) => m.scheduled_date === d).length;
                    return (
                      <SelectItem key={d} value={d}>
                        {format(new Date(d), "EEE dd MMM")} ({count})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Select value={poolFilter} onValueChange={setPoolFilter}>
                <SelectTrigger className="h-8 text-xs w-auto min-w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All leagues & pools ({matches.length})</SelectItem>
                  {buckets.map((b) => {
                    const color = bucketColor(b.key);
                    return (
                      <SelectItem key={b.key} value={b.key}>
                        <span className="flex items-center gap-2">
                          {color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color.border }} />}
                          {bucketLabel(b)} ({b.count})
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {(poolFilter !== "all" || dateFilter !== "all") && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setPoolFilter("all"); setDateFilter("all"); }}>
                  Clear
                </Button>
              )}
              <span className="text-xs text-muted-foreground ml-auto flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox checked={sameCourtOnly} onCheckedChange={(v) => setSameCourtOnly(!!v)} className="h-3.5 w-3.5" />
                  <span>Same court only</span>
                </label>
                <span>Showing {filtered.length} of {matches.length}</span>
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Tip: drag any row onto another to swap their date, time & court. Player-conflict and completed matches are blocked.
            </p>

            <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
              {filtered.map(renderRow)}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No matches match these filters.</p>
              )}
            </div>

            <Separator />

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border p-3 bg-muted/30">
              <div className="text-sm">
                <p className="font-medium">Make court bookings</p>
                <p className="text-xs text-muted-foreground">
                  Reserve each scheduled match on its assigned court. Already-booked slots are skipped.
                </p>
              </div>
              <Button variant="secondary" onClick={onMakeBookings} disabled={isBooking}>
                {isBooking && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                <CalendarIcon className="w-4 h-4 mr-1" /> Make Court Bookings
              </Button>
            </div>
          </>
        )}

        <Separator />

        <div className="flex justify-between items-center gap-2">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Edit
          </Button>
          <Button onClick={onFinalize}>
            <Check className="w-4 h-4 mr-1" /> Finalize
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
