import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "verify";

    if (action === "config") {
      const siteKey = (Deno.env.get("HCAPTCHA_SITE_KEY") ?? "").trim();
      return new Response(
        JSON.stringify({ enabled: siteKey.length > 0, siteKey }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action !== "verify") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { token } = body;

    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing captcha token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const secret = Deno.env.get("HCAPTCHA_SECRET_KEY");
    if (!secret) {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const verifyRes = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `response=${encodeURIComponent(token)}&secret=${encodeURIComponent(secret)}`,
    });

    const result = await verifyRes.json();

    return new Response(
      JSON.stringify({ success: result.success === true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Verification failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
