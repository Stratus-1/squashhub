import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type PartnerPayScope = "partner" | "both";
export type PartnerPayOptions = { ok: boolean; enabled?: boolean; partner_name?: string | null; partner_owes?: boolean; me_owes?: boolean; fee_cents?: number };

const money = (cents: number) => `R${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Which partner-payment buttons to offer (pure; server re-checks everything at checkout). */
export function partnerPayChoices(o: PartnerPayOptions | null | undefined): PartnerPayScope[] {
  if (!o?.ok || !o.enabled || !o.partner_owes) return [];
  return o.me_owes ? ["partner", "both"] : ["partner"];
}

/**
 * Step-by-Step organiser-made doubles: "Pay my partner's fee" / "Pay both fees", offered only when the
 * tournament's Fees & Payment answer allows one partner to pay for both and the partner still owes.
 * Card/Stitch only — the partner's fee is settled on the partner's own entry, never posted to the payer's account.
 */
export function PartnerFeeOptions({ registrationId, token, verify, ready = true, busy, onPay }: {
  registrationId?: string | null; token?: string | null; verify?: string | null; ready?: boolean;
  busy?: boolean; onPay: (scope: PartnerPayScope) => void;
}) {
  const { data } = useQuery({
    queryKey: ["step-pair-pay-options", registrationId ?? null, token ?? null, ready ? verify ?? null : null],
    enabled: ready && !!(registrationId || token),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("step_pair_payment_context", {
        p_registration_id: registrationId ?? null, p_token: token ?? null, p_verify: verify || null, p_scope: "options",
      });
      if (error) return null;
      return data as PartnerPayOptions;
    },
  });
  const choices = partnerPayChoices(data);
  if (!choices.length || !data) return null;
  const fee = data.fee_cents ?? 0;
  const name = data.partner_name || "your partner";
  return (
    <div className="space-y-1.5 rounded border border-border p-2" data-testid="partner-fee-options">
      <p className="text-[11px] text-muted-foreground"><Users className="mr-1 inline h-3 w-3" />{name} still owes their {money(fee)} entry fee. You may pay it for them by card.</p>
      <div className="flex flex-wrap gap-2">
        {choices.includes("partner") && (
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => onPay("partner")}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CreditCard className="mr-1 h-3 w-3" />}Pay {name}'s fee ({money(fee)})
          </Button>
        )}
        {choices.includes("both") && (
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => onPay("both")}>
            <CreditCard className="mr-1 h-3 w-3" />Pay both fees ({money(fee * 2)})
          </Button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">Settles {name}'s own entry — it is not added to your member account.</p>
    </div>
  );
}
