import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, UserPlus } from "lucide-react";
import { centsToRand, randToCents, computeFeeSplit } from "@/lib/tournaments/fee-split";
import {
  ORG_ADMIN_ROLES,
  emptyOrgSettings,
  useGrantOrgAdmin,
  useOrgAdmins,
  useOrgSettings,
  useRevokeOrgAdmin,
  useSaveOrgSettings,
  useUpdateOrgAdmin,
  type OrgAdminRole,
  type OrgSettings,
} from "@/hooks/use-org-settings";

interface Props {
  orgId: string | null;
  orgName: string;
  isFederation?: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrgSettingsDialog({ orgId, orgName, isFederation, onOpenChange }: Props) {
  const { data: settings } = useOrgSettings(orgId);
  const save = useSaveOrgSettings(orgId);
  const { data: admins = [] } = useOrgAdmins(orgId);
  const grant = useGrantOrgAdmin(orgId);
  const toggle = useUpdateOrgAdmin(orgId);
  const revoke = useRevokeOrgAdmin(orgId);

  const [form, setForm] = useState<OrgSettings | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgAdminRole>("association_admin");
  // Raw text drafts so typing "3.50" isn't reformatted mid-keystroke
  const [raw, setRaw] = useState<Record<string, string>>({});

  useEffect(() => {
    const next = settings ?? (orgId ? emptyOrgSettings(orgId) : null);
    if (!next) return;
    setForm(next);
    setRaw({
      default_entry_fee_cents: centsToRand(next.default_entry_fee_cents),
      default_federation_fee_cents: centsToRand(next.default_federation_fee_cents),
      default_association_fee_cents: centsToRand(next.default_association_fee_cents),
      default_host_share_pct: String(next.default_host_share_pct ?? 0),
    });
  }, [settings, orgId]);

  const set = <K extends keyof OrgSettings>(k: K, v: OrgSettings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const setMoney = (k: keyof OrgSettings, v: string) => {
    setRaw((r) => ({ ...r, [k as string]: v }));
    set(k, randToCents(v) as OrgSettings[typeof k]);
  };

  const blurMoney = (k: keyof OrgSettings) =>
    setRaw((r) => ({ ...r, [k as string]: centsToRand(randToCents(r[k as string] ?? "0")) }));


  const split = computeFeeSplit({
    entryFeeCents: form?.default_entry_fee_cents ?? 0,
    federationFeeCents: form?.default_federation_fee_cents ?? 0,
    associationFeeCents: form?.default_association_fee_cents ?? 0,
    hostSharePct: form?.default_host_share_pct ?? 0,
  });

  return (
    <Dialog open={!!orgId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{orgName} — settings</DialogTitle>
        </DialogHeader>

        {!form ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Tabs defaultValue="fees">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="fees">Fee defaults</TabsTrigger>
              <TabsTrigger value="rules">Rules</TabsTrigger>
              <TabsTrigger value="admins">Admins</TabsTrigger>
            </TabsList>

            <TabsContent value="fees" className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                These defaults pre-fill every new tournament owned by {orgName}. Organisers can still
                override them per event under Governance → Fees.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Default entry fee (R)</Label>
                  <Input
                    type="text" inputMode="decimal"
                    value={raw.default_entry_fee_cents ?? ""}
                    onChange={(e) => setMoney("default_entry_fee_cents", e.target.value)}
                    onBlur={() => blurMoney("default_entry_fee_cents")}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Federation share (R)</Label>
                  <Input
                    type="text" inputMode="decimal"
                    value={raw.default_federation_fee_cents ?? ""}
                    onChange={(e) => setMoney("default_federation_fee_cents", e.target.value)}
                    onBlur={() => blurMoney("default_federation_fee_cents")}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Association share (R)</Label>
                  <Input
                    type="text" inputMode="decimal"
                    value={raw.default_association_fee_cents ?? ""}
                    onChange={(e) => setMoney("default_association_fee_cents", e.target.value)}
                    onBlur={() => blurMoney("default_association_fee_cents")}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Host share (% of entry)</Label>
                  <Input
                    type="text" inputMode="decimal"
                    value={raw.default_host_share_pct ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRaw((r) => ({ ...r, default_host_share_pct: v }));
                      set("default_host_share_pct", Math.max(0, Math.min(100, parseFloat(v) || 0)));
                    }}
                    onBlur={() =>
                      setRaw((r) => ({
                        ...r,
                        default_host_share_pct: String(form?.default_host_share_pct ?? 0),
                      }))
                    }
                  />
                </div>
              </div>

              <div className={`rounded-md border p-3 text-sm space-y-1 ${split.overAllocated ? "border-destructive text-destructive" : ""}`}>
                <div className="text-xs text-muted-foreground">
                  Example split on a R {centsToRand(form.default_entry_fee_cents)} entry (SquashHub admin fee is
                  deducted separately at platform level):
                </div>
                <div>Federation: <strong>R {centsToRand(split.federation)}</strong></div>
                <div>Association: <strong>R {centsToRand(split.association)}</strong></div>
                <div>Host club: <strong>R {centsToRand(split.host)}</strong></div>
                <div>Retained by {orgName} (event owner): <strong>R {centsToRand(split.owner)}</strong></div>
                <p className="text-[11px] text-muted-foreground">
                  The owner is this organisation — whatever is left after the federation, association and
                  host shares stays with {orgName} as the body running the event.
                </p>
                {split.overAllocated && <div>Shares exceed the entry fee</div>}
              </div>


              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Payout reference</Label>
                  <Input
                    value={form.payout_reference ?? ""}
                    onChange={(e) => set("payout_reference", e.target.value || null)}
                    placeholder="e.g. NSA-TOURN"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Finance contact</Label>
                  <Input
                    value={form.finance_contact_name ?? ""}
                    onChange={(e) => set("finance_contact_name", e.target.value || null)}
                    placeholder="Treasurer name"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Finance contact email</Label>
                  <Input
                    type="email"
                    value={form.finance_contact_email ?? ""}
                    onChange={(e) => set("finance_contact_email", e.target.value || null)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="rules" className="space-y-3 pt-3">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Tournaments must be sanctioned</div>
                  <p className="text-xs text-muted-foreground">
                    New events owned by {orgName} start as "sanction requested".
                  </p>
                </div>
                <Switch
                  checked={form.require_sanctioning}
                  onCheckedChange={(v) => set("require_sanctioning", v)}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Competitive licence required</div>
                  <p className="text-xs text-muted-foreground">
                    Players need an active affiliation number to enter.
                  </p>
                </div>
                <Switch
                  checked={form.require_competitive_licence}
                  onCheckedChange={(v) => set("require_competitive_licence", v)}
                />
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea
                  rows={4}
                  value={form.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value || null)}
                  placeholder="Internal notes about this association's rules or agreements"
                />
              </div>
            </TabsContent>

            <TabsContent value="admins" className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                Give people scoped rights over {orgName} — they can manage its data and events without
                being platform admins.
              </p>
              <div className="grid grid-cols-[1fr_180px_auto] gap-2 items-end">
                <div className="space-y-1">
                  <Label>Account email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="person@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as OrgAdminRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ORG_ADMIN_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={!email.trim() || grant.isPending}
                  onClick={() => grant.mutate({ email, role }, { onSuccess: () => setEmail("") })}
                >
                  <UserPlus className="w-4 h-4 mr-1" /> Grant
                </Button>
              </div>

              <div className="divide-y rounded-md border">
                {admins.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No admins yet.</p>
                )}
                {admins.map((a) => (
                  <div key={a.id} className="p-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{a.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{a.email || "No email"}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {ORG_ADMIN_ROLES.find((r) => r.value === a.role)?.label || a.role}
                    </Badge>
                    <Switch
                      checked={a.active}
                      onCheckedChange={(v) => toggle.mutate({ id: a.id, active: v })}
                    />
                    <Button variant="ghost" size="icon" onClick={() => revoke.mutate(a.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            disabled={!form || save.isPending}
            onClick={() => form && save.mutate(form)}
          >
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
