// Signed, unguessable token for a public "pay this invoice" link.
// HMAC-SHA256 of the fee payment id, keyed with a server-only secret.
async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`invoice-pay:${msg}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

function secret(): string {
  const s = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!s) throw new Error("server secret missing");
  return s;
}

export function invoicePayToken(feePaymentId: string) {
  return hmacHex(secret(), feePaymentId);
}

export async function verifyInvoicePayToken(feePaymentId: string, token: string) {
  const expected = await invoicePayToken(feePaymentId);
  if (!token || token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function invoicePayUrl(feePaymentId: string) {
  const base = Deno.env.get("SUPABASE_URL")!;
  return `${base}/functions/v1/invoice-pay?i=${feePaymentId}&t=${await invoicePayToken(feePaymentId)}`;
}
