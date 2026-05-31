import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixtureId: string;
  homeCode: string;
  awayCode: string;
  existing?: {
    home_total_points?: number | null;
    away_total_points?: number | null;
    home_total_games?: number | null;
    away_total_games?: number | null;
    home_bonus_points?: number | null;
    away_bonus_points?: number | null;
    home_penalty_points?: number | null;
    away_penalty_points?: number | null;
  } | null;
  onSaved?: () => void;
}

export function AdminManualScoreDialog({ open, onOpenChange, fixtureId, homeCode, awayCode, existing, onSaved }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [hp, setHp] = useState("");
  const [ap, setAp] = useState("");
  const [hg, setHg] = useState("");
  const [ag, setAg] = useState("");
  const [hb, setHb] = useState("");
  const [ab, setAb] = useState("");
  const [hpen, setHpen] = useState("");
  const [apen, setApen] = useState("");

  useEffect(() => {
    if (!open) return;
    setHp(existing?.home_total_points?.toString() ?? "");
    setAp(existing?.away_total_points?.toString() ?? "");
    setHg(existing?.home_total_games?.toString() ?? "");
    setAg(existing?.away_total_games?.toString() ?? "");
    setHb(existing?.home_bonus_points?.toString() ?? "");
    setAb(existing?.away_bonus_points?.toString() ?? "");
    setHpen(existing?.home_penalty_points?.toString() ?? "");
    setApen(existing?.away_penalty_points?.toString() ?? "");
  }, [open, existing]);

  const num = (v: string, fallback = 0) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  };

  const handleSave = async () => {
    if (!user) return;
    if (hp === "" || ap === "") {
      toast.error("Enter both home and away total points");
      return;
    }
    setSaving(true);
    try {
      const homeTotal = num(hp);
      const awayTotal = num(ap);
      const winner = homeTotal > awayTotal ? "home" : awayTotal > homeTotal ? "away" : "draw";
      const { error } = await supabase.from("league_fixture_results" as any).upsert({
        fixture_id: fixtureId,
        home_total_points: homeTotal,
        away_total_points: awayTotal,
        home_total_games: hg === "" ? null : num(hg),
        away_total_games: ag === "" ? null : num(ag),
        home_bonus_points: hb === "" ? null : num(hb),
        away_bonus_points: ab === "" ? null : num(ab),
        home_penalty_points: hpen === "" ? null : num(hpen),
        away_penalty_points: apen === "" ? null : num(apen),
        winner,
        status: "submitted",
        home_captain_signature: "ADMIN_MANUAL_OVERRIDE",
        away_captain_signature: "ADMIN_MANUAL_OVERRIDE",
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
      } as any, { onConflict: "fixture_id" });
      if (error) throw error;
      toast.success("Final score saved and finalized");
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-destructive" />
            Manual Final Score
          </DialogTitle>
          <DialogDescription className="text-xs">
            Enter total points directly. This will mark the fixture as <b>submitted</b> and overwrite the standings — bypassing rubber-by-rubber entry and captain signatures. Use for catch-up fixtures.
          </DialogDescription>
        </DialogHeader>


        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">{homeCode || "Home"} — Total Points *</Label>
              <Input type="number" inputMode="numeric" value={hp} onChange={(e) => setHp(e.target.value)} className="h-9" placeholder="0" />
            </div>
            <div>
              <Label className="text-xs font-semibold">{awayCode || "Away"} — Total Points *</Label>
              <Input type="number" inputMode="numeric" value={ap} onChange={(e) => setAp(e.target.value)} className="h-9" placeholder="0" />
            </div>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Optional breakdown (games / bonus / penalty)</summary>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <Label className="text-[11px]">Home games</Label>
                <Input type="number" value={hg} onChange={(e) => setHg(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-[11px]">Away games</Label>
                <Input type="number" value={ag} onChange={(e) => setAg(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-[11px]">Home bonus</Label>
                <Input type="number" value={hb} onChange={(e) => setHb(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-[11px]">Away bonus</Label>
                <Input type="number" value={ab} onChange={(e) => setAb(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-[11px]">Home penalty</Label>
                <Input type="number" value={hpen} onChange={(e) => setHpen(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-[11px]">Away penalty</Label>
                <Input type="number" value={apen} onChange={(e) => setApen(e.target.value)} className="h-8" />
              </div>
            </div>
          </details>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="font-semibold">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Save & Finalize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
