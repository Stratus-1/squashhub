import { toast } from "sonner";

export const COLLECTION_VIBRATION = [200, 100, 200];

/** Presentation only: the existing server notification remains the ready authority. */
export function showCollectionAlert(row: { id: string; message: string }, viewOrder: () => void) {
  try {
    navigator.vibrate?.(COLLECTION_VIBRATION);
  } catch {
    // Vibration is optional and may be blocked by the phone/browser.
  }
  toast("Ready for collection at the bar", {
    id: `bar-ready-${row.id}`,
    description: row.message,
    duration: Infinity,
    closeButton: true,
    action: { label: "View order", onClick: viewOrder },
  });
}

/**
 * Presentation only: order progress reaches the customer through this open
 * page, so after an order is placed they are told to keep the link open.
 */
export function showKeepOpenHint(fulfilment: "collect" | "deliver") {
  toast.info("Keep this page open", {
    id: "bar-keep-open",
    description: fulfilment === "collect"
      ? "We'll alert you here the moment your order is ready to collect."
      : "We'll update you here as each item is delivered.",
    duration: 8000,
    closeButton: true,
  });
}
