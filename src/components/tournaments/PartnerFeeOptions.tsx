import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CreditCard, Loader2, Users, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type PartnerPayScope = "partner" | "both";
export type PartnerPayOptions = {
  ok: boolean; enabled?: boolean; partner_name?: string | null; partner_owes?: boolean; me_owes?: boolean;
  fee_cents?: number; account_allowed?: boolean; needs_verification?: boolean; partner_settled_via?: "account" | "paid" | null;
};

const money = (cents: number) => `R${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Which partner-payment choices to offer (pure; the server re-checks everything at checkout/charge). */
export function partnerPayChoices(o: PartnerPayOptions | null | undefined): PartnerPayScope[] {
  if (!o?.ok || !o.enabled || !o.partner_owes) return [];
  return o.me_owes ? ["partner", "both"] : ["partner"];
}

/**
 * Organiser-made doubles: "Pay my partner's fee" / "Pay both fees" when the tournament's Fees & Payment
 * answer "A player may pay for both partners" is Yes and the partner still owes. Card (Stitch) settles the
 * partner's own entry; member-account allocation puts the debt on the PAYER's club account and marks the
 * partner's entry settled. Server (step_pair_payment_context) decides eligibility and amounts.
 */
export function PartnerFeeOptions({ registrationId, token, verify, ready = true, busy, onPay, cardEnabled = true, verifyField, onCharged }: {
  registrationId?: string | null; token?: string | null; verify?: string | null; ready?: boolean;
  busy?: boolean; onPay: (scope: PartnerPayScope) => void; cardEnabled?: boolean;
  /** Rendered when a no-login payer still has to pass the quick invitation check. */
  verifyField?: ReactNode; onCharged?: () => void;
}) {
  const qc = useQueryClient();
  const key = ["step-pair-pay-options", registrationId ?? null, token ?? null];
  const { data, refetch } = useQuery({
    queryKey: key,
    enabled: !!(registrationId || token),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("step_pair_payment_context", {
        p_registration_id: registrationId ?? null, p_token: token ?? null, p_verify: verify || null, p_scope: "options",
      });
      if (error) return null;
      return data as PartnerPayOptions;
    },
  });
  const charge = useMutation({
    mutationFn: async (scope: PartnerPayScope) => {
      const { data: res, error } = await (supabase as any).rpc("step_charge_pair_to_account", {
        p_registration_id: registrationId ?? null, p_token: token ?? null, p_verify: verify || null, p_scope: scope,
      });
      if (error) throw error;
      if (!res?.ok) throw new Error(res?.error || "Could not add the fee to your account");
      return res as { amount: number; partner_name?: string };
    },
    onSuccess: (res) => {
      toast.success(`R${Number(res.amount).toFixed(2)} was added to your member account.`);
      refetch();
      qc.invalidateQueries({ queryKey: ["my-champ-reg"] });
      qc.invalidateQueries({ queryKey: ["tournament-registrations"] });
      qc.invalidateQueries({ queryKey: ["step-regs"] });
      qc.invalidateQueries({ queryKey: ["member-fees"] });
      qc.invalidateQueries({ queryKey: ["member-account"] });
      onCharged?.();
    },
    onError: (e: any) => { toast.error(e?.message || "Could not add the fee to your account"); refetch(); },
  });

  if (!data?.ok || !data.enabled) return null;
  const fee = data.fee_cents ?? 0;
  const name = data.partner_name || "your partner";
  if (!data.partner_owes) {
    return (
      <p className="text-[11px] text-muted-foreground" data-testid="partner-fee-settled">
        <CheckCircle2 className="mr-1 inline h-3 w-3" />{name}'s entry fee is already {data.partner_settled_via === "account" ? "charged to a member account" : "settled"} — nothing to pay for them.
      </p>
    );
  }
  const choices = partnerPayChoices(data);
  const canAccount = !!data.account_allowed;
  if (!cardEnabled && !canAccount) return null;
  const locked = !ready || !!data.needs_verification && !verify;
  const working = busy || charge.isPending;
  return (
    <div className="space-y-1.5 rounded border border-border p-2" data-testid="partner-fee-options">
      <p className="text-[11px] text-muted-foreground"><Users className="mr-1 inline h-3 w-3" />{name} still owes their {money(fee)} entry fee. You may pay it for them.</p>
      {locked && verifyField}
      <div className="flex flex-wrap gap-2">
        {cardEnabled && choices.includes("partner") && (
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={working || locked} onClick={() => onPay("partner")}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CreditCard className="mr-1 h-3 w-3" />}Pay {name}'s fee by card ({money(fee)})
          </Button>
        )}
        {cardEnabled && choices.includes("both") && (
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={working || locked} onClick={() => onPay("both")}>
            <CreditCard className="mr-1 h-3 w-3" />Pay both fees by card ({money(fee * 2)})
          </Button>
        )}
        {canAccount && choices.includes("partner") && (
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={working || locked} onClick={() => charge.mutate("partner")}>
            {charge.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wallet className="mr-1 h-3 w-3" />}Add {name}'s {money(fee)} to my account
          </Button>
        )}
        {canAccount && choices.includes("both") && (
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={working || locked} onClick={() => charge.mutate("both")}>
            <Wallet className="mr-1 h-3 w-3" />Add both fees ({money(fee * 2)}) to my account
          </Button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Settles {name}'s own entry. By card, nothing is added to anyone's account; "to my account" puts the fee on your club account (not {name}'s).
      </p>
    </div>
  );
}
