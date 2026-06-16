import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck, FileSignature, FileText, Printer, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateClub, type Club } from "@/hooks/use-club";
import { SquashHubSlaContent, SLA_VERSION } from "@/components/SquashHubSlaContent";

type BillingOption = "monthly" | "annual_upfront";

export function ClubParticipationCard({ club }: { club: Club }) {
  const { user } = useAuth();
  const updateClub = useUpdateClub();
  const c = club as any;

  const isActive = !!c.participation_active;
  const [open, setOpen] = useState(false);
  const [billing, setBilling] = useState<BillingOption>(c.sla_billing_option || "monthly");
  const [name, setName] = useState(c.sla_accepted_name || "");
  const [role, setRole] = useState(c.sla_accepted_role || "Chairman");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const memberCount = (c as any).active_member_count;

  const handleAccept = async () => {
    if (!agreed || !name.trim() || !role.trim()) {
      toast.error("Please complete your name, role, and tick the acceptance box");
      return;
    }
    setSaving(true);
    try {
      await updateClub.mutateAsync({
        id: club.id,
        participation_active: true,
        sla_accepted_at: new Date().toISOString(),
        sla_accepted_by: user?.id,
        sla_accepted_name: name.trim(),
        sla_accepted_role: role.trim(),
        sla_version: SLA_VERSION,
        sla_billing_option: billing,
      } as any);
      toast.success("Club participation activated — welcome aboard!");
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to activate participation");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm("Deactivate club participation? Billing will stop at the end of the current cycle and members will lose access to billable features.")) return;
    try {
      await updateClub.mutateAsync({ id: club.id, participation_active: false } as any);
      toast.success("Participation deactivated");
    } catch (err: any) {
      toast.error(err.message || "Failed to deactivate");
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Club Participation</h3>
            {isActive ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Active</Badge>
            ) : (
              <Badge variant="outline">Not active</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Activate your club&apos;s participation on SquashHub. The chairman, captain or
            authorised office bearer must accept the Service Level Agreement.
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-2">
        <div className="font-medium text-foreground">Fee structure</div>
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          <li><strong className="text-foreground">R6</strong> per active member per month (billed monthly), or</li>
          <li><strong className="text-foreground">R5</strong> per active member per month if paid <strong className="text-foreground">annually in advance</strong> (save R12 / member / year)</li>
        </ul>
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded px-2 py-1.5">
          Fees are first invoiced from <strong>September 2026</strong> for the current financial year, and annually thereafter.
        </p>
        {typeof memberCount === "number" && (
          <p className="text-xs text-muted-foreground">Your club currently has {memberCount} active member{memberCount === 1 ? "" : "s"}.</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" asChild>
            <a href="/sla" target="_blank" rel="noopener noreferrer"><FileText className="w-3.5 h-3.5 mr-1.5" /> View full SLA</a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const w = window.open("/sla?print=1", "_blank");
              if (w) setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 800);
            }}
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" /> Download / Print SLA
          </Button>
        </div>
      </div>

      {isActive ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm space-y-1">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4" /> SLA accepted
          </div>
          <div className="text-muted-foreground text-xs space-y-0.5">
            {c.sla_accepted_name && <div>Accepted by <strong className="text-foreground">{c.sla_accepted_name}</strong>{c.sla_accepted_role ? `, ${c.sla_accepted_role}` : ""}</div>}
            {c.sla_accepted_at && <div>Accepted on {new Date(c.sla_accepted_at).toLocaleString()}</div>}
            <div>
              Billing: <strong className="text-foreground">{c.sla_billing_option === "annual_upfront" ? "Annual upfront (R5/member/month)" : "Monthly (R6/member/month)"}</strong>
              {c.sla_version && <> · SLA v{c.sla_version}</>}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={handleDeactivate}>Deactivate</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setOpen(true)} className="w-full md:w-auto">
          <FileSignature className="w-4 h-4 mr-2" /> Activate Participation &amp; Accept SLA
        </Button>
      )}

      <ShellyIntegrationSection club={club} />


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Activate Club Participation</DialogTitle>
            <DialogDescription>
              Review the Service Level Agreement, choose a billing option, and sign on behalf of {club.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
            <div className="rounded-md border">
              <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground">Service Level Agreement</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
                    <a href="/sla" target="_blank" rel="noopener noreferrer">View full SLA</a>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      const w = window.open("/sla?print=1", "_blank");
                      if (w) setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 800);
                    }}
                  >
                    Download / Print
                  </Button>
                </div>
              </div>
              <div className="max-h-[40vh] overflow-y-auto p-4">
                <SquashHubSlaContent />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Billing option</Label>
                <RadioGroup value={billing} onValueChange={(v) => setBilling(v as BillingOption)} className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${billing === "monthly" ? "border-primary bg-primary/5" : ""}`}>
                    <RadioGroupItem value="monthly" id="bill-monthly" />
                    <div className="text-sm">
                      <div className="font-medium">Monthly — R6 / member / month</div>
                      <div className="text-xs text-muted-foreground">Billed monthly in arrears</div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${billing === "annual_upfront" ? "border-primary bg-primary/5" : ""}`}>
                    <RadioGroupItem value="annual_upfront" id="bill-annual" />
                    <div className="text-sm">
                      <div className="font-medium">Annual upfront — R5 / member / month</div>
                      <div className="text-xs text-muted-foreground">Paid yearly in advance · save R12/member/year</div>
                    </div>
                  </label>
                </RadioGroup>
                <p className="text-xs text-amber-700 dark:text-amber-400">Fees commence September 2026 for the current financial year, and annually thereafter.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="sla-name">Your full name</Label>
                  <Input id="sla-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Smith" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sla-role">Your role at the club</Label>
                  <Input id="sla-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Chairman, Captain, Secretary" />
                </div>
              </div>

              <label className="flex items-start gap-2 cursor-pointer text-sm">
                <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
                <span>
                  I confirm that I am authorised to bind <strong>{club.name}</strong> and that the club
                  accepts the SquashHub Service Level Agreement (v{SLA_VERSION}), including the fees
                  set out above.
                </span>
              </label>
            </div>
          </div>


          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleAccept} disabled={saving || !agreed || !name.trim() || !role.trim()}>
              {saving ? "Activating..." : "Accept & Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ShellyIntegrationSection({ club }: { club: Club }) {
  const updateClub = useUpdateClub();
  const c = club as any;
  const [enabled, setEnabled] = useState<boolean>(!!c.shelly_integration_enabled);
  const [supplyMode, setSupplyMode] = useState<"self_order" | "stratsol_supply">(
    c.shelly_supply_mode || "stratsol_supply"
  );
  const [saving, setSaving] = useState(false);

  const dirty =
    enabled !== !!c.shelly_integration_enabled ||
    (enabled && supplyMode !== (c.shelly_supply_mode || ""));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateClub.mutateAsync({
        id: club.id,
        shelly_integration_enabled: enabled,
        shelly_supply_mode: enabled ? supplyMode : null,
      } as any);
      toast.success(enabled ? "Shelly PM integration preferences saved" : "Shelly PM integration disabled");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          <div>
            <h3 className="font-semibold text-sm">Shelly PM Integration</h3>
            <p className="text-xs text-muted-foreground">
              Smart power-monitoring &amp; relay control for court lights and equipment.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(!!v)} />
          <span>Enable integration</span>
        </label>
      </div>

      {enabled && (
        <div className="space-y-2 pt-1">
          <Label className="text-xs">Hardware supply</Label>
          <RadioGroup
            value={supplyMode}
            onValueChange={(v) => setSupplyMode(v as "self_order" | "stratsol_supply")}
            className="grid grid-cols-1 md:grid-cols-2 gap-2"
          >
            <label className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${supplyMode === "self_order" ? "border-primary bg-primary/5" : ""}`}>
              <RadioGroupItem value="self_order" id="shelly-self" />
              <div className="text-sm">
                <div className="font-medium">Club orders Shelly hardware</div>
                <div className="text-xs text-muted-foreground">We&apos;ll source and procure the Shelly devices ourselves.</div>
              </div>
            </label>
            <label className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${supplyMode === "stratsol_supply" ? "border-primary bg-primary/5" : ""}`}>
              <RadioGroupItem value="stratsol_supply" id="shelly-stratsol" />
              <div className="text-sm">
                <div className="font-medium">Stratsol supplies &amp; invoices</div>
                <div className="text-xs text-muted-foreground">Stratus Software Solutions orders the hardware and invoices the club.</div>
              </div>
            </label>
          </RadioGroup>
        </div>
      )}

      {dirty && (
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Shelly preferences"}
        </Button>
      )}
    </div>
  );
}

