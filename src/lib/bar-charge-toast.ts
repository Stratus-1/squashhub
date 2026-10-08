import { toast } from "sonner";
import { barChargeErrorMessage, parseAccountLimit } from "@/lib/account-charge-gate";

/** Account-limit refusals stay on screen until acknowledged; other errors behave as before. */
export function showBarChargeError(err: unknown, fallback: string) {
  const msg = barChargeErrorMessage(err, fallback);
  if (parseAccountLimit(err)) {
    toast.error(msg, { duration: Infinity, closeButton: true, action: { label: "OK", onClick: () => {} } });
  } else {
    toast.error(msg, { duration: 10000 });
  }
}
