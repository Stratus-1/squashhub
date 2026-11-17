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
  reopened: "The card payment didn't go through, so it was cancelled and nothing was charged. Please try again, or choose another way to pay.",
  paid: "That card payment already went through, so the tab is paid.",
  not_card: "This tab is waiting for cash or the card machine at the bar, not an online card payment.",
};

/** A tab whose online card checkout was started but not yet confirmed by the gateway. */
export function tabAwaitingCardPayment(tab: { status?: string | null; settled_method?: string | null } | null | undefined): boolean {
  return !!tab && tab.status === "closing" && tab.settled_method === "online";
}

export const TAB_CARD_IN_PROGRESS_MESSAGE =
  "Your card payment for this tab is still in progress. Finish it on the card page, or tap Cancel card payment to choose another way to pay.";
