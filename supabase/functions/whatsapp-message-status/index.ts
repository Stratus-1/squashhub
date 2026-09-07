// Diagnostic: read Twilio delivery status for a message SID sent through the
// shared platform sender. Platform-internal use only.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!secret || secret !== (Deno.env.get("INTERNAL_TRIGGER_SECRET") ?? "")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { sid } = await req.json().catch(() => ({ sid: null }));
  if (!sid) {
    return new Response(JSON.stringify({ error: "sid required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resp = await fetch(`${GATEWAY_URL}/Messages/${sid}.json`, {
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "X-Connection-Api-Key": Deno.env.get("TWILIO_API_KEY")!,
    },
  });
  const text = await resp.text();
  return new Response(JSON.stringify({ status: resp.status, body: text }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
