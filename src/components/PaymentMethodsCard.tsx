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

  // On return from Stitch, refresh
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("mandate")) {
      qc.invalidateQueries({ queryKey: ["stitch-mandates", clubMemberId] });
      url.searchParams.delete("mandate");
      window.history.replaceState({}, "", url.toString());
    }
  }, [clubMemberId, qc]);

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
      const returnUrl = `${window.location.origin}/account?mandate=pending`;
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
      toast.error(e?.message || "Failed to set up debit order");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelMandate(mandateId: string) {
    if (!confirm("Cancel this debit order? You can set it up again later.")) return;
    try {
      const { error } = await supabase.functions.invoke("stitch-cancel-mandate", {
        body: { mandate_id: mandateId },
      });
      if (error) throw error;
      toast.success("Debit order cancelled");
      qc.invalidateQueries({ queryKey: ["stitch-mandates", clubMemberId] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to cancel");
    }
  }

  const railLabel = (_r: string) => "Recurring card";
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
                    <span className="text-xs font-medium">{railLabel(m.rail)} debit order</span>
                    <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${statusBadge(m.status)}`}>
                      {m.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Up to R{(m.max_amount_cents / 100).toFixed(2)} per month
                    {m.debit_day ? ` · debited on day ${m.debit_day}` : ""}
                  </p>
                  {m.status === "pending" && m.auth_url && (
                    <a href={m.auth_url} className="text-[11px] text-primary underline">
                      Complete authorisation →
                    </a>
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
            No debit order set up yet. Choose a fee category below to pay automatically each month.
          </p>
        )}

        {visibleCategories.length > 0 && (
          <div className="border-t pt-2 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">
              Set up monthly debit
            </p>
            {visibleCategories.map((cat) => {
              const has = activeMandates.some((m) => m.fee_category_id === cat.id);
              return (
                <div key={cat.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{cat.name}</p>
                    <p className="text-[10px] text-muted-foreground">R{Number(cat.annual_fee || 0).toFixed(2)} / month</p>
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
            <DialogTitle>Set up recurring card payment</DialogTitle>
            <DialogDescription>
              {selectedCategory?.name} — you'll be redirected to save a card that will be
              charged automatically each month.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-2 text-[11px] leading-snug">
              <p>
                <strong>Recurring card</strong> — enter your card once; it's securely stored
                by our payment provider and charged on your chosen day each month. Cancel any
                time from this screen. (True DebiCheck / EFT debit orders coming soon.)
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
                <Label className="text-xs">Debit day</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={debitDay}
                  onChange={(e) => setDebitDay(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            {selectedCategory && (
              <p className="text-[11px] text-muted-foreground">
                Annual fee R{Number(selectedCategory.annual_fee || 0).toFixed(2)} ÷ {months} ={" "}
                R{(Number(selectedCategory.annual_fee || 0) / Math.max(Number(months) || 1, 1)).toFixed(2)} per month.
                You can override the monthly amount above. Cancel any time from this screen.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSetupOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submitSetup} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue to card setup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
