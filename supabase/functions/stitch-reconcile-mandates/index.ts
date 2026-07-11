// Cron sweep: polls Stitch Express for every pending mandate and flips the
// local status to active/failed/cancelled. Runs unauthenticated but requires
// x-internal-secret so only cron can trigger it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const STITCH_BASE = "https://express.stitch.money/api/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function stitchToken(clientId: string, clientSecret: string) {
  const resp = await fetch(`${STITCH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret, scope: "client_recurringpaymentconsentrequest" }),
  });
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok || !j?.data?.accessToken) throw new Error(`Stitch auth failed [${resp.status}]`);
  return j.data.accessToken as string;
}

function mapStatus(raw: string): string | null {
  const s = raw.toLowerCase();
  if (/complete|authori[sz]ed|active|success|enabled/.test(s)) return "active";
  if (/declin|fail|reject|expired/.test(s)) return "failed";
  if (/cancel/.test(s)) return "cancelled";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("MAINTENANCE_INTERNAL_SECRET") || Deno.env.get("PUSH_INTERNAL_SECRET") || "";
  const got = req.headers.get("x-internal-secret") || "";
  if (!expected || got !== expected) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Only sweep mandates that were created recently OR are still pending — the
  // Stitch record eventually expires, so ignore anything older than 30 days.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pending, error } = await admin
    .from("stitch_mandates")
    .select("id, club_id, stitch_mandate_id, mandate_type, status, created_at")
    .eq("status", "pending")
    .gte("created_at", cutoff)
    .not("stitch_mandate_id", "is", null);
  if (error) return json({ error: error.message }, 500);

  const rows = pending || [];
  if (rows.length === 0) return json({ ok: true, scanned: 0 });

  // Cache tokens per club_id so we don't re-auth for each mandate
  const tokenCache = new Map<string, string | null>();
  let updated = 0, unchanged = 0, failed = 0;

  for (const m of rows) {
    try {
      let token = tokenCache.get(m.club_id);
      if (token === undefined) {
        const { data: secrets } = await admin
          .from("club_secrets")
          .select("payment_gateway_credentials")
          .eq("club_id", m.club_id).maybeSingle();
        const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
        const clientId = (creds.client_id || "").trim();
        const clientSecret = (creds.client_secret || "").trim();
        if (!clientId || !clientSecret) {
          tokenCache.set(m.club_id, null);
          continue;
        }
        try {
          token = await stitchToken(clientId, clientSecret);
          tokenCache.set(m.club_id, token);
        } catch (e) {
          console.error("token failed for club", m.club_id, e);
          tokenCache.set(m.club_id, null);
          continue;
        }
      }
      if (!token) continue;

      const path = m.mandate_type === "subscription" ? "subscriptions" : "card-consents";
      const resp = await fetch(`${STITCH_BASE}/${path}/${m.stitch_mandate_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) { failed++; continue; }
      const node = j?.data || j;
      const raw = String(node?.status || node?.state?.__typename || node?.state || "");
      const newStatus = mapStatus(raw);
      if (!newStatus || newStatus === m.status) { unchanged++; continue; }

      const patch: Record<string, unknown> = { status: newStatus };
      if (newStatus === "active") patch.authorised_at = new Date().toISOString();
      if (newStatus === "cancelled") patch.cancelled_at = new Date().toISOString();
      await admin.from("stitch_mandates").update(patch).eq("id", m.id);
      updated++;
    } catch (e) {
      console.error("reconcile row failed", m.id, e);
      failed++;
    }
  }

  return json({ ok: true, scanned: rows.length, updated, unchanged, failed });
});
