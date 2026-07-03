import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SEO } from "@/components/SEO";
import { Building2, Users, Settings2, Plus, Pencil, Trash2, DollarSign, Clock, CreditCard, Save, FileText, Upload, X } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  price_per_member: number;
  billing_cycle: string;
  minimum_charge: number;
  max_billable_members: number | null;
  trial_days: number;
  is_default: boolean;
  active: boolean;
};

type ClubSub = {
  id: string;
  club_id: string;
  plan_id: string | null;
  status: string;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  member_count: number;
  amount_due: number;
  last_payment_at: string | null;
  cancelled_at: string | null;
  clubs?: { name: string; logo_url: string | null; subdomain: string | null };
  subscription_plans?: { name: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  trial: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  past_due: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  cancelled: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/10 text-destructive",
};

const EMPTY_INVOICE_SETTINGS = {
  company_name: "",
  trading_as: "",
  vat_number: "",
  registration_number: "",
  email: "",
  phone: "",
  address: "",
  bank_name: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_branch_code: "",
  bank_swift: "",
  invoice_prefix: "INV-",
  invoice_footer: "",
  logo_url: "",
};
type InvoiceSettings = typeof EMPTY_INVOICE_SETTINGS;

export default function SuperAdminSubscriptions() {
  const qc = useQueryClient();
  const [planDialog, setPlanDialog] = useState<Plan | "new" | null>(null);
  const [planForm, setPlanForm] = useState({ name: "", description: "", price_per_member: "5", billing_cycle: "monthly", minimum_charge: "100", trial_days: "30", is_default: false, active: true });
  const [editSub, setEditSub] = useState<ClubSub | null>(null);
  const [subForm, setSubForm] = useState({ plan_id: "", status: "", trial_ends_at: "", member_count: "0", amount_due: "0" });
  const [invoiceForm, setInvoiceForm] = useState<InvoiceSettings>(EMPTY_INVOICE_SETTINGS);
  const [invoiceDirty, setInvoiceDirty] = useState(false);

  // --- Queries ---
  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ["sa-subscription-plans"],
    queryFn: async () => {
      const { data, error } = await fromExt("subscription_plans").select("*").order("created_at");
      if (error) throw error;
      return (data || []) as Plan[];
    },
  });

  const { data: subscriptions = [], isLoading: subsLoading } = useQuery({
    queryKey: ["sa-club-subscriptions"],
    queryFn: async () => {
      const { data, error } = await fromExt("club_subscriptions")
        .select("*, clubs(name, logo_url, subdomain), subscription_plans(name)")
        .order("created_at", { ascending: false })
        .range(0, 49999);
      if (error) throw error;
      return (data || []) as ClubSub[];
    },
  });

  const { data: clubs = [] } = useQuery({
    queryKey: ["sa-clubs-for-subs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clubs").select("id, name, logo_url, subdomain").order("name").range(0, 49999);
      if (error) throw error;
      // Get member counts
      const { data: members } = await supabase.from("club_members").select("club_id").range(0, 99999);
      const countMap = new Map<string, number>();
      (members || []).forEach((m: any) => countMap.set(m.club_id, (countMap.get(m.club_id) || 0) + 1));
      return (data || []).map((c: any) => ({ ...c, member_count: countMap.get(c.id) || 0 }));
    },
  });

  // --- Invoice settings (platform / head-office) ---
  useQuery({
    queryKey: ["sa-invoice-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "platform_invoice_settings")
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      const parsed = data?.value ? { ...EMPTY_INVOICE_SETTINGS, ...JSON.parse(data.value) } : EMPTY_INVOICE_SETTINGS;
      setInvoiceForm(parsed);
      setInvoiceDirty(false);
      return parsed;
    },
  });

  const saveInvoiceSettings = useMutation({
    mutationFn: async (val: InvoiceSettings) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: "platform_invoice_settings", value: JSON.stringify(val) }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Invoice details saved"); setInvoiceDirty(false); qc.invalidateQueries({ queryKey: ["sa-invoice-settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const runBilling = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const { data, error } = await supabase.functions.invoke("run-subscription-billing", {
        body: { dryRun },
      });
      if (error) throw error;
      return data as { dryRun: boolean; processed: number; issued: number; skipped: number; failed: number };
    },
    onSuccess: (r) => {
      if (r.dryRun) {
        toast.success(`Dry-run: ${r.processed} subscription(s) would be billed`);
      } else {
        toast.success(`Billing complete — ${r.issued} issued, ${r.skipped} skipped, ${r.failed} failed`);
      }
      qc.invalidateQueries({ queryKey: ["sa-club-subscriptions"] });
    },
    onError: (e: any) => toast.error(e.message || "Billing run failed"),
  });

  const updateInvoiceField = <K extends keyof InvoiceSettings>(k: K, v: InvoiceSettings[K]) => {
    setInvoiceForm(f => ({ ...f, [k]: v }));
    setInvoiceDirty(true);
  };

  const handleLogoUpload = (file: File | null) => {
    if (!file) return;
    if (file.size > 500_000) { toast.error("Logo must be under 500 KB"); return; }
    const reader = new FileReader();
    reader.onload = () => updateInvoiceField("logo_url", String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  // --- Plan mutations ---
  const savePlan = useMutation({
    mutationFn: async (plan: Partial<Plan> & { id?: string }) => {
      const payload = {
        name: plan.name!,
        description: plan.description || null,
        price_per_member: Number(plan.price_per_member),
        billing_cycle: plan.billing_cycle!,
        minimum_charge: Number(plan.minimum_charge),
        trial_days: Number(plan.trial_days),
        is_default: plan.is_default || false,
        active: plan.active ?? true,
      };
      if (plan.id) {
        const { error } = await fromExt("subscription_plans").update(payload).eq("id", plan.id);
        if (error) throw error;
      } else {
        const { error } = await fromExt("subscription_plans").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Plan saved"); qc.invalidateQueries({ queryKey: ["sa-subscription-plans"] }); setPlanDialog(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromExt("subscription_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plan deleted"); qc.invalidateQueries({ queryKey: ["sa-subscription-plans"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const assignSub = useMutation({
    mutationFn: async ({ clubId, planId }: { clubId: string; planId: string }) => {
      const plan = plans.find(p => p.id === planId);
      const club = clubs.find((c: any) => c.id === clubId);
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + (plan?.trial_days || 30));

      const { error } = await fromExt("club_subscriptions").upsert({
        club_id: clubId,
        plan_id: planId,
        status: "trial",
        trial_ends_at: trialEnd.toISOString(),
        member_count: club?.member_count || 0,
        amount_due: Math.max(
          (club?.member_count || 0) * (plan?.price_per_member || 0),
          plan?.minimum_charge || 0
        ),
        current_period_start: new Date().toISOString(),
        current_period_end: trialEnd.toISOString(),
      }, { onConflict: "club_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Subscription assigned"); qc.invalidateQueries({ queryKey: ["sa-club-subscriptions"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateSub = useMutation({
    mutationFn: async (vals: { id: string; plan_id: string; status: string; trial_ends_at: string | null; member_count: number; amount_due: number }) => {
      const { error } = await fromExt("club_subscriptions").update({
        plan_id: vals.plan_id || null,
        status: vals.status,
        trial_ends_at: vals.trial_ends_at || null,
        member_count: vals.member_count,
        amount_due: vals.amount_due,
      }).eq("id", vals.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Subscription updated"); qc.invalidateQueries({ queryKey: ["sa-club-subscriptions"] }); setEditSub(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEditSub = (sub: ClubSub) => {
    setEditSub(sub);
    setSubForm({
      plan_id: sub.plan_id || "",
      status: sub.status,
      trial_ends_at: sub.trial_ends_at ? sub.trial_ends_at.split("T")[0] : "",
      member_count: String(sub.member_count),
      amount_due: String(sub.amount_due),
    });
  };

  const recalcAmount = (planId: string, memberCount: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    const count = Number(memberCount) || 0;
    const calculated = Math.max(count * plan.price_per_member, plan.minimum_charge);
    setSubForm(f => ({ ...f, amount_due: String(calculated) }));
  };

  const openPlanDialog = (plan: Plan | "new") => {
    if (plan === "new") {
      setPlanForm({ name: "", description: "", price_per_member: "5", billing_cycle: "monthly", minimum_charge: "100", trial_days: "30", is_default: false, active: true });
    } else {
      setPlanForm({
        name: plan.name,
        description: plan.description || "",
        price_per_member: String(plan.price_per_member),
        billing_cycle: plan.billing_cycle,
        minimum_charge: String(plan.minimum_charge),
        trial_days: String(plan.trial_days),
        is_default: plan.is_default,
        active: plan.active,
      });
    }
    setPlanDialog(plan);
  };

  const handleSavePlan = () => {
    savePlan.mutate({
      id: planDialog !== "new" ? (planDialog as Plan)?.id : undefined,
      ...planForm,
      price_per_member: Number(planForm.price_per_member) as any,
      minimum_charge: Number(planForm.minimum_charge) as any,
      trial_days: Number(planForm.trial_days) as any,
    });
  };

  const defaultPlan = plans.find(p => p.is_default);
  const subscribedClubIds = new Set(subscriptions.map(s => s.club_id));
  const unsubscribedClubs = clubs.filter((c: any) => !subscribedClubIds.has(c.id));

  return (
    <div className="space-y-6 text-[13px]">
      <SEO title="Subscriptions — Super Admin" noIndex />
      <div>
        <h2 className="text-2xl font-bold text-foreground">Subscriptions & Billing</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage SaaS pricing plans and club subscriptions</p>
      </div>

      <Tabs defaultValue="plans" className="w-full">
        <TabsList className="h-8">
          <TabsTrigger value="plans" className="text-xs h-7 px-3"><Settings2 className="w-3.5 h-3.5 mr-1" />Fee Structure</TabsTrigger>
          <TabsTrigger value="clubs" className="text-xs h-7 px-3"><Building2 className="w-3.5 h-3.5 mr-1" />Club Subscriptions</TabsTrigger>
          <TabsTrigger value="invoice" className="text-xs h-7 px-3"><FileText className="w-3.5 h-3.5 mr-1" />Invoice Details</TabsTrigger>
        </TabsList>

        {/* ─── FEE STRUCTURE TAB ─── */}
        <TabsContent value="plans" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Configure per-member pricing plans that clubs subscribe to
            </p>
            <Button size="sm" onClick={() => openPlanDialog("new")} className="h-7 text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Plan
            </Button>
          </div>

          {plansLoading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : plans.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">No pricing plans configured yet</Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map(plan => (
                <Card key={plan.id} className={`p-4 space-y-3 relative ${!plan.active ? "opacity-60" : ""}`}>
                  {plan.is_default && (
                    <Badge className="absolute top-2 right-2 text-[10px] h-5 bg-primary/10 text-primary border-primary/20">Default</Badge>
                  )}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
                    {plan.description && <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-mono font-medium text-foreground">R{plan.price_per_member}</span>
                      <span className="text-muted-foreground">/ member / {plan.billing_cycle === "monthly" ? "month" : "year"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Min charge:</span>
                      <span className="font-mono font-medium text-foreground">R{plan.minimum_charge}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Free trial:</span>
                      <span className="font-medium text-foreground">{plan.trial_days} days</span>
                    </div>
                  </div>
                  <div className="flex gap-1 pt-1">
                    <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => openPlanDialog(plan)}>
                      <Pencil className="w-3 h-3 mr-1" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] text-destructive" onClick={() => deletePlan.mutate(plan.id)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── CLUB SUBSCRIPTIONS TAB ─── */}
        <TabsContent value="clubs" className="space-y-4 mt-4">
          {unsubscribedClubs.length > 0 && defaultPlan && (
            <Card className="p-3 border-dashed">
              <p className="text-xs text-muted-foreground mb-2">
                <strong>{unsubscribedClubs.length}</strong> club(s) without a subscription. Assign the default plan:
              </p>
              <div className="flex flex-wrap gap-2">
                {unsubscribedClubs.slice(0, 5).map((c: any) => (
                  <Button
                    key={c.id}
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => assignSub.mutate({ clubId: c.id, planId: defaultPlan.id })}
                    disabled={assignSub.isPending}
                  >
                    <Plus className="w-3 h-3 mr-1" /> {c.name}
                  </Button>
                ))}
                {unsubscribedClubs.length > 5 && (
                  <span className="text-xs text-muted-foreground self-center">+{unsubscribedClubs.length - 5} more</span>
                )}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Club</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Members</TableHead>
                  <TableHead className="text-right">Amount Due</TableHead>
                  <TableHead>Trial Ends</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subsLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : subscriptions.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No subscriptions yet</TableCell></TableRow>
                ) : (
                  subscriptions.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {sub.clubs?.logo_url ? (
                            <img src={sub.clubs.logo_url} alt="" className="h-7 w-7 rounded-md object-cover" />
                          ) : (
                            <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <span className="font-medium text-foreground text-xs">{sub.clubs?.name}</span>
                            {sub.clubs?.subdomain && (
                              <p className="text-[10px] text-muted-foreground">{sub.clubs.subdomain}.squashhub.co.za</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{sub.subscription_plans?.name || "—"}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`text-[10px] ${STATUS_COLORS[sub.status] || ""}`}>
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-[10px]">
                          <Users className="h-3 w-3 mr-0.5" />{sub.member_count}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        R{Number(sub.amount_due).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {sub.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditSub(sub)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ─── INVOICE DETAILS TAB ─── */}
        <TabsContent value="invoice" className="space-y-4 mt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                Head-office details printed on every club subscription invoice
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                These details appear as the "From" party on monthly/annual invoices auto-generated for each active club subscription.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => runBilling.mutate(true)}
                disabled={runBilling.isPending}
                title="Preview what would be billed (no invoices created)"
              >
                Dry-Run
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  if (confirm("Generate and email invoices for every active subscription now?")) {
                    runBilling.mutate(false);
                  }
                }}
                disabled={runBilling.isPending}
              >
                {runBilling.isPending ? "Running..." : "Run Billing Now"}
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => saveInvoiceSettings.mutate(invoiceForm)}
                disabled={!invoiceDirty || saveInvoiceSettings.isPending}
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                {saveInvoiceSettings.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Logo card */}
            <Card className="p-4 space-y-3">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Company Logo</h3>
              <div className="flex items-center justify-center border-2 border-dashed border-border rounded-md h-32 bg-muted/30 relative overflow-hidden">
                {invoiceForm.logo_url ? (
                  <>
                    <img src={invoiceForm.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-1 right-1 h-6 w-6 bg-background/80"
                      onClick={() => updateInvoiceField("logo_url", "")}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </>
                ) : (
                  <span className="text-[11px] text-muted-foreground">No logo uploaded</span>
                )}
              </div>
              <label className="flex items-center justify-center gap-1.5 h-8 text-xs border border-input rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload logo (PNG/JPG, &lt; 500 KB)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleLogoUpload(e.target.files?.[0] || null)}
                />
              </label>
            </Card>

            {/* Company card */}
            <Card className="p-4 space-y-3 lg:col-span-2">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Company / Head Office</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Registered Name</Label>
                  <Input className="h-8 text-xs" value={invoiceForm.company_name} onChange={e => updateInvoiceField("company_name", e.target.value)} placeholder="Straight to Software Solutions (Pty) Ltd" />
                </div>
                <div>
                  <Label className="text-xs">Trading As</Label>
                  <Input className="h-8 text-xs" value={invoiceForm.trading_as} onChange={e => updateInvoiceField("trading_as", e.target.value)} placeholder="SquashHub" />
                </div>
                <div>
                  <Label className="text-xs">VAT Number</Label>
                  <Input className="h-8 text-xs font-mono" value={invoiceForm.vat_number} onChange={e => updateInvoiceField("vat_number", e.target.value)} placeholder="4123456789" />
                </div>
                <div>
                  <Label className="text-xs">Registration Number</Label>
                  <Input className="h-8 text-xs font-mono" value={invoiceForm.registration_number} onChange={e => updateInvoiceField("registration_number", e.target.value)} placeholder="2024/123456/07" />
                </div>
                <div>
                  <Label className="text-xs">Billing Email</Label>
                  <Input type="email" className="h-8 text-xs" value={invoiceForm.email} onChange={e => updateInvoiceField("email", e.target.value)} placeholder="billing@squashhub.co.za" />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input className="h-8 text-xs" value={invoiceForm.phone} onChange={e => updateInvoiceField("phone", e.target.value)} placeholder="+27 ..." />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Postal / Physical Address</Label>
                  <Textarea rows={2} className="text-xs" value={invoiceForm.address} onChange={e => updateInvoiceField("address", e.target.value)} placeholder="Street, City, Postal Code, Country" />
                </div>
              </div>
            </Card>

            {/* Bank card */}
            <Card className="p-4 space-y-3 lg:col-span-2">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Banking Details</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Bank Name</Label>
                  <Input className="h-8 text-xs" value={invoiceForm.bank_name} onChange={e => updateInvoiceField("bank_name", e.target.value)} placeholder="FNB" />
                </div>
                <div>
                  <Label className="text-xs">Account Name</Label>
                  <Input className="h-8 text-xs" value={invoiceForm.bank_account_name} onChange={e => updateInvoiceField("bank_account_name", e.target.value)} placeholder="Straight to Software Solutions" />
                </div>
                <div>
                  <Label className="text-xs">Account Number</Label>
                  <Input className="h-8 text-xs font-mono" value={invoiceForm.bank_account_number} onChange={e => updateInvoiceField("bank_account_number", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Branch Code</Label>
                  <Input className="h-8 text-xs font-mono" value={invoiceForm.bank_branch_code} onChange={e => updateInvoiceField("bank_branch_code", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">SWIFT / BIC (optional)</Label>
                  <Input className="h-8 text-xs font-mono" value={invoiceForm.bank_swift} onChange={e => updateInvoiceField("bank_swift", e.target.value)} placeholder="FIRNZAJJ" />
                </div>
              </div>
            </Card>

            {/* Invoice options */}
            <Card className="p-4 space-y-3">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Invoice Options</h3>
              <div>
                <Label className="text-xs">Invoice Number Prefix</Label>
                <Input className="h-8 text-xs font-mono" value={invoiceForm.invoice_prefix} onChange={e => updateInvoiceField("invoice_prefix", e.target.value)} placeholder="INV-" />
                <p className="text-[10px] text-muted-foreground mt-1">e.g. {invoiceForm.invoice_prefix || "INV-"}2026-00001</p>
              </div>
              <div>
                <Label className="text-xs">Footer / Terms</Label>
                <Textarea rows={3} className="text-xs" value={invoiceForm.invoice_footer} onChange={e => updateInvoiceField("invoice_footer", e.target.value)} placeholder="Payment due within 14 days. E&OE." />
              </div>
            </Card>
          </div>

          <Card className="p-3 border-dashed bg-muted/30">
            <p className="text-[11px] text-muted-foreground">
              <strong className="text-foreground">Automated billing:</strong> Once configured, an invoice will be auto-generated at the end of each billing period for every club with an active subscription — using their assigned plan, the member count on the run date, and these head-office details as the sender.
            </p>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Plan Dialog ─── */}
      <Dialog open={!!planDialog} onOpenChange={(o) => !o && setPlanDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{planDialog === "new" ? "Create Plan" : "Edit Plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Plan Name</Label>
              <Input value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Standard" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={planForm.description} onChange={e => setPlanForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Price per Member (R)</Label>
                <Input type="number" min="0" step="0.01" value={planForm.price_per_member} onChange={e => setPlanForm(f => ({ ...f, price_per_member: e.target.value }))} className="h-8 text-xs font-mono" />
              </div>
              <div>
                <Label className="text-xs">Billing Cycle</Label>
                <Select value={planForm.billing_cycle} onValueChange={v => setPlanForm(f => ({ ...f, billing_cycle: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Minimum Charge (R)</Label>
                <Input type="number" min="0" step="1" value={planForm.minimum_charge} onChange={e => setPlanForm(f => ({ ...f, minimum_charge: e.target.value }))} className="h-8 text-xs font-mono" />
              </div>
              <div>
                <Label className="text-xs">Free Trial (days)</Label>
                <Input type="number" min="0" value={planForm.trial_days} onChange={e => setPlanForm(f => ({ ...f, trial_days: e.target.value }))} className="h-8 text-xs font-mono" />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Switch checked={planForm.is_default} onCheckedChange={v => setPlanForm(f => ({ ...f, is_default: v }))} />
                <Label className="text-xs">Default plan for new clubs</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={planForm.active} onCheckedChange={v => setPlanForm(f => ({ ...f, active: v }))} />
                <Label className="text-xs">Active</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPlanDialog(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSavePlan} disabled={savePlan.isPending || !planForm.name.trim()}>
              {savePlan.isPending ? "Saving..." : "Save Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Subscription Dialog ─── */}
      <Dialog open={!!editSub} onOpenChange={(o) => !o && setEditSub(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Subscription — {editSub?.clubs?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Subscription Plan</Label>
              <Select value={subForm.plan_id} onValueChange={v => { setSubForm(f => ({ ...f, plan_id: v })); recalcAmount(v, subForm.member_count); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  {plans.filter(p => p.active).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — R{p.price_per_member}/member</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={subForm.status} onValueChange={v => setSubForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="past_due">Past Due</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Member Count</Label>
                <Input type="number" min="0" value={subForm.member_count} onChange={e => { setSubForm(f => ({ ...f, member_count: e.target.value })); recalcAmount(subForm.plan_id, e.target.value); }} className="h-8 text-xs font-mono" />
              </div>
              <div>
                <Label className="text-xs">Amount Due (R)</Label>
                <Input type="number" min="0" step="0.01" value={subForm.amount_due} onChange={e => setSubForm(f => ({ ...f, amount_due: e.target.value }))} className="h-8 text-xs font-mono" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Trial Ends</Label>
              <Input type="date" value={subForm.trial_ends_at} onChange={e => setSubForm(f => ({ ...f, trial_ends_at: e.target.value }))} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditSub(null)}>Cancel</Button>
            <Button size="sm" onClick={() => editSub && updateSub.mutate({ id: editSub.id, plan_id: subForm.plan_id, status: subForm.status, trial_ends_at: subForm.trial_ends_at || null, member_count: Number(subForm.member_count), amount_due: Number(subForm.amount_due) })} disabled={updateSub.isPending}>
              {updateSub.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
