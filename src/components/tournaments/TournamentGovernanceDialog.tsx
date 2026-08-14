import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  useSanctioningAuthorities,
  useSaveTournamentGovernance,
  useTournamentGovernance,
  useTournamentGovernanceAudit,
  type TournamentGovernance,
} from "@/hooks/use-tournament-governance";

interface Props {
  champ: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}

const rand = (cents: number) => (cents / 100).toFixed(2);
const cents = (v: string) => Math.max(0, Math.round((parseFloat(v || "0") || 0) * 100));

const FIELD_LABELS: Record<string, string> = {
  sanction_status: "Sanction status",
  sanctioning_org_id: "Sanctioning authority",
  sanction_reference: "Sanction reference",
  sanction_notes: "Sanction notes",
  competition_level: "Competition level",
  eligibility_min_age: "Minimum age",
  eligibility_max_age: "Maximum age",
  eligibility_requires_licence: "Licence required",
  eligibility_scope: "Who may enter",
  eligibility_notes: "Eligibility notes",
  entry_fee_cents: "Entry fee",
  federation_fee_cents: "Federation share",
  association_fee_cents: "Association share",
  refund_policy: "Refund policy",
  refund_cutoff_date: "Refund cut-off",
};

export function TournamentGovernanceDialog({ champ, onOpenChange }: Props) {
  const { data: gov } = useTournamentGovernance(champ?.id ?? null);
  const { data: authorities = [] } = useSanctioningAuthorities();
  const { data: audit = [] } = useTournamentGovernanceAudit(champ?.id ?? null);
  const save = useSaveTournamentGovernance(champ?.id ?? null);

  const [form, setForm] = useState<TournamentGovernance | null>(null);
  useEffect(() => {
    if (gov) setForm(gov);
  }, [gov]);

  const set = <K extends keyof TournamentGovernance>(k: K, v: TournamentGovernance[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const clubShare = form
    ? Math.max(0, form.entry_fee_cents - form.federation_fee_cents - form.association_fee_cents)
    : 0;
  const overSplit = form
    ? form.federation_fee_cents + form.association_fee_cents > form.entry_fee_cents
    : false;

  const submit = async () => {
    if (!form) return;
    if (overSplit) {
      toast.error("Federation + association shares exceed the entry fee");
      return;
    }
    try {
      await save.mutateAsync(form);
      toast.success("Governance settings saved");
    } catch (e: any) {
      toast.error(e.message || "Could not save governance settings");
    }
  };

  return (
    <Dialog open={!!champ} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Governance — {champ?.name}</DialogTitle>
        </DialogHeader>

        {!form ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Tabs defaultValue="sanction">
            <TabsList className="grid grid-cols-4">
              <TabsTrigger value="sanction">Sanctioning</TabsTrigger>
              <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
              <TabsTrigger value="fees">Fees & refunds</TabsTrigger>
              <TabsTrigger value="audit">History</TabsTrigger>
            </TabsList>

            <TabsContent value="sanction" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Competition level</Label>
                  <Select value={form.competition_level} onValueChange={(v) => set("competition_level", v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="club">Club</SelectItem>
                      <SelectItem value="regional">Regional</SelectItem>
                      <SelectItem value="provincial">Provincial</SelectItem>
                      <SelectItem value="national">National</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Sanction status</Label>
                  <Select value={form.sanction_status} onValueChange={(v) => set("sanction_status", v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not sanctioned</SelectItem>
                      <SelectItem value="pending">Sanction requested</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Sanctioning authority</Label>
                  <Select
                    value={form.sanctioning_org_id ?? "none"}
                    onValueChange={(v) => set("sanctioning_org_id", v === "none" ? null : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select body" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {authorities.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} · {a.kind === "national" ? "National" : "Association"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Sanction reference</Label>
                  <Input
                    value={form.sanction_reference ?? ""}
                    onChange={(e) => set("sanction_reference", e.target.value || null)}
                    placeholder="e.g. SSA/2026/014"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  value={form.sanction_notes ?? ""}
                  onChange={(e) => set("sanction_notes", e.target.value || null)}
                  placeholder="Conditions attached to the sanction"
                />
              </div>
            </TabsContent>

            <TabsContent value="eligibility" className="space-y-3 pt-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Who may enter</Label>
                  <Select value={form.eligibility_scope} onValueChange={(v) => set("eligibility_scope", v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="club">Club members only</SelectItem>
                      <SelectItem value="association">Association members</SelectItem>
                      <SelectItem value="open">Open entry</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Minimum age</Label>
                  <Input
                    type="number" min={0}
                    value={form.eligibility_min_age ?? ""}
                    onChange={(e) => set("eligibility_min_age", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Maximum age</Label>
                  <Input
                    type="number" min={0}
                    value={form.eligibility_max_age ?? ""}
                    onChange={(e) => set("eligibility_max_age", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>National licence required</Label>
                  <p className="text-xs text-muted-foreground">Entrants must hold an active competitive licence.</p>
                </div>
                <Switch
                  checked={form.eligibility_requires_licence}
                  onCheckedChange={(v) => set("eligibility_requires_licence", v)}
                />
              </div>
              <div className="space-y-1">
                <Label>Eligibility notes</Label>
                <Textarea
                  rows={3}
                  value={form.eligibility_notes ?? ""}
                  onChange={(e) => set("eligibility_notes", e.target.value || null)}
                  placeholder="e.g. Masters 45+, juniors U19 on 1 January"
                />
              </div>
            </TabsContent>

            <TabsContent value="fees" className="space-y-3 pt-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Entry fee (R)</Label>
                  <Input
                    type="number" min={0} step="0.01"
                    value={rand(form.entry_fee_cents)}
                    onChange={(e) => set("entry_fee_cents", cents(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Federation share (R)</Label>
                  <Input
                    type="number" min={0} step="0.01"
                    value={rand(form.federation_fee_cents)}
                    onChange={(e) => set("federation_fee_cents", cents(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Association share (R)</Label>
                  <Input
                    type="number" min={0} step="0.01"
                    value={rand(form.association_fee_cents)}
                    onChange={(e) => set("association_fee_cents", cents(e.target.value))}
                  />
                </div>
              </div>
              <div className={`rounded-md border p-3 text-sm ${overSplit ? "border-destructive text-destructive" : ""}`}>
                Club retains <strong>R {rand(clubShare)}</strong> per entry
                {overSplit && " — shares exceed the entry fee"}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Refund policy</Label>
                  <Select value={form.refund_policy} onValueChange={(v) => set("refund_policy", v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No refunds</SelectItem>
                      <SelectItem value="full_before_cutoff">Full refund before cut-off</SelectItem>
                      <SelectItem value="partial_before_cutoff">Partial refund before cut-off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Refund cut-off date</Label>
                  <Input
                    type="date"
                    value={form.refund_cutoff_date ?? ""}
                    onChange={(e) => set("refund_cutoff_date", e.target.value || null)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="audit" className="pt-3">
              {audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">No governance changes recorded yet.</p>
              ) : (
                <div className="divide-y">
                  {audit.map((a) => (
                    <div key={a.id} className="py-2 text-xs flex items-start gap-2">
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {new Date(a.created_at).toLocaleDateString()}
                      </Badge>
                      <div className="min-w-0">
                        <div className="font-medium">{FIELD_LABELS[a.field] || a.field}</div>
                        <div className="text-muted-foreground break-words">
                          {a.old_value ?? "—"} → {a.new_value ?? "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={submit} disabled={save.isPending || !form}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
