// Detects sandbox (test) gateway credentials. Payments made with test
// credentials move no real money, so they must never be recorded as member
// credits, fee settlements, tournament payments, bar sales, gateway fees or
// GoBook top-ups.

export function isStitchTestCreds(creds: Record<string, unknown> | null | undefined): boolean {
  const c = creds || {};
  return String(c.test_mode ?? "") === "true" || /^test[-_]/i.test(String(c.client_id ?? "").trim());
}

export function isYocoTestKey(secretKey: string | null | undefined): boolean {
  return String(secretKey || "").trim().startsWith("sk_test_");
}
