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

  const visibleCategories = useMemo(() => {
    if (!memberFeeCategoryId) return categories;
    const mine = categories.filter((c) => c.id === memberFeeCategoryId);
    return mine.length > 0 ? mine : categories;
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

  // Auto-recalculate monthly amount when months changes (unless user typed an override)
  // MUST be declared before any conditional early-return to satisfy Rules of Hooks.
  useEffect(() => {
    if (!selectedCategory || amountTouched) return;
    const n = Number(months);
    const annual = Number(selectedCategory.annual_fee || 0);
    if (n > 0 && annual > 0) setAmount((annual / n).toFixed(2));
  }, [months, selectedCategory, amountTouched]);

  if (paymentGateway !== "stitch") return null;
  if (visibleCategories.length === 0 && activeMandates.length === 0) return null;

  function openSetup(cat: FeeCategory) {
    setSelectedCategory(cat);
    const defaultMonths = 6;
    setMonths(String(defaultMonths));
    const annual = Number(cat.annual_fee || 0);
    setAmount(annual > 0 ? (annual / defaultMonths).toFixed(2) : "");
    setAmountTouched(false);
    setDebitDay("1");
    setSetupOpen(true);
  }

  async function submitSetup() {
    if (!selectedCategory) return;
    const amt = Number(amount);
    if (!(amt > 0)) {
      toast.error("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      const returnUrl = `${window.location.origin}/my-account?mandate=pending`;
      const { data, error } = await supabase.functions.invoke("stitch-create-mandate", {
        body: {
          club_id: clubId,
          club_member_id: clubMemberId,
          fee_category_id: selectedCategory.id,
          mandate_type: "subscription",
          max_amount: amt,
          debit_day: Number(debitDay) || 1,
          return_url: returnUrl,
        },
      });
      if (error) throw error;
      if (data?.auth_url) {
        window.location.href = data.auth_url;
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
      const redirect = url.searchParams.get("redirect_url");
      if (redirect) {
        const returnUrl = new URL(redirect);
        if (returnUrl.pathname === "/account") {
          returnUrl.pathname = "/my-account";
          url.searchParams.set("redirect_url", returnUrl.toString());
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
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.auth_url && (
                        <a href={normalizeAuthUrl(m.auth_url)} className="text-[11px] text-primary underline">
                          Complete authorisation →
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => refreshMandate(m.id)}
                        className="text-[11px] text-muted-foreground underline"
                      >
                        Check status
                      </button>
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
              const has = activeMandates.some((m) => m.fee_category_id === cat.id);
              return (
                <div key={cat.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{cat.name}</p>
                    <p className="text-[10px] text-muted-foreground">{money(Number(cat.annual_fee || 0))} / month</p>
                  </div>
                  <Button
                    size="sm"
                    variant={has ? "outline" : "default"}
                    disabled={has}
                    onClick={() => openSetup(cat)}
                    className="h-7 text-xs"
                  >
                    {has ? "Active" : "Set up"}
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
              <p className="font-medium text-amber-900">R20 authorisation charge</p>
              <p className="mt-0.5 text-amber-800">
                Stitch will make a once-off R20 authorisation charge on your card now to verify it
                and confirm consent. This is <strong>not</strong> your monthly fee.
                Your first regular monthly card charge will run on the day you choose below.
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
                      {n} months {selectedCategory ? `· R${(Number(selectedCategory.annual_fee || 0) / n).toFixed(2)} / month` : ""}
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
                  Annual fee {money(Number(selectedCategory.annual_fee || 0))} ÷ {months} ={" "}
                  {money(Number(selectedCategory.annual_fee || 0) / Math.max(Number(months) || 1, 1))} per month.
                  You can override the monthly amount above. Cancel any time from this screen.
                </p>
                <p className="text-[11px] font-medium text-primary">
                  First monthly card charge: {formatDate(nextDebitDate(Number(debitDay) || 1))}
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
