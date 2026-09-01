// Unified payment-gateway dispatcher for member-facing checkouts.
// Routes to Yoco or Stitch based on club.payment_gateway.
import { supabase } from "@/integrations/supabase/client";
import {
  buildYocoReturnUrl, openYocoCheckout, rememberPendingYocoSession,
  getPendingYocoSession, clearPendingYocoSession,
} from "@/lib/yoco-native-checkout";
import {
  buildStitchReturnUrl, openStitchCheckout, closeStitchPaymentWindow,
  rememberPendingStitchSession, getPendingStitchSession, clearPendingStitchSession,
} from "@/lib/stitch-checkout";




export type GatewayId = "yoco" | "stitch" | "paynow";
export const SUPPORTED_GATEWAYS: GatewayId[] = ["yoco", "stitch", "paynow"];
export const isSupportedGateway = (g: string | null | undefined): g is GatewayId =>
  !!g && (SUPPORTED_GATEWAYS as string[]).includes(g);

// Paynow pending-session helpers (localStorage, same pattern as Yoco/Stitch)
const PAYNOW_PENDING_KEY = "sh.paynow.pending";
export function rememberPendingPaynowSession(sessionId: string, returnPath: string) {
  try { localStorage.setItem(PAYNOW_PENDING_KEY, JSON.stringify({ sessionId, returnPath })); } catch { /* noop */ }
}
export function getPendingPaynowSession(): { sessionId: string; returnPath: string } | null {
  try {
    const raw = localStorage.getItem(PAYNOW_PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function clearPendingPaynowSession(sid?: string) {
  try {
    if (!sid) { localStorage.removeItem(PAYNOW_PENDING_KEY); return; }
    const cur = getPendingPaynowSession();
    if (cur?.sessionId === sid) localStorage.removeItem(PAYNOW_PENDING_KEY);
  } catch { /* noop */ }
}

export interface StartCheckoutOpts {
  clubId: string;
  clubMemberId: string;
  amount: number;
  purpose: "fee" | "topup" | "tournament";
  fee_ids?: string[];
  champ_registration_id?: string | null;
  description?: string;
  returnPath: string;            // e.g. "/my-account" or `/c/.../tournaments?ctx=tournament`
  method?: "paybybank" | "card"; // Stitch only; defaults to paybybank
}

export async function startClubCheckout(gateway: GatewayId, opts: StartCheckoutOpts) {
  if (gateway === "yoco") {
    const return_url = buildYocoReturnUrl(opts.returnPath);
    const { data, error } = await supabase.functions.invoke("yoco-create-checkout", {
      body: {
        club_id: opts.clubId, club_member_id: opts.clubMemberId,
        amount: opts.amount, purpose: opts.purpose,
        fee_ids: opts.fee_ids || [],
        champ_registration_id: opts.champ_registration_id ?? null,
        description: opts.description, return_url,
      },
    });
    if (error) throw new Error(error.message || "Could not start Yoco checkout");
    if ((data as any)?.error) throw new Error((data as any).error);
    const redirect = (data as any)?.redirect_url;
    if (!redirect) throw new Error("Yoco did not return a redirect URL");
    rememberPendingYocoSession((data as any).session_id, opts.returnPath);
    await openYocoCheckout(redirect);
    return { session_id: (data as any).session_id as string };
  }
  if (gateway === "stitch") {
    // RESTORED to the pre-09-Aug-2026 behaviour: Stitch (both the payment-request
    // and the Express hosted link) redirects the payer back to `return_url`, so
    // we simply hand the current tab over. No prepared window, no polling.
    const return_url = buildStitchReturnUrl(opts.returnPath);
    const { data, error } = await supabase.functions.invoke("stitch-create-payment", {
      body: {
        club_id: opts.clubId, club_member_id: opts.clubMemberId,
        amount: opts.amount, purpose: opts.purpose,
        method: opts.method || "paybybank",
        fee_ids: opts.fee_ids || [],
        champ_registration_id: opts.champ_registration_id ?? null,
        description: opts.description, return_url,
      },
    });
    if (error) throw new Error(error.message || "Could not start Stitch checkout");
    if ((data as any)?.error) throw new Error((data as any).error);
    const redirect = (data as any)?.redirect_url;
    if (!redirect) throw new Error("Stitch did not return a redirect URL");
    rememberPendingStitchSession((data as any).session_id, opts.returnPath);
    await openStitchCheckout(redirect, (data as any).session_id, opts.returnPath);
    return { session_id: (data as any).session_id as string, keptOpen: false };
  }
  if (gateway === "paynow") {
    // Paynow hosts the checkout and redirects the browser back to returnurl
    // with our paynow_session param — simple full-page handover.
    const return_url = buildStitchReturnUrl(opts.returnPath);
    const { data, error } = await supabase.functions.invoke("paynow-create-checkout", {
      body: {
        club_id: opts.clubId, club_member_id: opts.clubMemberId,
        amount: opts.amount, purpose: opts.purpose,
        fee_ids: opts.fee_ids || [],
        champ_registration_id: opts.champ_registration_id ?? null,
        description: opts.description, return_url,
      },
    });
    if (error) throw new Error(error.message || "Could not start Paynow checkout");
    if ((data as any)?.error) throw new Error((data as any).error);
    const redirect = (data as any)?.redirect_url;
    if (!redirect) throw new Error("Paynow did not return a redirect URL");
    rememberPendingPaynowSession((data as any).session_id, opts.returnPath);
    window.location.assign(redirect);
    return { session_id: (data as any).session_id as string };
  }

  throw new Error(`Unsupported gateway: ${gateway}`);
}

export async function verifyClubCheckout(gateway: GatewayId, sessionId: string | null) {
  const fnName = gateway === "stitch" ? "stitch-verify-payment"
    : gateway === "paynow" ? "paynow-verify-checkout"
    : "yoco-verify-checkout";
  return supabase.functions.invoke(fnName, { body: sessionId ? { session_id: sessionId } : {} });
}

/**
 * Poll a once-off Stitch payment until it reaches a final state.
 * Used when the payer completes on Stitch's own page and never comes back.
 * Resolves with the final status ("completed" | "failed" | "expired" |
 * "cancelled" | "" when it timed out while still processing).
 */
export async function pollStitchPayment(
  sessionId: string,
  opts: { intervalMs?: number; timeoutMs?: number; signal?: () => boolean } = {},
): Promise<string> {
  const interval = opts.intervalMs ?? 4000;
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60 * 1000);
  let status = "";
  while (Date.now() < deadline) {
    if (opts.signal?.()) return status;
    try {
      const { data } = await verifyClubCheckout("stitch", sessionId);
      status = (data as any)?.status || "";
      if (["completed", "failed", "expired", "cancelled"].includes(status)) {
        await closeStitchPaymentWindow();
        return status;
      }
    } catch {
      // transient — keep polling
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return status;
}


/**
 * Reads return-URL params for either Yoco or Stitch and returns whichever has
 * a pending session relevant to the given returnPath. Use in useEffect after redirect.
 */
export function readReturnSession(
  searchParams: URLSearchParams,
  expectedReturnPath: string,
): { gateway: GatewayId; sid: string; statusHint?: string; cancelled?: boolean } | null {
  const yocoSid = searchParams.get("yoco_session");
  const yocoCancelled = searchParams.get("yoco_cancelled");
  const yocoStatus = searchParams.get("yoco_status");
  const yocoPending = getPendingYocoSession();
  if (yocoSid || yocoCancelled || (yocoPending && yocoPending.returnPath === expectedReturnPath)) {
    const sid = yocoSid || yocoCancelled || yocoPending!.sessionId;
    return { gateway: "yoco", sid, statusHint: yocoStatus || undefined, cancelled: !!yocoCancelled };
  }
  const stitchSid = searchParams.get("stitch_session");
  const stitchStatus = searchParams.get("stitch_status");
  const stitchPending = getPendingStitchSession();
  if (stitchSid || (stitchPending && stitchPending.returnPath === expectedReturnPath)) {
    const sid = stitchSid || stitchPending!.sessionId;
    return { gateway: "stitch", sid, statusHint: stitchStatus || undefined };
  }
  const paynowSid = searchParams.get("paynow_session");
  const paynowPending = getPendingPaynowSession();
  if (paynowSid || (paynowPending && paynowPending.returnPath === expectedReturnPath)) {
    const sid = paynowSid || paynowPending!.sessionId;
    return { gateway: "paynow", sid };
  }
  return null;
}

export function clearReturnParams(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  [
    "yoco_session", "yoco_cancelled", "yoco_status",
    "stitch_session", "stitch_status",
    "paynow_session",
    // Stitch hosted checkout adds these on return — strip so back/refresh doesn't re-trigger
    "reference", "payment_id", "id",
  ].forEach(k => next.delete(k));
  return next;
}


export function clearPendingClubSession(gateway: GatewayId, sid?: string) {
  if (gateway === "yoco") clearPendingYocoSession(sid);
  else if (gateway === "paynow") clearPendingPaynowSession(sid);
  else clearPendingStitchSession(sid);
}
