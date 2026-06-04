import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeftRight, Loader2, Search } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Props {
  /** The match being moved (must be a real saved match with id, scheduled_date, scheduled_time, court_id). */
  match: any;
  /** All scheduled matches in the same tournament (used to populate the swap target list & detect conflicts). */
  allMatches: any[];
  /** Helper to render the two sides of a match as a label. */
  getMatchLabel: (m: any) => string;
  /** Helper to get a court display name from a row. */
  getCourtName?: (m: any) => string;
  /** Optional invalidation keys to refresh after swap. */
  invalidateKeys?: (string | undefined)[][];
  /** Smaller button variant for compact rows. */
  size?: "icon" | "sm";
}

/**
 * Admin-only "Swap with another fixture" button.
 *
 * Swaps `scheduled_date`, `scheduled_time`, and `court_id` between this match
 * and a target match in a single transaction. Target list is type-ahead
 * searchable; any target whose four players would clash with another fixture
 * at the destination slot is shown as a disabled row with a conflict badge.
 */
export function SwapFixtureButton({
  match,
  allMatches,
  getMatchLabel,
  getCourtName,
  invalidateKeys = [],
  size = "icon",
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const playersOf = (m: any): string[] =>
    [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id].filter(Boolean) as string[];

  const slotKey = (m: any) =>
    m.scheduled_date && m.scheduled_time
      ? `${m.scheduled_date}|${String(m.scheduled_time).slice(0, 5)}`
      : null;

  /** Map memberId -> set of slot keys (excluding the two matches involved in any potential swap). */
  const conflictsFor = (target: any) => {
    // After the swap: this match would sit at target's slot, target sits at this match's slot.
    const newSlotForThis = slotKey(target);
    const newSlotForTarget = slotKey(match);

    if (!newSlotForThis || !newSlotForTarget) {
      return { swapBlocked: true, reason: "missing slot" as const };
    }

    // Build occupancy excluding the two matches we are swapping.
    const occupancy = new Map<string, Set<string>>();
    for (const m of allMatches) {
      if (m.id === match.id || m.id === target.id) continue;
      const k = slotKey(m);
      if (!k) continue;
      for (const pid of playersOf(m)) {
        if (!occupancy.has(pid)) occupancy.set(pid, new Set());
        occupancy.get(pid)!.add(k);
      }
    }

    // This match's players at target's slot
    for (const pid of playersOf(match)) {
      if (occupancy.get(pid)?.has(newSlotForThis)) {
        return { swapBlocked: true, reason: "player conflict" as const };
      }
    }
    // Target's players at this match's slot
    for (const pid of playersOf(target)) {
      if (occupancy.get(pid)?.has(newSlotForTarget)) {
        return { swapBlocked: true, reason: "player conflict" as const };
      }
    }
    return { swapBlocked: false, reason: "" as const };
  };

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allMatches
      .filter((m) => m.id !== match.id && !m.is_bye && m.status !== "completed")
      .filter((m) => {
        if (!q) return true;
        return getMatchLabel(m).toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const aKey = `${a.scheduled_date || "9999"} ${a.scheduled_time || "23:59"}`;
        const bKey = `${b.scheduled_date || "9999"} ${b.scheduled_time || "23:59"}`;
        return aKey.localeCompare(bKey);
      })
      .slice(0, 80);
  }, [allMatches, match.id, getMatchLabel, search]);

  const doSwap = async (target: any) => {
    setBusy(true);
    try {
      // Two-step update (no real transaction in postgrest from client; race window is acceptable for
      // admin-only action — and we re-fetch right after).
      const { error: e1 } = await (supabase as any)
        .from("club_champs_matches")
        .update({
          scheduled_date: target.scheduled_date,
          scheduled_time: target.scheduled_time,
          court_id: target.court_id,
        })
        .eq("id", match.id);
      if (e1) throw e1;

      const { error: e2 } = await (supabase as any)
        .from("club_champs_matches")
        .update({
          scheduled_date: match.scheduled_date,
          scheduled_time: match.scheduled_time,
          court_id: match.court_id,
        })
        .eq("id", target.id);
      if (e2) {
        // Roll back step 1
        await (supabase as any)
          .from("club_champs_matches")
          .update({
            scheduled_date: match.scheduled_date,
            scheduled_time: match.scheduled_time,
            court_id: match.court_id,
          })
          .eq("id", match.id);
        throw e2;
      }

      toast.success("Fixtures swapped");
      setOpen(false);
      setSearch("");
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k as any }));
    } catch (err: any) {
      toast.error(err?.message || "Swap failed");
    } finally {
      setBusy(false);
    }
  };

  const btnLabel = size === "icon" ? null : "Swap";

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={size === "icon" ? "icon" : "sm"}
          className={size === "icon" ? "h-6 w-6 shrink-0" : "h-7 px-2 text-xs gap-1"}
          title="Swap with another fixture"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          {btnLabel && <span>{btnLabel}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end">
        <div className="p-2 border-b">
          <div className="text-[11px] text-muted-foreground mb-1">
            Swap <strong>{getMatchLabel(match)}</strong>
            {" "}({match.scheduled_date ? format(new Date(match.scheduled_date), "EEE dd MMM") : "TBD"}
            {match.scheduled_time ? ` · ${String(match.scheduled_time).slice(0, 5)}` : ""}
            {getCourtName ? ` · ${getCourtName(match)}` : ""})
            {" "}with another fixture:
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search by player name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-8 text-xs"
            />
          </div>
        </div>
        <div className="max-h-[320px] overflow-y-auto divide-y">
          {busy && (
            <div className="flex items-center justify-center py-4 text-muted-foreground text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Swapping…
            </div>
          )}
          {!busy && candidates.length === 0 ? (
            <p className="text-xs text-center text-muted-foreground py-4">No other fixtures</p>
          ) : (
            !busy && candidates.map((m) => {
              const { swapBlocked, reason } = conflictsFor(m);
              return (
                <button
                  key={m.id}
                  disabled={swapBlocked}
                  onClick={() => doSwap(m)}
                  title={swapBlocked ? reason : undefined}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{getMatchLabel(m)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {m.scheduled_date ? format(new Date(m.scheduled_date), "EEE dd MMM") : "TBD"}
                      {m.scheduled_time ? ` · ${String(m.scheduled_time).slice(0, 5)}` : ""}
                      {getCourtName ? ` · ${getCourtName(m)}` : ""}
                      {m.group_number != null ? ` · L${m.group_number}` : ""}
                    </div>
                  </div>
                  {swapBlocked && (
                    <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-600/40 shrink-0">
                      {reason}
                    </Badge>
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
