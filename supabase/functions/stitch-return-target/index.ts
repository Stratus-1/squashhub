import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  session_id: z.string().uuid(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Backend not configured" }, 500);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: session } = await admin
      .from("stitch_payment_sessions")
      .select("created_at, club_id")
      .eq("id", parsed.data.session_id)
      .maybeSingle();

    if (!session?.club_id) return json({ redirect_url: null }, 404);

    const createdAt = new Date(String(session.created_at || "")).getTime();
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > 7 * 24 * 60 * 60 * 1000) {
      return json({ redirect_url: null }, 404);
    }

    const { data: club } = await admin
      .from("clubs")
      .select("subdomain")
      .eq("id", session.club_id)
      .maybeSingle();

    const subdomain = String(club?.subdomain || "").trim().toLowerCase();
    if (!/^[a-z0-9-]{2,32}$/.test(subdomain) || ["www", "app", "admin"].includes(subdomain)) {
      return json({ redirect_url: null }, 404);
    }

    return json({ redirect_url: `https://${subdomain}.squashhub.co.za/my-account` });
  } catch (error) {
    console.error("stitch-return-target error", error);
    return json({ error: "Could not resolve payment return" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
