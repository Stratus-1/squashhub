import { supabase } from "@/integrations/supabase/client";

export type CancelTabCardResult = "reopened" | "paid" | "not_card";

/**
 * Cancel an online card payment that was started for a bar tab. The server checks the
 * payment gateway first: a payment that already went through is kept (returns "paid").
 * Otherwise the tab goes back to open so another payment method can be chosen.
 */
export async function cancelTabCardPayment(tabId: string, tabToken: string): Promise<CancelTabCardResult> {
  const { data, error } = await supabase.functions.invoke("bar-card-verify", {
    body: { tab_id: tabId, tab_token: tabToken, cancelled: true },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  const status = (data as any)?.status;
  if (status === "paid") return "paid";
  if (status === "not_card") return "not_card";
  return "reopened";
}

export const cancelTabCardMessage: Record<CancelTabCardResult, string> = {
  reopened: "Card payment cancelled — the tab is open again. Choose another way to pay.",
  paid: "That card payment already went through, so the tab is paid.",
  not_card: "This tab is waiting for cash or the card machine at the bar, not an online card payment.",
};
