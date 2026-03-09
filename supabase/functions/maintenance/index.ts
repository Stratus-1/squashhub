import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Internal secret check (use a separate secret from push if you want).
  const expected = Deno.env.get("MAINTENANCE_INTERNAL_SECRET") || Deno.env.get("PUSH_INTERNAL_SECRET") || "";
  const got = req.headers.get("x-internal-secret") || "";
  if (!expected || got !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (action === "expire") {
    const { data, error } = await supabaseAdmin.rpc("expire_old_challenges_and_schedules");
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, result: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (action === "process-email-campaigns") {
    const limitRaw = url.searchParams.get("limit") || "5";
    const limit = Math.max(0, Math.min(Number(limitRaw) || 5, 50));

    const { data: secretRow, error: secretErr } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "email_campaigns_private_internal_secret")
      .maybeSingle();
    if (secretErr) {
      return new Response(JSON.stringify({ error: secretErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabaseAdmin.rpc("process_due_marketing_email_campaigns", {
      p_limit: limit,
      p_internal_secret: secretRow?.value ?? null,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, result: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
