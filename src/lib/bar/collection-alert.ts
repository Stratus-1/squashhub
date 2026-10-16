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