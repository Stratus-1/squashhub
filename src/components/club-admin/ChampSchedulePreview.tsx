import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Calendar as CalendarIcon, ChevronLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fromExt } from "@/lib/supabase-ext";
import { assignPools, entityIdForEntry, type Entry as SwissEntry } from "@/lib/swiss-pairing";
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
  const isSwiss = (champ as any)?.scoring_mode === "swiss";
  const swissCfg: Record<string, number> = ((champ as any)?.swiss_pools as any) || {};

  const poolByMatchId = useMemo(() => {
    const out = new Map<string, number>();
    if (!isSwiss) return out;
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
  }, [matches, entries, swissCfg, isSwiss, isDoubles]);

  const poolLetter = (p: number | null | undefined) => (p == null ? null : String.fromCharCode(64 + p));
  const poolOf = (m: any): number | null => m.pool_number ?? poolByMatchId.get(m.id) ?? null;
  const bucketKeyOf = (m: any) => `${m.group_number ?? "-"}|${poolOf(m) ?? "-"}`;

  const buckets = useMemo(() => {
    const seen = new Map<string, { key: string; group: number | null; pool: number | null; count: number }>();
    for (const m of matches as any[]) {
      const key = bucketKeyOf(m);
      const existing = seen.get(key);
      if (existing) { existing.count++; continue; }
      seen.set(key, { key, group: m.group_number ?? null, pool: poolOf(m), count: 1 });
    }
    return [...seen.values()].sort((a, b) => {
      const ga = a.group ?? 999; const gb = b.group ?? 999;
      if (ga !== gb) return ga - gb;
      return (a.pool ?? 999) - (b.pool ?? 999);
    });
  }, [matches, poolByMatchId]);

  const bucketColor = (key: string) => {
    const idx = buckets.findIndex((b) => b.key === key);
    if (idx < 0) return null;
    const hue = Math.round(((idx * 360) / Math.max(buckets.length, 1) + 15) % 360);
    return {
      border: `hsl(${hue} 70% 45%)`,
      bg: `hsl(${hue} 70% 45% / 0.10)`,
      chipBg: `hsl(${hue} 70% 45% / 0.18)`,
      chipText: `hsl(${hue} 70% 30%)`,
    };
  };

  const bucketLabel = (b: { group: number | null; pool: number | null }) => {
    const parts: string[] = [];
    if (b.group != null) parts.push(getGroupLabel(champ, b.group));
    const pl = poolLetter(b.pool);
    if (pl) parts.push(`Pool ${pl}`);
    return parts.join(" · ") || "Unassigned";
  };

  const [poolFilter, setPoolFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

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
    const teamA = isDoubles ? getTeam(m.player_a, m.partner_a) : getName(m.player_a);
    const teamB = isDoubles ? getTeam(m.player_b, m.partner_b) : getName(m.player_b);
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

    return (
      <div
        key={m.id}
        style={rowStyle}
        className={cn(
          "w-full flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm p-2 rounded",
          !color && "bg-muted/50",
        )}
      >
        <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground shrink-0 w-24">
          {matchDate ? format(matchDate, "EEE dd MMM") : "TBD"}
        </span>
        <span className="text-muted-foreground shrink-0 w-12">{m.scheduled_time?.slice(0, 5) || ""}</span>
        <span className="font-medium flex-1 min-w-0 truncate">
          {teamA} <span className="text-muted-foreground">vs</span> {teamB}
        </span>
        {bMeta && (bMeta.group != null || bMeta.pool != null) && (
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
              <span className="text-xs text-muted-foreground ml-auto">
                Showing {filtered.length} of {matches.length}
              </span>
            </div>

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
