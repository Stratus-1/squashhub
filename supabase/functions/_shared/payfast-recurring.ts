// PayFast tokenisation (subscription_type=2 / "ad-hoc") helpers.
//
// The member authorises their card once through a normal PayFast checkout that
// is flagged as a tokenisation payment. PayFast returns a card `token` on the
// ITN, and we then charge that token ourselves each month through the PayFast
// API. This mirrors the Stitch mandate + collections model: we keep control of
// the amount and the schedule rather than handing a fixed subscription to
// PayFast.
import { createHash } from "node:crypto";
import { pfEncode } from "./payfast.ts";

export const PAYFAST_API_BASE = "https://api.payfast.co.za";
export const PAYFAST_API_VERSION = "v1";

function md5(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

/**
 * PayFast API signature: every header and body parameter, sorted
 * alphabetically by key, urlencoded, joined with '&', passphrase appended.
 */
export function pfApiSignature(
  params: Record<string, string | number | undefined | null>,
  passphrase?: string | null,
): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => [k, String(v).trim()] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const parts = entries.map(([k, v]) => `${k}=${pfEncode(v)}`);
  const pass = (passphrase || "").trim();
  if (pass) parts.push(`passphrase=${pfEncode(pass)}`);
  return md5(parts.join("&"));
}

export type AdhocChargeInput = {
  token: string;
  merchantId: string;
  passphrase?: string | null;
  sandbox?: boolean;
  /** Rand amount; converted to cents for PayFast. */
  amount: number;
  itemName: string;
  itemDescription?: string;
  /** Our own reference; PayFast echoes it on the ITN. */
  reference: string;
};

export type AdhocChargeResult = {
  ok: boolean;
  paymentId: string | null;
  status: string;
  message: string;
  raw: unknown;
};

/** Charge a saved card token once. Returns a normalised result. */
export async function pfAdhocCharge(input: AdhocChargeInput): Promise<AdhocChargeResult> {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const body: Record<string, string> = {
    amount: String(Math.round(Number(input.amount) * 100)),
    item_name: input.itemName.slice(0, 100),
    m_payment_id: input.reference,
  };
  if (input.itemDescription) body.item_description = input.itemDescription.slice(0, 255);

  const headerParams = {
    "merchant-id": input.merchantId,
    version: PAYFAST_API_VERSION,
    timestamp,
  };
  const signature = pfApiSignature({ ...headerParams, ...body }, input.passphrase);

  const url = `${PAYFAST_API_BASE}/subscriptions/${encodeURIComponent(input.token)}/adhoc${
    input.sandbox ? "?testing=true" : ""
  }`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...headerParams,
        signature,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: Object.entries(body)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&"),
    });
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

    const status = String(parsed?.status || (resp.ok ? "success" : "failed")).toLowerCase();
    const ok = resp.ok && status === "success";
    return {
      ok,
      paymentId: parsed?.data?.response?.pf_payment_id
        ? String(parsed.data.response.pf_payment_id)
        : parsed?.data?.pf_payment_id
          ? String(parsed.data.pf_payment_id)
          : null,
      status: ok ? "paid" : "failed",
      message: String(parsed?.data?.message || parsed?.data?.response || parsed?.raw || (ok ? "Payment successful" : "Payment declined")),
      raw: parsed,
    };
  } catch (e: any) {
    return { ok: false, paymentId: null, status: "failed", message: e?.message || "Network error", raw: null };
  }
}

/** Cancel a tokenised arrangement at PayFast so the card is released. */
export async function pfCancelToken(opts: {
  token: string;
  merchantId: string;
  passphrase?: string | null;
  sandbox?: boolean;
}): Promise<boolean> {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const headerParams = {
    "merchant-id": opts.merchantId,
    version: PAYFAST_API_VERSION,
    timestamp,
  };
  const signature = pfApiSignature(headerParams, opts.passphrase);
  try {
    const resp = await fetch(
      `${PAYFAST_API_BASE}/subscriptions/${encodeURIComponent(opts.token)}/cancel${opts.sandbox ? "?testing=true" : ""}`,
      { method: "PUT", headers: { ...headerParams, signature } },
    );
    return resp.ok;
  } catch (e) {
    console.error("pfCancelToken error", e);
    return false;
  }
}

/**
 * The next calendar date on which the member's chosen day falls, after `from`.
 * Months shorter than the chosen day clamp to the last day of that month.
 */
export function nextChargeDate(day: number, from: Date = new Date()): string {
  const d = Math.min(Math.max(Math.round(day) || 1, 1), 31);
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const clamp = (y: number, m: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(d, last)));
  };
  const thisMonth = clamp(year, month);
  const todayUtc = new Date(Date.UTC(year, month, from.getUTCDate()));
  const chosen = thisMonth > todayUtc ? thisMonth : clamp(year, month + 1);
  return chosen.toISOString().slice(0, 10);
}
