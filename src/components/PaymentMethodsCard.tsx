import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, CreditCard, ShieldCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { buildStitchReturnUrl, openStitchCheckout, openStitchMandateWindow, closeStitchMandateWindow } from "@/lib/stitch-checkout";
import { useClubCurrency } from "@/hooks/use-currency";
import { toast } from "sonner";

type Mandate = {
  id: string;
  rail: string;
  mandate_type: "card_consent" | "subscription";
  max_amount_cents: number;
  debit_day: number | null;
  status: "pending" | "active" | "cancelled" | "failed";
  auth_url: string | null;
  authorised_at: string | null;
  fee_category_id: string | null;
};

type FeeCategory = {
  id: string;
  name: string;
  annual_fee: number;
  debit_order_eligible: boolean;
  debit_order_rail: "debicheck" | "eft" | "either";
};

interface Props {
  clubId: string;
  clubMemberId: string;
  paymentGateway: string | null | undefined;
  memberFeeCategoryId?: string | null;
}

export default function PaymentMethodsCard({ clubId, clubMemberId, paymentGateway, memberFeeCategoryId }: Props) {
  const qc = useQueryClient();
  const { format: fmtMoney } = useClubCurrency();
  const money = (n: number) => fmtMoney(n, 2);
  const [setupOpen, setSetupOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<FeeCategory | null>(null);
  
  const [months, setMonths] = useState("6");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [debitDay, setDebitDay] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  // Stitch parks payers on its own "complete" page and never redirects back,
  // so we keep this tab open and watch the mandate until it activates.
  const [awaitingId, setAwaitingId] = useState<string | null>(null);
  const [awaitingUrl, setAwaitingUrl] = useState<string | null>(null);
  const [awaitingDone, setAwaitingDone] = useState(false);

  const { data: mandates = [], isLoading: mandatesLoading } = useQuery({
    queryKey: ["stitch-mandates", clubMemberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stitch_mandates")
        .select("*")
        .eq("club_member_id", clubMemberId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Mandate[];
    },
    enabled: !!clubMemberId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["debit-order-fee-categories", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_fee_categories")
        .select("id, name, annual_fee, debit_order_eligible, debit_order_rail")
        .eq("club_id", clubId)
        .eq("debit_order_eligible", true);
      if (error) throw error;
      return (data || []) as unknown as FeeCategory[];
    },
    enabled: !!clubId,
  });

  // Fallback annual amount: the member's own fee category (even if it isn't
  // flagged debit-order eligible) and, failing that, their outstanding fees.
  const { data: fallbackAnnual = 0 } = useQuery({
    queryKey: ["debit-order-fallback-annual", clubMemberId, memberFeeCategoryId],
    queryFn: async () => {
      if (memberFeeCategoryId) {
        const { data } = await supabase
          .from("member_fee_categories")
          .select("annual_fee")
          .eq("id", memberFeeCategoryId)
          .maybeSingle();
        const annual = Number((data as any)?.annual_fee || 0);
        if (annual > 0) return annual;
      }
      const { data: fees } = await supabase
        .from("club_member_fee_payments")
        .select("amount")
        .eq("club_member_id", clubMemberId)
        .eq("paid", false);
      return (fees || []).reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
    },
    enabled: !!clubMemberId,
  });

  // Every member must be able to set up a monthly recurring payment, even if
  // their fee category isn't flagged debit-order eligible (or they have none).
  const GENERAL_CATEGORY: FeeCategory = {
    id: "__general__",
    name: "Monthly club fees",
    annual_fee: 0,
    debit_order_eligible: true,
    debit_order_rail: "either",
  };

  // Annual amount to split for a category — never 0 when we can infer one.
  const annualFor = (cat: FeeCategory | null) => {
    const own = Number(cat?.annual_fee || 0);
    return own > 0 ? own : Number(fallbackAnnual || 0);
  };

  const visibleCategories = useMemo(() => {
    const mine = memberFeeCategoryId
      ? categories.filter((c) => c.id === memberFeeCategoryId)
      : [];
    const base = mine.length > 0 ? mine : categories;
    return [...base, GENERAL_CATEGORY];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, memberFeeCategoryId]);


  const activeMandates = useMemo(
    () => mandates.filter((m) => m.status === "active" || m.status === "pending"),
    [mandates],
  );

  // Refresh a single pending mandate against Stitch (webhook may have missed it)
  async function refreshMandate(mandateId: string, silent = false) {
    try {
      const { data, error } = await supabase.functions.invoke("stitch-refresh-mandate", {
        body: { mandate_id: mandateId },
      });
      if (error) throw error;
      const payload = (data as any) || {};
      // MANDATE_NOT_FOUND is a soft error — the edge function has already
      // marked the local row as failed, so just refresh the list.
      if (payload.error === "MANDATE_NOT_FOUND") {
        qc.invalidateQueries({ queryKey: ["stitch-mandates", clubMemberId] });
        if (!silent) {
          toast.error("Authorisation was not completed at Stitch. Please start again.");
        }
        return;
      }
      if (payload.error) throw new Error(payload.error);
      qc.invalidateQueries({ queryKey: ["stitch-mandates", clubMemberId] });
      if (!silent) {
        const s = payload.status;
        if (s === "active") toast.success("Card payment is now active");
        else if (s === "pending") toast.info("Still awaiting authorisation on Stitch");
        else toast.info(`Status: ${s}`);
      }
    } catch (e: any) {
      if (!silent) toast.error(e?.message || "Could not refresh status");
    }
  }


  // On return from Stitch, refresh
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("mandate")) {
      qc.invalidateQueries({ queryKey: ["stitch-mandates", clubMemberId] });
      url.searchParams.delete("mandate");
      window.history.replaceState({}, "", url.toString());
    }
  }, [clubMemberId, qc]);

  // Auto-sync any pending mandates on mount (covers missed webhooks)
  useEffect(() => {
    const pending = mandates.filter((m) => m.status === "pending");
    pending.forEach((m) => refreshMandate(m.id, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandates.length]);

  // While a setup is pending, keep polling in the background for ~3 minutes.
  // Stitch webhooks can be delayed, and members were re-starting the whole
  // setup (creating duplicate mandates) because nothing changed on screen.
  useEffect(() => {
    const pendingIds = mandates.filter((m) => m.status === "pending").map((m) => m.id);
    if (!pendingIds.length) return;
    let ticks = 0;
    const t = setInterval(() => {
      ticks++;
      pendingIds.forEach((id) => refreshMandate(id, true));
      if (ticks >= 18) clearInterval(t);
    }, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandates.map((m) => `${m.id}:${m.status}`).join(",")]);

  // Active watch while the payer is authorising in the Stitch tab. Stitch's
  // hosted card-consent / subscribe pages ignore merchantRedirectUrl and leave
  // the payer on express.stitch.money/card-consent/complete, so the app tab
  // does the returning instead: poll every 4s for up to ~8 minutes.
  useEffect(() => {
    if (!awaitingId || awaitingDone) return;
    let stopped = false;
    let ticks = 0;
    const tick = async () => {
      ticks++;
      try {
        const { data } = await supabase.functions.invoke("stitch-refresh-mandate", {
          body: { mandate_id: awaitingId },
        });
        const status = String((data as any)?.status || "");
        if (stopped) return;
        if (status === "active") {
          setAwaitingDone(true);
          void closeStitchMandateWindow();
          qc.invalidateQueries({ queryKey: ["stitch-mandates", clubMemberId] });
          qc.invalidateQueries({ queryKey: ["member-credit-transactions"] });
          toast.success("Recurring card payment activated");
          return;
        }
        if (["failed", "cancelled"].includes(status)) {
          setAwaitingDone(true);
          qc.invalidateQueries({ queryKey: ["stitch-mandates", clubMemberId] });
          return;
        }
      } catch { /* keep waiting */ }
      if (!stopped && ticks < 120) setTimeout(tick, 4000);
    };
    void tick();
    return () => { stopped = true; };
  }, [awaitingId, awaitingDone, clubMemberId, qc]);

  // Re-check as soon as the member switches back to the app tab.
  useEffect(() => {
    if (!awaitingId || awaitingDone) return;
    const onFocus = () => { void refreshMandate(awaitingId, true); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingId, awaitingDone]);


  // Auto-recalculate monthly amount when months changes (unless user typed an override)
  // MUST be declared before any conditional early-return to satisfy Rules of Hooks.
  useEffect(() => {
    if (!selectedCategory || amountTouched) return;
    const n = Number(months);
    const annual = annualFor(selectedCategory);
    if (n > 0 && annual > 0) setAmount((annual / n).toFixed(2));
  }, [months, selectedCategory, amountTouched, fallbackAnnual]);

  if (paymentGateway !== "stitch") return null;
  

  const pendingMandate = mandates.find((m) => m.status === "pending") || null;

  // Re-open the existing Stitch link instead of creating another mandate.
  async function resumeSetup(m: Mandate) {
    if (!m.auth_url) {
      toast.error("This setup has no link left — cancel it and start again.");
      return;
    }
    await refreshMandate(m.id, true);
    setAwaitingDone(false);
    setAwaitingUrl(normalizeAuthUrl(m.auth_url));
    setAwaitingId(m.id);
    await openStitchMandateWindow(normalizeAuthUrl(m.auth_url));
  }

  function openSetup(cat: FeeCategory) {
    // Guard: one setup at a time. Retrying with a new mandate is what caused
    // members to end up with several half-finished authorisations.
    if (pendingMandate) {
      toast.info("You already have a setup waiting for authorisation — finishing that one instead.");
      resumeSetup(pendingMandate);
      return;
    }
    setSelectedCategory(cat);
    const defaultMonths = 6;
    setMonths(String(defaultMonths));
    const annual = annualFor(cat);
    setAmount(annual > 0 ? (annual / defaultMonths).toFixed(2) : "");

    setAmountTouched(false);
    setDebitDay("1");
    setSetupOpen(true);
  }


  async function submitSetup() {
    if (!selectedCategory) return;
    if (pendingMandate) {
      setSetupOpen(false);
      toast.info("Finishing your existing setup instead of starting a new one.");
      resumeSetup(pendingMandate);
      return;
    }
    const amt = Number(amount);
    if (!(amt > 0)) {
      toast.error("Enter a valid amount");
      return;
    }
    setSubmitting(true);

    try {
      const returnUrl = buildStitchReturnUrl("/my-account?mandate=pending");
      const { data, error } = await supabase.functions.invoke("stitch-create-mandate", {
        body: {
          club_id: clubId,
          club_member_id: clubMemberId,
          fee_category_id: selectedCategory.id === "__general__" ? null : selectedCategory.id,
          mandate_type: "subscription",
          max_amount: amt,
          debit_day: Number(debitDay) || 1,
          return_url: returnUrl,
        },
      });
      if (error) throw error;
      if (data?.auth_url) {
        setSetupOpen(false);
        setAwaitingDone(false);
        setAwaitingUrl(data.auth_url);
        setAwaitingId(data.mandate_id || null);
        await openStitchMandateWindow(data.auth_url);
        return;
      }
      toast.success("Mandate created — awaiting authorisation");
      qc.invalidateQueries({ queryKey: ["stitch-mandates", clubMemberId] });
      setSetupOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to set up recurring card payment");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelMandate(mandateId: string) {
    if (!confirm("Cancel this recurring card payment? You can set it up again later.")) return;
    try {
      const { error } = await supabase.functions.invoke("stitch-cancel-mandate", {
        body: { mandate_id: mandateId },
      });
      if (error) throw error;
      toast.success("Recurring card payment cancelled");
      qc.invalidateQueries({ queryKey: ["stitch-mandates", clubMemberId] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to cancel");
    }
  }

  function normalizeAuthUrl(raw: string) {
    try {
      const url = new URL(raw);
      const redirect = url.searchParams.get("redirect_uri") || url.searchParams.get("redirect_url");
      if (redirect) {
        const returnUrl = new URL(redirect);
        if (returnUrl.pathname === "/account") {
          returnUrl.pathname = "/my-account";
          url.searchParams.set(url.searchParams.has("redirect_uri") ? "redirect_uri" : "redirect_url", returnUrl.toString());
        }
      }
      return url.toString();
    } catch {
      return raw;
    }
  }

  function nextDebitDate(day: number): Date {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    function makeDate(year: number, month: number, dayOfMonth: number): Date {
      const d = new Date(year, month, dayOfMonth);
      if (d.getMonth() !== month) {
        return new Date(year, month + 1, 0);
      }
      return d;
    }

    const candidate = makeDate(currentYear, currentMonth, day);
    const startOfToday = new Date(currentYear, currentMonth, today.getDate());
    if (candidate >= startOfToday) return candidate;
    return makeDate(currentYear, currentMonth + 1, day);
  }

  function formatDate(d: Date): string {
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  }

  const railLabel = (_r: string) => "Monthly recurring card";

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      active: "bg-green-500/10 text-green-700 border-green-500/20",
      pending: "bg-amber-500/10 text-amber-700 border-amber-500/20",
      failed: "bg-destructive/10 text-destructive border-destructive/20",
      cancelled: "bg-muted text-muted-foreground border-border",
    };
    return map[s] || map.cancelled;
  };

  return (
    <motion.div
      className="px-4 mt-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <h2 className="text-sm font-semibold font-heading mb-2 flex items-center gap-2">
        <CreditCard className="w-4 h-4" /> Payment methods
      </h2>

      <Card className="p-3 space-y-3">
        {mandatesLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : activeMandates.length > 0 ? (
          <div className="space-y-2">
            {activeMandates.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 p-2 border rounded-md bg-muted/40">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
                    <span className="text-xs font-medium">{railLabel(m.rail)} payment</span>
                    <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${statusBadge(m.status)}`}>
                      {m.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Up to {money(m.max_amount_cents / 100)} charged to your card each month
                    {m.debit_day ? ` · monthly charge day ${m.debit_day}` : ""}
                  </p>

                  {m.status === "pending" && (
                    <div className="mt-1 space-y-1">
                      <p className="text-[11px] text-amber-700 leading-snug">
                        Waiting for you to finish the authorisation at Stitch. Your first monthly
                        instalment is charged there and credited to your club account.
                        Don't start a new setup — reopen this one.
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {m.auth_url && (
                          <Button size="sm" className="h-6 text-[11px] px-2" onClick={() => resumeSetup(m)}>
                            Finish authorisation
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => refreshMandate(m.id)}
                          className="text-[11px] text-muted-foreground underline"
                        >
                          Check status
                        </button>
                      </div>
                    </div>
                  )}

                </div>
                <Button size="sm" variant="ghost" onClick={() => cancelMandate(m.id)} className="h-7 px-2">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No recurring card payment set up yet. Choose a fee category below to pay automatically from your card each month.
          </p>
        )}

        {visibleCategories.length > 0 && (
          <div className="border-t pt-2 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">
              Set up monthly card payment
            </p>
            {visibleCategories.map((cat) => {
              const existing = activeMandates.find((m) => m.fee_category_id === cat.id
                || (cat.id === "__general__" && !m.fee_category_id));
              const isActive = existing?.status === "active";
              const isPending = !!pendingMandate;
              return (
                <div key={cat.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{cat.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {annualFor(cat) > 0
                        ? `${money(annualFor(cat))} / year`
                        : "You choose the monthly amount"}
                    </p>

                  </div>
                  <Button
                    size="sm"
                    variant={isActive ? "outline" : isPending ? "secondary" : "default"}
                    disabled={isActive}
                    onClick={() => (isPending ? resumeSetup(pendingMandate!) : openSetup(cat))}
                    className="h-7 text-xs"
                  >
                    {isActive ? "Active" : isPending ? "Finish setup" : "Set up"}
                  </Button>
                </div>
              );
            })}

          </div>
        )}
      </Card>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set up monthly card payment</DialogTitle>
            <DialogDescription>
              {selectedCategory?.name} — authorise your card once so this fee is charged automatically each month.
              The amount below will be charged on your chosen day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-amber-500/10 p-2 text-[11px] leading-snug">
              <p className="font-medium text-amber-900">
                First month ({money(Number(amount) || 0)}) is charged when you activate
              </p>
              <p className="mt-0.5 text-amber-800">
                When you approve the card authorisation, your <strong>first monthly instalment
                of {money(Number(amount) || 0)}</strong> is charged straight away — nothing extra,
                no separate verification fee. It is credited to your club account immediately and
                settles your oldest outstanding fees. Thereafter the same amount is charged
                automatically on your chosen day each month.
              </p>
            </div>

            <div>
              <Label className="text-xs">Split annual fee over (months)</Label>

              <Select value={months} onValueChange={(v) => { setMonths(v); setAmountTouched(false); }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 4, 6, 10, 12].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} months {annualFor(selectedCategory) > 0 ? `· ${money(annualFor(selectedCategory) / n)} / month` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Monthly amount (R)</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Monthly charge day</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={debitDay}
                  onChange={(e) => setDebitDay(e.target.value)}
                  className="h-9"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Your card will be charged on this day each month, starting next cycle.
                </p>
              </div>
            </div>
            {selectedCategory && (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  {annualFor(selectedCategory) > 0 ? (
                    <>
                      Annual fee {money(annualFor(selectedCategory))} ÷ {months} ={" "}
                      {money(annualFor(selectedCategory) / Math.max(Number(months) || 1, 1))} per month.{" "}
                    </>
                  ) : null}
                  You can override the monthly amount above. Cancel any time from this screen.

                </p>
                <p className="text-[11px] font-medium text-primary">
                  Charged now on activation: {money(Number(amount) || 0)} · then {money(Number(amount) || 0)}{" "}
                  on {formatDate(nextDebitDate(Number(debitDay) || 1))} and monthly thereafter
                </p>
              </div>
            )}

          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSetupOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submitSetup} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue to Stitch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
