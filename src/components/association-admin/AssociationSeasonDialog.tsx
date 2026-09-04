import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarRange, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAssociationSeasons } from "@/hooks/use-association-seasons";
import { seasonLabel } from "@/lib/leagues/seasons";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Platform association that owns the season calendar. */
  platformAssociationId: string | null;
  /** Association tenant club id — used for the admin write check. */
  tenantClubId: string;
  associationName: string;
};

/**
 * The association opens the season: year + start date. Affiliated clubs are
 * then prompted, in their own Leagues setup, to create their teams for it.
 */
export function AssociationSeasonDialog({
  open,
  onOpenChange,
  platformAssociationId,
  tenantClubId,
  associationName,
}: Props) {
  const qc = useQueryClient();
  const { seasons, isLoading } = useAssociationSeasons(platformAssociationId);

  const suggested = seasons.length
    ? Math.max(...seasons.map((s) => s.season_year)) + 1
    : new Date().getFullYear() + 1;

  const [year, setYear] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [makeCurrent, setMakeCurrent] = useState(true);

  const yearValue = year || String(suggested);

  const create = useMutation({
    mutationFn: async () => {
      if (!platformAssociationId) throw new Error("This association is not linked yet.");
      if (makeCurrent) {
        const { error: clearErr } = await supabase
          .from("league_seasons")
          .update({ is_current: false })
          .eq("platform_association_id", platformAssociationId)
          .eq("is_current", true);
        if (clearErr) throw clearErr;
      }
      const { error } = await supabase.from("league_seasons").insert({
        platform_association_id: platformAssociationId,
        club_id: tenantClubId,
        season_year: Number(yearValue),
        label: String(yearValue),
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        is_current: makeCurrent,
        status: makeCurrent ? "active" : "planned",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${yearValue} season opened — clubs will be prompted to create their teams`);
      setYear("");
      setStartsOn("");
      setEndsOn("");
      qc.invalidateQueries({ queryKey: ["assoc-league-seasons"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not open the season"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="w-4 h-4" /> Seasons — {associationName}
          </DialogTitle>
          <DialogDescription>
            You open the season for the whole league. Once a season is open, every affiliated
            club is prompted to create its teams for that year.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            {isLoading && <p className="text-xs text-muted-foreground">Loading seasons…</p>}
            {!isLoading && seasons.length === 0 && (
              <p className="text-xs text-muted-foreground">No seasons opened yet.</p>
            )}
            {seasons.map((s) => (
              <Card key={s.id} className="p-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{seasonLabel(s)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Starts {s.starts_on || "—"} · ends {s.ends_on || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {s.is_current && <Badge className="text-[10px] h-5">Current</Badge>}
                  <Badge variant="outline" className="text-[10px] h-5">
                    {s.status}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <p className="text-xs font-semibold">Open a new season</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Season year</Label>
                <Input
                  className="h-8 text-xs"
                  inputMode="numeric"
                  value={yearValue}
                  onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Start date</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">End date (optional)</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={makeCurrent}
                onCheckedChange={(v) => setMakeCurrent(v === true)}
              />
              Make this the current season for all affiliated clubs
            </label>

            <Button
              size="sm"
              className="w-full"
              disabled={create.isPending || yearValue.length !== 4 || !platformAssociationId}
              onClick={() => create.mutate()}
            >
              {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Open {yearValue} season
            </Button>
            {!platformAssociationId && (
              <p className="text-[11px] text-muted-foreground">
                This tenant is not linked to a league association yet.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
