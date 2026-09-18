// PayFast (South Africa) helpers: signature generation/verification and
// server-side ITN validation.
import { createHash } from "node:crypto";

export const PAYFAST_LIVE_PROCESS = "https://www.payfast.co.za/eng/process";
export const PAYFAST_SANDBOX_PROCESS = "https://sandbox.payfast.co.za/eng/process";
export const PAYFAST_LIVE_VALIDATE = "https://www.payfast.co.za/eng/query/validate";
export const PAYFAST_SANDBOX_VALIDATE = "https://sandbox.payfast.co.za/eng/query/validate";

/** PayFast urlencoding: RFC1738 — spaces as '+', uppercase hex escapes. */
export function pfEncode(value: string): string {
  return encodeURIComponent(String(value ?? ""))
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase());
}

function md5(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

/**
 * Signature over the given field order (PayFast requires the same order the
 * fields are submitted in). Empty values are excluded.
 */
export function pfSignature(fields: Array<[string, string]>, passphrase?: string | null): string {
  const parts = fields
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => `${k}=${pfEncode(String(v).trim())}`);
  const pass = (passphrase || "").trim();
  if (pass) parts.push(`passphrase=${pfEncode(pass)}`);
  return md5(parts.join("&"));
}

/** Signature of an ITN payload, in the exact order PayFast posted the fields. */
export function pfItnSignature(ordered: Array<[string, string]>, passphrase?: string | null): string {
  return pfSignature(ordered.filter(([k]) => k !== "signature"), passphrase);
}

/** Parse an urlencoded body preserving field order. */
export function parseOrderedForm(raw: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const part of raw.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const k = eq === -1 ? part : part.slice(0, eq);
    const v = eq === -1 ? "" : decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " "));
    out.push([decodeURIComponent(k), v]);
  }
  return out;
}

/** Ask PayFast to confirm the ITN we received is genuine. */
export async function pfValidateItn(raw: string, sandbox: boolean): Promise<boolean> {
  try {
    const resp = await fetch(sandbox ? PAYFAST_SANDBOX_VALIDATE : PAYFAST_LIVE_VALIDATE, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: raw,
    });
    const text = (await resp.text()).trim().toUpperCase();
    return resp.ok && text.startsWith("VALID");
  } catch (e) {
    console.error("PayFast ITN validation error", e);
    return false;
  }
}

export function isSandboxCreds(creds: Record<string, string>): boolean {
  const mode = (creds.mode || creds.environment || "").toLowerCase();
  if (mode === "sandbox" || mode === "test") return true;
  return (creds.merchant_id || "").trim() === "10000100";
}

export function mapPayfastStatus(paymentStatus: string): string {
  const s = (paymentStatus || "").toUpperCase();
  if (s === "COMPLETE") return "completed";
  if (s === "CANCELLED") return "cancelled";
  if (s === "FAILED") return "failed";
  return "processing";
}
