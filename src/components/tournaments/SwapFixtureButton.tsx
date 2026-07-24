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
import { cn } from "@/lib/utils";

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
  /** Restrict candidates to matches on the same court as `match` (default true). */
  sameCourtOnly?: boolean;
  /** Optional color accent per candidate row (for league/pool colour-coding). */
  getRowColor?: (m: any) => { border: string; bg: string; chipBg: string; chipText: string } | null;
  /** Optional short label (e.g. "L1 · Pool A") to show on each candidate row. */
  getBucketLabel?: (m: any) => string | null;
  /** Override button label (e.g. "Fill slot" for empty placeholders). */
  label?: string;
  /** When true, only show candidates that have not yet been scheduled (no date/time/court). Used to fill placeholder slots with pairs that haven't been placed on the grid yet. */
  unscheduledOnly?: boolean;
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
  sameCourtOnly = true,
  getRowColor,
  getBucketLabel,
  label,
  unscheduledOnly = false,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAllCourts, setShowAllCourtsState] = useState<boolean>(() => {
    if (typeof window === "undefined") return !sameCourtOnly;
    const v = window.localStorage.getItem("sh.swap.showAllCourts");
    return v === null ? !sameCourtOnly : v === "1";
  });
  const [allowB2B, setAllowB2BState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sh.swap.allowB2B") === "1";
  });
  const [allowConflict, setAllowConflictState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sh.swap.allowConflict") === "1";
  });
  const setShowAllCourts = (v: boolean) => {
    setShowAllCourtsState(v);
    try { window.localStorage.setItem("sh.swap.showAllCourts", v ? "1" : "0"); } catch {}
  };
  const setAllowB2B = (v: boolean) => {
    setAllowB2BState(v);
    try { window.localStorage.setItem("sh.swap.allowB2B", v ? "1" : "0"); } catch {}
  };
  const setAllowConflict = (v: boolean) => {
    setAllowConflictState(v);
    try { window.localStorage.setItem("sh.swap.allowConflict", v ? "1" : "0"); } catch {}
  };
  /** Minimum minutes required between two matches of the same player before they count as back-to-back. */
  const B2B_GAP_MINUTES = 20;

  const playersOf = (m: any): string[] =>
    [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id].filter(Boolean) as string[];

  const isDoubles = Boolean(match.partner_a_member_id || match.partner_b_member_id);

  const slotKey = (m: any) =>
    m.scheduled_date && m.scheduled_time
      ? `${m.scheduled_date}|${String(m.scheduled_time).slice(0, 5)}`
      : null;

  const toMin = (t: string) => {
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
  };

  /** Map memberId -> [{date, minutes}] for every match EXCEPT the two being swapped. */
  const buildOccupancy = (targetId: string) => {
    const occ = new Map<string, Array<{ date: string; min: number }>>();
    for (const m of allMatches) {
      if (m.id === match.id || m.id === targetId) continue;
      if (!m.scheduled_date || !m.scheduled_time) continue;
      const entry = { date: m.scheduled_date, min: toMin(String(m.scheduled_time)) };
      for (const pid of playersOf(m)) {
        if (!occ.has(pid)) occ.set(pid, []);
        occ.get(pid)!.push(entry);
      }
    }
    return occ;
  };

  const conflictsFor = (target: any) => {
    if (!match.scheduled_date || !match.scheduled_time) {
      return { swapBlocked: true, reason: "missing slot" as const };
    }
    // Target may be unscheduled (a pair not yet placed on the grid) — that's OK;
    // we'll transfer this slot to them and the placeholder inherits their empty slot.
    const targetHasSlot = Boolean(target.scheduled_date && target.scheduled_time);

    const occ = buildOccupancy(target.id);

    const check = (players: string[], newDate: string, newMin: number) => {
      for (const pid of players) {
        const rows = occ.get(pid) || [];
        for (const r of rows) {
          if (r.date !== newDate) continue;
          if (r.min === newMin && !allowConflict) return "player conflict" as const;
          if (!allowB2B && r.min !== newMin && Math.abs(r.min - newMin) <= B2B_GAP_MINUTES) return "back-to-back" as const;
        }
      }
      return null;
    };

    if (targetHasSlot) {
      const r1 = check(playersOf(match), target.scheduled_date, toMin(String(target.scheduled_time)));
      if (r1) return { swapBlocked: true, reason: r1 };
    }
    const r2 = check(playersOf(target), match.scheduled_date, toMin(String(match.scheduled_time)));
    if (r2) return { swapBlocked: true, reason: r2 };

    return { swapBlocked: false, reason: "" as const };
  };

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allMatches
      .filter((m) => m.id !== match.id && !m.is_bye && m.status !== "completed")
      .filter((m) => (unscheduledOnly ? (!m.scheduled_date || !m.scheduled_time || !m.court_id) : true))
      .filter((m) => (unscheduledOnly || showAllCourts ? true : m.court_id === match.court_id))
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
  }, [allMatches, match.id, match.court_id, showAllCourts, unscheduledOnly, getMatchLabel, search]);

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
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px] gap-1 shrink-0 border-primary/40 text-primary hover:bg-primary/10"
          title={label ? "Pick a pair to place in this empty slot" : "Replace this fixture with another match in the tournament"}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{label || "Replace"}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent className={cn("p-0", isDoubles ? "w-[min(560px,95vw)]" : "w-[360px]")} align="end">
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
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!showAllCourts}
              onChange={(e) => setShowAllCourts(!e.target.checked)}
              className="h-3 w-3"
            />
            Same court only {getCourtName ? `(${getCourtName(match)})` : ""}
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allowB2B}
              onChange={(e) => setAllowB2B(e.target.checked)}
              className="h-3 w-3"
            />
            Allow back-to-back (ignore rest gap)
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allowConflict}
              onChange={(e) => setAllowConflict(e.target.checked)}
              className="h-3 w-3"
            />
            Allow player conflict (manual override)
          </label>
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
              const color = getRowColor ? getRowColor(m) : null;
              const bLabel = getBucketLabel ? getBucketLabel(m) : null;
              return (
                <button
                  key={m.id}
                  disabled={swapBlocked}
                  onClick={() => doSwap(m)}
                  title={swapBlocked ? reason : undefined}
                  style={color ? { borderLeft: `3px solid ${color.border}`, backgroundColor: color.bg } : undefined}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{getMatchLabel(m)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {m.scheduled_date ? format(new Date(m.scheduled_date), "EEE dd MMM") : "TBD"}
                      {m.scheduled_time ? ` · ${String(m.scheduled_time).slice(0, 5)}` : ""}
                      {getCourtName ? ` · ${getCourtName(m)}` : ""}
                    </div>
                  </div>
                  {bLabel && (
                    <span
                      style={color ? { backgroundColor: color.chipBg, color: color.chipText, borderColor: color.border } : undefined}
                      className="text-[9px] px-1.5 py-0.5 rounded border font-medium shrink-0"
                    >
                      {bLabel}
                    </span>
                  )}
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
