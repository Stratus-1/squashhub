import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { useApplyTeamPenalty, usePenaltyRules } from "@/hooks/use-league-penalties";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  associationId: string;
  teams: { code: string; name?: string | null }[];
  /** Fixture-linked penalty. Omit for a season-level penalty. */
  fixture?: { id: string; date: string; label?: string } | null;
  seasonId?: string | null;
}

export function ApplyTeamPenaltyDialog({ open, onOpenChange, associationId, teams, fixture, seasonId }: Props) {
  const { data: rules = [] } = usePenaltyRules(associationId);
  const active = rules.filter((r) => r.is_active);
  const apply = useApplyTeamPenalty();
  const [team, setTeam] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [confirming, setConfirming] = useState(false);
  const rule = active.find((r) => r.id === ruleId);

  useEffect(() => {
    if (open) { setTeam(""); setRuleId(""); setPoints(""); setReason(""); setConfirming(false); }
  }, [open]);

  const pts = points.trim() ? Math.abs(Math.round(Number(points))) : rule?.default_points ?? 0;
  const valid = !!team && !!rule && pts > 0 && Number.isFinite(pts);
  const teamName = teams.find((t) => t.code === team)?.name || team;

  const submit = async () => {
    try {
      await apply.mutateAsync({
        associationId, teamCode: team, ruleId, points: points.trim() ? pts : null, reason,
        fixtureId: fixture?.id ?? null, seasonId: seasonId ?? null, effectiveDate: fixture ? null : date,
      });
      toast.success(`${pts} point${pts === 1 ? "" : "s"} deducted from ${teamName}'s season standings`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not apply the penalty");
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apply team penalty</DialogTitle>
          <DialogDescription>
            Deducts points from the team's season standings total. The match score, rubbers and bonus points are not changed.
            {fixture?.label ? ` Fixture: ${fixture.label}.` : " Season penalty (not tied to a fixture)."}
          </DialogDescription>
        </DialogHeader>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active penalty rules yet. Add one under League settings → Rules & Penalties.
          </p>
        ) : confirming ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
            <div>Team: <b>{teamName}</b></div>
            <div>Rule: <b>{rule?.name}</b></div>
            <div>Deduction: <b className="text-destructive">−{pts}</b> standings points</div>
            {reason && <div>Reason: {reason}</div>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Affected team</Label>
              <Select value={team} onValueChange={setTeam}>
                <SelectTrigger><SelectValue placeholder="Choose team" /></SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.code} value={t.code}>{t.name ? `${t.name} (${t.code})` : t.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Penalty rule</Label>
              <Select value={ruleId} onValueChange={setRuleId}>
                <SelectTrigger><SelectValue placeholder="Choose rule" /></SelectTrigger>
                <SelectContent>
                  {active.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} (−{r.default_points})</SelectItem>)}
                </SelectContent>
              </Select>
              {rule?.description && <p className="text-xs text-muted-foreground">{rule.description}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="pen-points">Points to deduct</Label>
              <Input id="pen-points" type="number" min={1} inputMode="numeric" value={points}
                placeholder={rule ? `Default ${rule.default_points}` : ""}
                onChange={(e) => setPoints(e.target.value.replace("-", ""))} />
              <p className="text-xs text-muted-foreground">Enter a positive number; it is subtracted once.</p>
            </div>
            {!fixture && (
              <div className="space-y-1">
                <Label htmlFor="pen-date">Penalty date</Label>
                <Input id="pen-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="pen-reason">Explanation</Label>
              <Textarea id="pen-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          {confirming ? (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)}>Back</Button>
              <Button variant="destructive" onClick={submit} disabled={apply.isPending}>Confirm deduction</Button>
            </>
          ) : (
            <Button variant="destructive" disabled={!valid} onClick={() => setConfirming(true)}>Review penalty</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
