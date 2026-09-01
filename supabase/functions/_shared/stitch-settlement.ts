// Shared Stitch once-off (Express / payment-request) settlement helpers.
//
// Used by:
//  - stitch-verify-payment  (payer returns to the browser)
//  - stitch-sweep-pending-payments (cron safety net for payers who never
//    return, e.g. Capitec Pay approved inside the banking app)

const STITCH_BASE = "https://express.stitch.money/api/v1";
const STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token";
const STITCH_API_BASE = "https://api.stitch.money/v2";

export const STITCH_COMPLETED_STATES = [
  "PAID", "COMPLETED", "COMPLETE", "PAYMENTINITIATIONREQUESTCOMPLETED",
];
export const STITCH_FAILED_STATES = [
  "EXPIRED", "CANCELLED", "CANCELED", "FAILED",
  "PAYMENTINITIATIONREQUESTCANCELLED", "PAYMENTINITIATIONREQUESTEXPIRED",
];

export function isCompletedState(status: string) {
  return STITCH_COMPLETED_STATES.includes(status);
}
export function isFailedState(status: string) {
  return STITCH_FAILED_STATES.includes(status);
}

export async function finalisePayment(admin: any, session: any) {
  const amount = Number(session.amount);
  const description = session.description || `${session.purpose} payment (Stitch)`;
  const methodLabel = session.method === "card" ? "card" : "eft";

  if (session.purpose !== "tournament") {
    const { error } = await admin.from("member_credit_transactions").insert({
      club_id: session.club_id, club_member_id: session.club_member_id,
      amount, type: "debit", method: methodLabel,
      description: `${description} [Stitch]`,
      reference: session.stitch_request_id,
      status: "confirmed", confirmed_at: new Date().toISOString(),
    });
    if (error && (error as any).code !== "23505") console.error("credit_tx insert:", error);
  }

  if (session.purpose === "fee" && Array.isArray(session.fee_ids) && session.fee_ids.length) {
    const { data: fees } = await admin.from("club_member_fee_payments").select("id, amount").in("id", session.fee_ids);
    const total = (fees || []).reduce((s: number, f: any) => s + Number(f.amount), 0);
    const isPartial = amount < total - 0.001;
    if (!isPartial) {
      for (const f of fees || []) {
        await admin.from("club_member_fee_payments")
          .update({ paid: true, paid_at: new Date().toISOString() }).eq("id", f.id);
      }
    } else {
      let remaining = amount;
      for (const f of fees || []) {
        const feeAmt = Number(f.amount);
        const deduction = Math.min(remaining, feeAmt);
        remaining -= deduction;
        const newAmount = feeAmt - deduction;
        if (newAmount <= 0) {
          await admin.from("club_member_fee_payments")
            .update({ paid: true, paid_at: new Date().toISOString(), amount: 0 }).eq("id", f.id);
        } else {
          await admin.from("club_member_fee_payments").update({ amount: newAmount }).eq("id", f.id);
        }
        if (remaining <= 0) break;
      }
    }
  }

  if (session.purpose === "tournament" && session.champ_registration_id) {
    const { data: regRow } = await admin.from("club_champs_registrations")
      .select("fee_payment_id").eq("id", session.champ_registration_id).maybeSingle();
    await admin.from("club_champs_registrations").update({
      status: "paid", fee_paid_cents: Math.round(amount * 100),
      payment_ref: session.stitch_request_id, paid_at: new Date().toISOString(),
    }).eq("id", session.champ_registration_id);
    if (regRow?.fee_payment_id) {
      await admin.from("club_member_fee_payments")
        .update({ paid: true, paid_at: new Date().toISOString() }).eq("id", regRow.fee_payment_id);
    }
    await admin.from("member_credit_transactions")
      .update({ status: "cancelled" })
      .eq("reference", `TOURN-REG-${session.champ_registration_id}`).eq("status", "pending");
  }
}

export async function lookupStitchStatus(
  clientId: string,
  clientSecret: string,
  requestId: string,
  redirectUrl?: string | null,
): Promise<{ status: string; detectedMethod: "card" | "paybybank" | null }> {
  if (String(redirectUrl || "").includes("secure.stitch.money/connect/payment-request")) {
    try {
      const accessToken = await getPaymentRequestToken(clientId, clientSecret);
      const resp = await fetch(`${STITCH_API_BASE}/payment-requests/${encodeURIComponent(requestId)}`, {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) return { status: String(data?.status || "pending").toUpperCase(), detectedMethod: detectMethod(data) };
      console.error("Stitch payment-request status error", resp.status, data);
      return { status: "PENDING", detectedMethod: null };
    } catch (err) {
      console.error("Stitch payment-request lookup failed", (err as Error)?.message || err);
      return { status: "PENDING", detectedMethod: null };
    }
  }

  const tokenResp = await fetch(`${STITCH_BASE}/token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  const tokenJson = await tokenResp.json().catch(() => ({}));
  if (!tokenResp.ok || !tokenJson?.data?.accessToken) {
    console.error("Stitch Express token error", tokenResp.status, tokenJson);
    return { status: "PENDING", detectedMethod: null };
  }
  const accessToken: string = tokenJson.data.accessToken;

  const plResp = await fetch(`${STITCH_BASE}/payments/${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const plJson = await plResp.json().catch(() => ({}));
  if (!plResp.ok) {
    console.error("Stitch Express status error", plResp.status, plJson);
    return { status: "PENDING", detectedMethod: null };
  }
  const payment = plJson?.data?.payment || plJson?.data || {};
  return { status: String(payment.status || "PENDING").toUpperCase(), detectedMethod: detectMethod(payment) };
}

// Inspect a Stitch response payload for how the payer actually paid.
export function detectMethod(payload: unknown): "card" | "paybybank" | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates: string[] = [];
  const push = (v: unknown) => { if (typeof v === "string") candidates.push(v.toLowerCase()); };
  const p = payload as Record<string, any>;
  push(p.paymentMethod); push(p.paymentMethodType); push(p.method); push(p.type);
  if (Array.isArray(p.paymentMethods)) for (const m of p.paymentMethods) { push(m); if (m && typeof m === "object") push(m.type); }
  if (p.card || p.cardPayment) return "card";
  if (p.eft || p.payByBank || p.paybybank || p.bankPayment) return "paybybank";
  for (const c of candidates) {
    if (c.includes("card")) return "card";
    if (c.includes("eft") || c.includes("bank") || c.includes("pbb") || c.includes("paybybank")) return "paybybank";
  }
  try {
    const s = JSON.stringify(payload).toLowerCase();
    if (/\bcard\b|"card"|cardpayment|"pan"|"maskedpan"/.test(s)) return "card";
    if (/paybybank|"eft"|bankpayment|"pbb"/.test(s)) return "paybybank";
  } catch { /* ignore */ }
  return null;
}

export async function getPaymentRequestToken(clientId: string, clientSecret: string) {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", clientId);
  body.set("audience", STITCH_TOKEN_URL);
  body.set("scope", "client_paymentrequest");
  body.set("client_secret", clientSecret);
  const resp = await fetch(STITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  const token = data?.access_token || data?.accessToken || data?.token;
  if (!resp.ok || !token) throw new Error(data?.detail || data?.message || data?.error || `HTTP ${resp.status}`);
  return String(token);
}
