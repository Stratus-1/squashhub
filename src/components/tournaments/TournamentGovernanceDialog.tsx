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
import { Trash2 } from "lucide-react";
import {
  useDeleteTournamentVenue,
  useHostClubs,
  useOwnerOrganisations,
  useSanctioningAuthorities,
  useSaveTournamentGovernance,
  useSaveTournamentVenue,
  useSetTournamentOwner,
  useTournamentGovernance,
  useTournamentGovernanceAudit,
  useTournamentOwner,
  useTournamentVenues,
  type TournamentGovernance,
} from "@/hooks/use-tournaments";
import { centsToRand, computeFeeSplit, randToCents } from "@/lib/tournaments/fee-split";

interface Props {
  champ: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  /**
   * Level running the event. At club level the sanctioning block and the
   * federation share are hidden — a club event is not sanctioned by itself and
   * keeps its own entry money, so those fields would just be dead inputs.
   */
  scope?: "club" | "association" | "federation";
}


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
  registration_required: "Registration required",
  registration_mode: "Registration mode",
  registration_opens_at: "Entries open",
  registration_closes_at: "Entries close",
  entry_fee_cents: "Entry fee",
  federation_fee_cents: "Federation share",
  association_fee_cents: "Association share",
  payment_required: "Payment required",
  refund_policy: "Refund policy",
  refund_cutoff_date: "Refund cut-off",
};

const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export function TournamentGovernanceDialog({ champ, onOpenChange }: Props) {
  const id = champ?.id ?? null;
  const { data: gov } = useTournamentGovernance(id);
  const { data: authorities = [] } = useSanctioningAuthorities();
  const { data: orgs = [] } = useOwnerOrganisations();
  const { data: audit = [] } = useTournamentGovernanceAudit(id);
  const { data: owner } = useTournamentOwner(id);
  const { data: venues = [] } = useTournamentVenues(id);
  const { data: clubs = [] } = useHostClubs();

  const save = useSaveTournamentGovernance(id);
  const setOwner = useSetTournamentOwner(id);
  const saveVenue = useSaveTournamentVenue(id);
  const deleteVenue = useDeleteTournamentVenue(id);

  const [form, setForm] = useState<TournamentGovernance | null>(null);
  const [newVenueClub, setNewVenueClub] = useState<string>("");
  useEffect(() => {
    if (gov) setForm(gov);
  }, [gov]);

  const set = <K extends keyof TournamentGovernance>(k: K, v: TournamentGovernance[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const split = computeFeeSplit({
    entryFeeCents: form?.entry_fee_cents ?? 0,
    federationFeeCents: form?.federation_fee_cents ?? 0,
    associationFeeCents: form?.association_fee_cents ?? 0,
    hostFeeCents: venues.reduce((s, v) => s + (v.host_fee_cents || 0), 0),
    hostSharePct: venues.reduce((s, v) => s + Number(v.host_share_pct || 0), 0),
  });

  const submit = async () => {
    if (!form) return;
    if (split.overAllocated) {
      toast.error("Federation, association and host shares exceed the entry fee");
      return;
    }
    try {
      await save.mutateAsync(form);
      toast.success("Governance settings saved");
    } catch (e: any) {
      toast.error(e.message || "Could not save governance settings");
    }
  };

  const clubName = (cid: string) => clubs.find((c) => c.id === cid)?.name || "Club";

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
            <TabsList className="grid grid-cols-5">
              <TabsTrigger value="sanction">Ownership</TabsTrigger>
              <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
              <TabsTrigger value="fees">Fees & refunds</TabsTrigger>
              <TabsTrigger value="venues">Venues</TabsTrigger>
              <TabsTrigger value="audit">History</TabsTrigger>
            </TabsList>

            <TabsContent value="sanction" className="space-y-3 pt-3">
              <div className="space-y-1">
                <Label>Owning body</Label>
                <Select
                  value={owner?.owner_org_id ?? "none"}
                  onValueChange={(v) => setOwner.mutate(v === "none" ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name} · {o.kind === "national" ? "Federation" : o.kind === "association" ? "Association" : "Club"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The owning body drives who may manage this event and where the entry money settles.
                </p>
              </div>

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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Entries open</Label>
                  <Input
                    type="datetime-local"
                    value={toLocalInput(form.registration_opens_at)}
                    onChange={(e) => set("registration_opens_at", fromLocalInput(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Entries close</Label>
                  <Input
                    type="datetime-local"
                    value={toLocalInput(form.registration_closes_at)}
                    onChange={(e) => set("registration_closes_at", fromLocalInput(e.target.value))}
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
                    value={centsToRand(form.entry_fee_cents)}
                    onChange={(e) => set("entry_fee_cents", randToCents(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Federation share (R)</Label>
                  <Input
                    type="number" min={0} step="0.01"
                    value={centsToRand(form.federation_fee_cents)}
                    onChange={(e) => set("federation_fee_cents", randToCents(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Association share (R)</Label>
                  <Input
                    type="number" min={0} step="0.01"
                    value={centsToRand(form.association_fee_cents)}
                    onChange={(e) => set("association_fee_cents", randToCents(e.target.value))}
                  />
                </div>
              </div>
              <div className={`rounded-md border p-3 text-sm space-y-1 ${split.overAllocated ? "border-destructive text-destructive" : ""}`}>
                <div>Federation: <strong>R {centsToRand(split.federation)}</strong></div>
                <div>Association: <strong>R {centsToRand(split.association)}</strong></div>
                <div>Host compensation: <strong>R {centsToRand(split.host)}</strong></div>
                <div>Owning body retains: <strong>R {centsToRand(split.owner)}</strong></div>
                {split.overAllocated && <div>Shares exceed the entry fee</div>}
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Payment required to confirm entry</Label>
                  <p className="text-xs text-muted-foreground">Entries stay pending until the fee is paid.</p>
                </div>
                <Switch checked={form.payment_required} onCheckedChange={(v) => set("payment_required", v)} />
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

            <TabsContent value="venues" className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                Host clubs and what each is paid for hosting. A fixed amount and/or a percentage of every entry fee.
              </p>
              <div className="divide-y rounded-md border">
                {venues.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No venues yet.</p>
                )}
                {venues.map((v) => (
                  <div key={v.id} className="p-3 grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                    <div>
                      <div className="text-sm font-medium">{clubName(v.club_id)}</div>
                      {v.is_primary && <Badge variant="outline" className="text-[10px]">Primary</Badge>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Host fee (R)</Label>
                      <Input
                        className="w-28" type="number" min={0} step="0.01"
                        defaultValue={centsToRand(v.host_fee_cents)}
                        onBlur={(e) =>
                          saveVenue.mutate({ ...v, host_fee_cents: randToCents(e.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Share (%)</Label>
                      <Input
                        className="w-24" type="number" min={0} max={100} step="0.1"
                        defaultValue={String(v.host_share_pct)}
                        onBlur={(e) =>
                          saveVenue.mutate({ ...v, host_share_pct: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteVenue.mutate(v.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 items-end">
                <div className="space-y-1 flex-1">
                  <Label>Add host club</Label>
                  <Select value={newVenueClub} onValueChange={setNewVenueClub}>
                    <SelectTrigger><SelectValue placeholder="Select club" /></SelectTrigger>
                    <SelectContent>
                      {clubs
                        .filter((c) => !venues.some((v) => v.club_id === c.id))
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  disabled={!newVenueClub}
                  onClick={() => {
                    saveVenue.mutate({ club_id: newVenueClub });
                    setNewVenueClub("");
                  }}
                >
                  Add venue
                </Button>
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
