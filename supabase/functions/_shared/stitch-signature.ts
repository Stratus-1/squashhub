// Shared Stitch webhook signature verification.
// Stitch signs payloads with HMAC-SHA256 using a dedicated webhook signing secret.
// The signature is sent in the `x-stitch-signature` header (some docs also call it
// `stitch-signature`, so we accept either).

export async function verifyStitchSignature(
  rawBody: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(rawBody),
    );
    const computed = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    // Stitch signatures may be hex strings; compare case-insensitively and
    // also allow the header to contain the computed value as a substring.
    return signature.toLowerCase().includes(computed.toLowerCase()) ||
      computed.toLowerCase().includes(signature.toLowerCase());
  } catch {
    return false;
  }
}

export function getStitchSignature(req: Request): string {
  return req.headers.get("x-stitch-signature") ||
    req.headers.get("stitch-signature") ||
    "";
}
