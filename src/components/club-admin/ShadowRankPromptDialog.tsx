import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { fromExt } from "@/lib/supabase-ext";
import type { MissingShadowRank, DivisionSizes } from "@/lib/tournament-formats/handicap";

/**
 * Prompts the admin to assign a "shadow rank" (division + slot) to every
 * reserve player taking part in a tournament that uses league-rank handicap
 * but who has no ladder placement of their own yet.
 *
 * The shadow rank is persisted on the reserve's `member_league_registrations`
 * row so the question is only asked once per reserve.
 */
export function ShadowRankPromptDialog({
  open,
  onOpenChange,
  missing,
  sizes,
  memberNames,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  missing: MissingShadowRank[];
  sizes: DivisionSizes;
  memberNames: Map<string, string>;
  onSaved: () => void;
}) {
  const divisions = Object.keys(sizes).map(Number).sort((a, b) => a - b);
  const maxDiv = divisions.length ? Math.max(...divisions) : 4;

  // local state: regId -> {division, slot}
  const [picks, setPicks] = useState<Record<string, { division: number; slot: number }>>({});
  const [saving, setSaving] = useState(false);

  // Initialise defaults whenever the dialog opens with a new set.
  useEffect(() => {
    if (!open) return;
    const init: Record<string, { division: number; slot: number }> = {};
    for (const m of missing) {
      const div = m.current_reserve_division || maxDiv || 1;
      const size = sizes[div] || 5;
      init[m.registration_id || m.member_id] = { division: div, slot: size + 1 };
    }
    setPicks(init);
  }, [open, missing, maxDiv, sizes]);

  const save = async () => {
    setSaving(true);
    try {
      for (const m of missing) {
        const p = picks[m.registration_id || m.member_id];
        if (!p || !(p.division > 0) || !(p.slot > 0)) {
          throw new Error(`Pick a division & slot for ${memberNames.get(m.member_id) || "reserve"}`);
        }
      }
      // Persist sequentially — small N, simpler error handling.
      for (const m of missing) {
        const p = picks[m.registration_id || m.member_id];
        if (m.needs_insert) {
          const { error } = await fromExt("member_league_registrations").insert({
            club_member_id: m.member_id,
            league_id: m.league_id,
            is_reserve: true,
            shadow_division: p.division,
            shadow_player_rank: p.slot,
          });
          if (error) throw error;
        } else {
          const { error } = await fromExt("member_league_registrations")
            .update({
              shadow_division: p.division,
              shadow_player_rank: p.slot,
            })
            .eq("id", m.registration_id);
          if (error) throw error;
        }
      }
      toast.success(`Saved shadow rank for ${missing.length} reserve${missing.length === 1 ? "" : "s"}`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save shadow ranks");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Shadow-rank reserves for handicap
          </DialogTitle>
          <DialogDescription>
            These reserve players have no league ranking yet. Assign each one a{" "}
            <strong>Division</strong> + <strong>Slot</strong> so the league-rank handicap
            can place them. You only have to answer this once per reserve — the value is
            saved on their reserve registration and reused everywhere.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {missing.map((m) => {
            const p = picks[m.registration_id || m.member_id] || { division: 1, slot: 1 };
            const sizeForDiv = sizes[p.division] || 5;
            const divOptions = Array.from(
              new Set([...divisions, p.division, m.current_reserve_division || maxDiv, maxDiv].filter(Boolean))
            ).sort((a, b) => a - b);
            const ord = (n: number) => {
              const s = ["th","st","nd","rd"], v = n % 100;
              return n + (s[(v - 20) % 10] || s[v] || s[0]);
            };
            return (
              <div key={m.registration_id || m.member_id} className="rounded border p-2 space-y-1.5 bg-muted/30">
                <div className="text-xs font-medium">
                  {memberNames.get(m.member_id) || "Reserve"}
                  <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                    ({m.league_name})
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">
                      League tier <span className="opacity-60">(1 = strongest)</span>
                    </Label>
                    <Select
                      value={String(p.division)}
                      onValueChange={(v) => {
                        const n = Math.max(1, parseInt(v) || 1);
                        setPicks((prev) => ({ ...prev, [m.registration_id || m.member_id]: { ...p, division: n } }));
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {divOptions.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {ord(d)} League{d === (m.current_reserve_division || maxDiv) ? " (their reserve tier)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">
                      Position in tier <span className="opacity-60">(team size {sizeForDiv}; use {sizeForDiv + 1}+ if weaker than a main)</span>
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={p.slot}
                      onChange={(e) => {
                        const v = Math.max(1, parseInt(e.target.value) || 1);
                        setPicks((prev) => ({ ...prev, [m.registration_id || m.member_id]: { ...p, slot: v } }));
                      }}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground pl-0.5">
                  → Handicapped as a <strong>{ord(p.division)} League #{p.slot}</strong> player.
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving || missing.length === 0} onClick={save}>
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Saving…</> : `Save ${missing.length} shadow rank${missing.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
