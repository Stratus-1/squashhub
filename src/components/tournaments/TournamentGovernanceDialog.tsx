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
import { toLocalInputValue } from "@/lib/datetime/local-input";
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
import { centsToRand, computeFeeSplit, ownerLabel, randToCents, type OwnerKind } from "@/lib/tournaments/fee-split";
import { useOrgSettings } from "@/hooks/use-org-settings";
import { usePlatformTournamentFeePct } from "@/components/admin/PlatformTournamentFeeCard";
import { useHasPermission } from "@/hooks/use-club-permissions";
import { useIsSuperAdmin } from "@/hooks/use-club";
import { useClubContext } from "@/contexts/ClubContext";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useTournamentEligibility } from "@/hooks/use-tournament-eligibility";


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
  federation_fee_cents: "Federation levy (fixed)",
  federation_fee_pct: "Federation levy (%)",
  association_fee_cents: "Association levy (fixed)",
  association_fee_pct: "Association levy (%)",
  other_expenses_cents: "Other expenses",
  other_expenses_label: "Other expenses label",
  payment_required: "Payment required",
  refund_policy: "Refund policy",
  refund_cutoff_date: "Refund cut-off",
};

const toLocalInput = (iso: string | null) => toLocalInputValue(iso);


export function TournamentGovernanceDialog({ champ, onOpenChange, scope = "federation" }: Props) {
  const clubScope = scope === "club";
  const id = champ?.id ?? null;
  const { data: gov } = useTournamentGovernance(id);
  const { data: authorities = [] } = useSanctioningAuthorities();
  const { data: orgs = [] } = useOwnerOrganisations();
  const { data: audit = [] } = useTournamentGovernanceAudit(id);
  const { data: owner } = useTournamentOwner(id);
  const { data: venues = [] } = useTournamentVenues(id);
  const { data: clubs = [] } = useHostClubs();
  const { data: platformPct = 0 } = usePlatformTournamentFeePct();
  const { data: ownerDefaults } = useOrgSettings(owner?.owner_org_id ?? null);


  // ── Ownership scoping by permission ──────────────────────────────────────
  const isSuperAdmin = useIsSuperAdmin();
  const canFederation = useHasPermission("federation" as any);
  const canAffiliation = useHasPermission("affiliation" as any);
  const { club } = useClubContext();
  const { data: rels = [] } = useQuery({
    queryKey: ["org-affiliation-parents"],
    queryFn: async () => {
      const { data, error } = await fromExt("organisation_relationships")
        .select("parent_org_id, child_org_id, effective_to");
      if (error) throw error;
      return (data || []) as { parent_org_id: string; child_org_id: string; effective_to: string | null }[];
    },
  });

  const ownOrgId = orgs.find((o) => o.club_id && o.club_id === club?.id)?.id ?? null;
  const activeRels = rels.filter((r) => !r.effective_to || new Date(r.effective_to) >= new Date());
  /** Walk up the hierarchy from the club's own organisation. */
  const ancestorIds = (() => {
    const out: string[] = [];
    let cur = ownOrgId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const parent = activeRels.find((r) => r.child_org_id === cur)?.parent_org_id ?? null;
      if (parent) out.push(parent);
      cur = parent;
    }
    return out;
  })();

  const unrestricted = isSuperAdmin || canFederation;
  const allowedOrgIds = new Set<string>([
    ...(ownOrgId ? [ownOrgId] : []),
    ...(canAffiliation ? ancestorIds : []),
    ...(owner?.owner_org_id ? [owner.owner_org_id] : []),
  ]);
  const ownableOrgs = unrestricted ? orgs : orgs.filter((o) => allowedOrgIds.has(o.id));
  // Lock only when there is nothing the user could choose ("Unassigned" always counts as an option).
  const ownerLocked = !unrestricted && ownableOrgs.length === 0;

  const save = useSaveTournamentGovernance(id);
  const setOwner = useSetTournamentOwner(id);
  const saveVenue = useSaveTournamentVenue(id);
  const deleteVenue = useDeleteTournamentVenue(id);

  const [form, setForm] = useState<TournamentGovernance | null>(null);
  const eligibility = useTournamentEligibility({
    scope: (form?.eligibility_scope as string) || "club",
    clubId: owner?.club_id ?? null,
    ownerOrgId: owner?.owner_org_id ?? null,
    enabled: !!id,
  });

  const [newVenueClub, setNewVenueClub] = useState<string>("");
  useEffect(() => {
    if (gov) setForm(gov);
  }, [gov]);

  const set = <K extends keyof TournamentGovernance>(k: K, v: TournamentGovernance[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  // The owner selected on the Ownership tab is the single source of truth for
  // who the residual beneficiary is — Fees & refunds never re-asks.
  const ownerOrg = orgs.find((o) => o.id === owner?.owner_org_id) ?? null;
  const fallbackOwnerOrg = orgs.find((o) => o.club_id && o.club_id === owner?.club_id) ?? null;
  const effectiveOwner = ownerOrg ?? fallbackOwnerOrg;
  const ownerKind = (effectiveOwner?.kind ?? "club") as OwnerKind;
  const ownerDisplay = ownerLabel(effectiveOwner?.name, ownerKind);

  const split = computeFeeSplit({
    entryFeeCents: form?.entry_fee_cents ?? 0,
    ownerKind,
    federationFeeCents: form?.federation_fee_cents ?? 0,
    federationFeePct: Number(form?.federation_fee_pct ?? 0),
    associationFeeCents: form?.association_fee_cents ?? 0,
    associationFeePct: Number(form?.association_fee_pct ?? 0),
    hostFeeCents: venues.reduce((s, v) => s + (v.host_fee_cents || 0), 0),
    hostSharePct: venues.reduce((s, v) => s + Number(v.host_share_pct || 0), 0),
    otherExpensesCents: form?.other_expenses_cents ?? 0,
    platformFeePct: platformPct ?? 0,
  });


  const submit = async () => {
    if (!form) return;
    if (split.overAllocated) {
      toast.error("Levies, host compensation and expenses exceed the entry fee");
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

  /** Club's own hosting rates, shown as guidance when setting host compensation. */
  const clubRates = (cid: string) => {
    const c = clubs.find((x) => x.id === cid);
    const hourly = c?.host_court_fee_cents_per_hour || 0;
    const cleaning = c?.host_cleaning_fee_cents_per_day || 0;
    if (!hourly && !cleaning) return "No hosting rates set";
    return [
      hourly ? `R ${centsToRand(hourly)} / court-hour` : null,
      cleaning ? `R ${centsToRand(cleaning)} cleaning / day` : null,
    ].filter(Boolean).join(" · ");
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
                  disabled={ownerLocked}
                  onValueChange={(v) => setOwner.mutate(v === "none" ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {ownableOrgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name} · {o.kind === "national" ? "Federation" : o.kind === "association" ? "Association" : "Club"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The owning body drives who may manage this event and where the entry money settles.
                </p>
                {!unrestricted && (
                  <p className="text-xs text-muted-foreground">
                    {canAffiliation
                      ? "You may assign this event to your club or to an association your club is affiliated to."
                      : "You may only assign this event to your own club. Affiliation or federation rights are needed to own it at a higher level."}
                  </p>
                )}
              </div>

              {!clubScope && (
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
              )}

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
                      <SelectItem value="club">Members of the owning club</SelectItem>
                      <SelectItem value="association">Members of the owning association</SelectItem>
                      <SelectItem value="open">Open to everyone</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Sets who is eligible. Who actually receives an invitation is configured in Entry &amp; fees / Players.
                  </p>
                  {eligibility && (
                    <p className="text-[11px] font-medium text-primary">Eligible: {eligibility.summary}</p>
                  )}
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
              {/* Registration window is owned by the tournament setup wizard —
                  shown here read-only so there is only one place to edit it. */}
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Registration window
                </div>
                <div>Entries open: <strong>{toLocalInput(form.registration_opens_at)?.replace("T", " ") || "—"}</strong></div>
                <div>Entries close: <strong>{toLocalInput(form.registration_closes_at)?.replace("T", " ") || "—"}</strong></div>
                <p className="text-xs text-muted-foreground">Set in the tournament setup → Registration step.</p>
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
              {/* Entry fee and "payment required" are owned by the tournament
                  setup wizard (Registration step) — read-only here. */}
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div>Entry fee: <strong>R {centsToRand(form.entry_fee_cents)}</strong></div>
                <div>
                  Payment required to confirm entry: <strong>{form.payment_required ? "Yes" : "No"}</strong>
                </div>
                <p className="text-xs text-muted-foreground">Set in the tournament setup → Registration step.</p>
              </div>
              <div className="rounded-md border p-3 text-sm space-y-1">
                <div>
                  Owner (residual beneficiary): <strong>{ownerDisplay}</strong>
                </div>
                <p className="text-xs text-muted-foreground">
                  Set on the Ownership tab. Everything left after the deductions below belongs to the owner —
                  a levy is never charged back to the body that owns the event.
                </p>
              </div>

              {split.federationApplies ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Federation levy — fixed (R per entry)</Label>
                    <Input
                      type="number" min={0} step="0.01"
                      value={centsToRand(form.federation_fee_cents)}
                      onChange={(e) => set("federation_fee_cents", randToCents(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Federation levy — percentage (%)</Label>
                    <Input
                      type="number" min={0} max={100} step="0.01"
                      value={Number(form.federation_fee_pct ?? 0)}
                      onChange={(e) => set("federation_fee_pct", Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    />
                  </div>
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
                  No federation levy: Squash South Africa owns this event, so it keeps the residual instead.
                </p>
              )}

              {split.associationApplies ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Association levy — fixed (R per entry)</Label>
                    <Input
                      type="number" min={0} step="0.01"
                      value={centsToRand(form.association_fee_cents)}
                      onChange={(e) => set("association_fee_cents", randToCents(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Association levy — percentage (%)</Label>
                    <Input
                      type="number" min={0} max={100} step="0.01"
                      value={Number(form.association_fee_pct ?? 0)}
                      onChange={(e) => set("association_fee_pct", Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    />
                  </div>
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
                  No association levy: this event is owned at association or federation level, so the association
                  would only be charging itself.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Other expenses (R per entry)</Label>
                  <Input
                    type="number" min={0} step="0.01"
                    value={centsToRand(form.other_expenses_cents)}
                    onChange={(e) => set("other_expenses_cents", randToCents(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>What for?</Label>
                  <Input
                    value={form.other_expenses_label ?? ""}
                    onChange={(e) => set("other_expenses_label", e.target.value || null)}
                    placeholder="e.g. Referees, balls, trophies"
                  />
                </div>
              </div>

              {ownerDefaults && (ownerDefaults.default_federation_fee_cents || ownerDefaults.default_association_fee_cents) ? (
                <div className="flex items-center justify-between rounded-md border border-dashed p-2.5 text-xs">
                  <span className="text-muted-foreground">
                    Owning body defaults: federation R {centsToRand(ownerDefaults.default_federation_fee_cents)} ·
                    association R {centsToRand(ownerDefaults.default_association_fee_cents)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (split.federationApplies) set("federation_fee_cents", ownerDefaults.default_federation_fee_cents);
                      if (split.associationApplies) set("association_fee_cents", ownerDefaults.default_association_fee_cents);
                    }}
                  >
                    Apply defaults
                  </Button>
                </div>
              ) : null}

              <div className={`rounded-md border p-3 text-sm space-y-1 ${split.overAllocated ? "border-destructive text-destructive" : ""}`}>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Allocation per entry
                </div>
                <div>Gross entry fee: <strong>R {centsToRand(split.entry)}</strong></div>
                <div>− SquashHub admin fee ({platformPct}%): <strong>R {centsToRand(split.platform)}</strong></div>
                {split.federationApplies && (
                  <div>− Federation levy: <strong>R {centsToRand(split.federation)}</strong></div>
                )}
                {split.associationApplies && (
                  <div>− Association levy: <strong>R {centsToRand(split.association)}</strong></div>
                )}
                <div>− Host / venue compensation: <strong>R {centsToRand(split.host)}</strong></div>
                {split.other > 0 && (
                  <div>
                    − {form.other_expenses_label || "Other expenses"}: <strong>R {centsToRand(split.other)}</strong>
                  </div>
                )}
                <div className="border-t pt-1">
                  = Net retained by {ownerDisplay}: <strong>R {centsToRand(split.owner)}</strong>
                </div>
                {split.overAllocated && <div>Deductions exceed the entry fee</div>}
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
                Each club's own court and cleaning rates (set in Club admin → Courts) are shown as a guide.
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
                      <div className="text-[11px] text-muted-foreground">{clubRates(v.club_id)}</div>
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
