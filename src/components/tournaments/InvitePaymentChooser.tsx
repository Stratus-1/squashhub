import { forwardRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote, Building2, CreditCard, Loader2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export type InvitePayMethod = "card" | "eft" | "cash" | "account";

const money = (cents: number) => `R${(cents / 100).toFixed(2)}`;

/** Order + labels for the methods a player may pick (pure, for tests). */
export function invitePayButtons(methods: string[] | null | undefined) {
  const label: Record<InvitePayMethod, string> = {
    card: "Pay online now (card / instant EFT)",
    eft: "Pay by EFT (bank transfer)",
    cash: "Pay cash at the club",
    account: "Add to my member account",
  };
  return (["card", "eft", "account", "cash"] as InvitePayMethod[])
    .filter((m) => (methods || []).includes(m))
    .map((m) => ({ key: m, label: label[m] }));
}

type Props = {
  token: string;
  verify: string | null;
  ready: boolean;
  verifyField?: React.ReactNode;
  cardBusy?: boolean;
  onCard: () => void;
  onSettled?: () => void;
};

/**
 * "How do you want to pay?" on the invitation. Offers the tournament's chosen
 * methods that the host club can accept (server decides), and settles member
 * account / EFT / cash straight from the invitation.
 */
export const InvitePaymentChooser = forwardRef<HTMLDivElement, Props>(function InvitePaymentChooser(
  { token, verify, ready, verifyField, cardBusy, onCard, onSettled },
  ref,
) {
  const [eft, setEft] = useState<any>(null);
  const [note, setNote] = useState<string | null>(null);
  const { data, refetch } = useQuery({
    queryKey: ["invite-pay-options", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("invite_payment_options", { p_token: token });
      if (error) throw error;
      return data as { ok: boolean; methods: string[]; amount_cents: number; status: string; fee_settled_via: string | null };
    },
  });

  const settle = useMutation({
    mutationFn: async (method: "account" | "eft" | "cash") => {
      const { data, error } = await (supabase as any).rpc("invite_settle_entry", {
        p_token: token,
        p_verify: verify,
        p_method: method,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res) => {
      if (res?.method === "eft") setEft(res);
      else if (res?.method === "account") {
        setNote(`${money(res.amount_cents)} was added to your member account — settle it with the club as usual.`);
        toast.success("Entry fee added to your member account.");
      } else if (res?.method === "cash") setNote(`Please pay ${money(res.amount_cents)} in cash at the club. The organiser marks it paid.`);
      refetch();
      onSettled?.();
    },
    onError: (e: any) => toast.error(e?.message || "Could not record your payment choice"),
  });

  if (!data?.ok) return null;
  const amount = Number(data.amount_cents || 0);
  const buttons = invitePayButtons(data.methods);

  if (eft) {
    return (
      <div ref={ref} className="space-y-1 rounded-md border p-3 text-xs">
        <p className="text-sm font-semibold">Pay {money(eft.amount_cents)} by EFT</p>
        {eft.bank_name && <p>Bank: {eft.bank_name}</p>}
        {eft.bank_account_name && <p>Account name: {eft.bank_account_name}</p>}
        {eft.bank_account_number && <p>Account number: {eft.bank_account_number}</p>}
        {eft.bank_branch_code && <p>Branch code: {eft.bank_branch_code}</p>}
        <p>Reference: <b>{eft.reference}</b></p>
        <p className="text-muted-foreground">The organiser marks your entry paid once the money arrives.</p>
      </div>
    );
  }
  if (note) return <div ref={ref} className="rounded-md border p-3 text-xs">{note}</div>;
  if (amount <= 0) return null;
  if (data.status === "pending_eft") {
    return (
      <div ref={ref} className="rounded-md border p-3 text-xs">
        You chose EFT for {money(amount)}. The organiser marks it paid once the money arrives.{" "}
        <button className="underline" onClick={() => settle.mutate("eft")}>Show bank details</button>
      </div>
    );
  }
  if (buttons.length === 0) return null;

  return (
    <div ref={ref} className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-semibold">How do you want to pay {money(amount)}?</p>
      {verifyField}
      {buttons.map((b) => {
        const Icon = b.key === "card" ? CreditCard : b.key === "eft" ? Building2 : b.key === "account" ? Wallet : Banknote;
        const busy = b.key === "card" ? cardBusy : settle.isPending && settle.variables === b.key;
        return (
          <Button
            key={b.key}
            className="w-full"
            variant={b.key === buttons[0].key ? "default" : "outline"}
            disabled={!ready || cardBusy || settle.isPending}
            onClick={() => (b.key === "card" ? onCard() : settle.mutate(b.key as "account" | "eft" | "cash"))}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2 h-4 w-4" />}
            {b.label}
          </Button>
        );
      })}
    </div>
  );
});
