// Cancels a Stitch mandate (member-initiated or admin-initiated).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { mandate_id } = await req.json();
    if (!mandate_id) return json({ error: "Missing mandate_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: mandate } = await admin
      .from("stitch_mandates")
      .select("id, user_id, club_id, status")
      .eq("id", mandate_id)
      .maybeSingle();
    if (!mandate) return json({ error: "Mandate not found" }, 404);

    // Allow owner or club admin
    let allowed = mandate.user_id === userId;
    if (!allowed) {
      const { data: cm } = await admin
        .from("club_members")
        .select("role")
        .eq("club_id", mandate.club_id)
        .eq("user_id", userId)
        .maybeSingle();
      allowed = cm?.role === "admin";
    }
    if (!allowed) return json({ error: "Not allowed" }, 403);

    await admin
      .from("stitch_mandates")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", mandate_id);

    // Note: Stitch's mandate revocation API call could go here. For DebiCheck
    // the bank typically requires a revoke mutation; for EFT it's local-only.

    return json({ ok: true });
  } catch (e) {
    console.error("stitch-cancel-mandate fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
