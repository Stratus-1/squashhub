import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** All tournaments the admin can add slots to. */
  champs: Array<{ id: string; name: string }>;
  /** All existing matches — used to derive courts & default group per champ. */
  allMatches: any[];
  /** Court list derived from matches (id → name). */
  invalidateKeys?: (string | undefined)[][];
  /** Preselected champ id if the caller already knows the tournament. */
  defaultChampId?: string;
}

/**
 * Admin-only dialog to insert one or more empty schedule slots ("placeholders")
 * into a tournament. Each selected court gets its own row so an admin can then
 * drag/swap real matches into them from the Upcoming list.
 */
export function AddSlotDialog({ open, onOpenChange, champs, allMatches, invalidateKeys = [], defaultChampId }: Props) {
  const qc = useQueryClient();
  const [champId, setChampId] = useState<string>(defaultChampId || champs[0]?.id || "");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [courtIds, setCourtIds] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  // Derive available courts from the tournament's existing matches
  const courts = useMemo(() => {
    const seen = new Map<number, string>();
    for (const m of allMatches) {
      if (m.champ_id !== champId) continue;
      if (m.court_id && m.court?.name) seen.set(m.court_id, m.court.name);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [allMatches, champId]);

  const courtOptions = useMemo(() => {
    const seen = new Set<string>();
    return courts.filter((court) => {
      const key = String(court.name || "").trim().toLowerCase() || `__court_${court.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [courts]);

  // Suggest a group_number that already exists in the tournament
  const defaultGroup = useMemo(() => {
    for (const m of allMatches) {
      if (m.champ_id === champId && m.group_number != null) return m.group_number as number;
    }
    return 1;
  }, [allMatches, champId]);

  const toggleCourt = (id: number) => {
    setCourtIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => {
    setDate("");
    setTime("");
    setCourtIds(new Set());
  };

  const canSubmit = !!champId && !!date && !!time && courtIds.size > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const rows = [...courtIds].map((cid) => ({
        champ_id: champId,
        group_number: defaultGroup,
        round_number: 99,
        scheduled_date: date,
        scheduled_time: time.length === 5 ? `${time}:00` : time,
        court_id: cid,
        status: "placeholder",
        placeholder_a: "Empty slot",
        placeholder_b: "Drag a match here",
      }));
      const { error } = await (supabase as any).from("club_champs_matches").insert(rows);
      if (error) throw error;
      toast.success(`Added ${rows.length} empty slot${rows.length === 1 ? "" : "s"}`);
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k as any }));
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to add slot");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add empty time slot</DialogTitle>
          <DialogDescription className="text-xs">
            Creates a blank cell you can drag a pair into. Books the court so nothing else can schedule over it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {champs.length > 1 && (
            <div>
              <Label className="text-xs">Tournament</Label>
              <Select value={champId} onValueChange={(v) => { setChampId(v); setCourtIds(new Set()); }}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {champs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 text-sm mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Courts</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {courtOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">No courts found for this tournament yet.</p>
              )}
              {courtOptions.map((c) => {
                const active = courtIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCourt(c.id)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded border transition-colors",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border",
                    )}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            Add slot{courtIds.size > 1 ? `s (${courtIds.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
