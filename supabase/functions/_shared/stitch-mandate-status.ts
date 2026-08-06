// Shared helpers for reading the real status of a Stitch Express recurring
// authorisation.
//
// Important: Stitch Express has NO `GET /subscriptions/{id}` endpoint — it
// 404s for every id. The only way to read a subscription's status is the LIST
// endpoint `GET /subscriptions`, which returns every subscription created by
// that client with its current status. Card consents do support
// `GET /card-consents/{id}` (the list endpoint is 405).
export const STITCH_BASE = "https://express.stitch.money/api/v1";

export async function stitchExpressToken(clientId: string, clientSecret: string) {
  const resp = await fetch(`${STITCH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      clientSecret,
      scope: "client_recurringpaymentconsentrequest",
    }),
  });
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok || !j?.data?.accessToken) throw new Error(`Stitch auth failed [${resp.status}]`);
  return j.data.accessToken as string;
}

/** id -> raw status, e.g. AUTHORISED / UNAUTHORISED / CANCELLED / FAILED_AND_WILL_RETRY */
export async function listStitchSubscriptions(token: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const resp = await fetch(`${STITCH_BASE}/subscriptions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return map;
  const j = await resp.json().catch(() => ({}));
  const subs = j?.data?.subscriptions || j?.subscriptions || [];
  for (const s of subs) {
    if (s?.id) map.set(String(s.id), String(s.status || ""));
  }
  return map;
}

export async function getStitchCardConsentStatus(token: string, id: string): Promise<string | null> {
  const resp = await fetch(`${STITCH_BASE}/card-consents/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const j = await resp.json().catch(() => ({}));
  const node = j?.data || j;
  const raw = node?.status || node?.state?.__typename || node?.state;
  return raw ? String(raw) : null;
}

/**
 * Maps a Stitch raw status to our local mandate status.
 * Returns null when the status carries no local meaning (leave row as is).
 *
 * NOTE the ordering: "UNAUTHORISED" contains "AUTHORISED", so it must be
 * tested first — an earlier version flipped un-authorised setups to active.
 */
export function mapStitchMandateStatus(raw: string): string | null {
  const s = (raw || "").toLowerCase();
  if (!s) return null;
  if (/unauthori[sz]ed|pending|awaiting|created|initiat/.test(s)) return "pending";
  if (/cancel|revoked/.test(s)) return "cancelled";
  // A failed collection that Stitch will retry does not invalidate the mandate.
  if (/will_retry|will retry/.test(s)) return "active";
  if (/authori[sz]ed|complete|active|success|enabled/.test(s)) return "active";
  if (/declin|fail|reject|expired/.test(s)) return "failed";
  return null;
}
