// Unified payment-gateway dispatcher for member-facing checkouts.
// Routes to Yoco or Stitch based on club.payment_gateway.
import { supabase } from "@/integrations/supabase/client";
import {
  buildYocoReturnUrl, openYocoCheckout, rememberPendingYocoSession,
  getPendingYocoSession, clearPendingYocoSession,
} from "@/lib/yoco-native-checkout";
import {
  buildStitchReturnUrl, openStitchCheckout, rememberPendingStitchSession,
  getPendingStitchSession, clearPendingStitchSession,
} from "@/lib/stitch-checkout";

export type GatewayId = "yoco" | "stitch";
export const SUPPORTED_GATEWAYS: GatewayId[] = ["yoco", "stitch"];
export const isSupportedGateway = (g: string | null | undefined): g is GatewayId =>
  !!g && (SUPPORTED_GATEWAYS as string[]).includes(g);

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
    await openStitchCheckout(redirect);
    return { session_id: (data as any).session_id as string };
  }
  throw new Error(`Unsupported gateway: ${gateway}`);
}

export async function verifyClubCheckout(gateway: GatewayId, sessionId: string | null) {
  const fnName = gateway === "stitch" ? "stitch-verify-payment" : "yoco-verify-checkout";
  return supabase.functions.invoke(fnName, { body: sessionId ? { session_id: sessionId } : {} });
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
  return null;
}

export function clearReturnParams(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  [
    "yoco_session", "yoco_cancelled", "yoco_status",
    "stitch_session", "stitch_status",
    // Stitch hosted checkout adds these on return — strip so back/refresh doesn't re-trigger
    "reference", "payment_id", "id",
  ].forEach(k => next.delete(k));
  return next;
}


export function clearPendingClubSession(gateway: GatewayId, sid?: string) {
  if (gateway === "yoco") clearPendingYocoSession(sid);
  else clearPendingStitchSession(sid);
}
