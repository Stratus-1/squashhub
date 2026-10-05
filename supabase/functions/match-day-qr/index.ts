// Renders a QR PNG for a Match Day link (used as the email QR image).
// Only encodes URLs whose token is a live Match Day Access token.
import { createClient } from "npm:@supabase/supabase-js@2";
import QRCode from "npm:qrcode@1.5.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const u = new URL(req.url).searchParams.get("u") || "";
  const m = u.match(/^https:\/\/([a-z0-9-]+\.)?squashhub\.co\.za\/md\/([A-Za-z0-9_-]{16,64})(\/court\/\d{1,4})?(\?match=[0-9a-f-]{36})?$/i);
  if (!m) return new Response("Bad link", { status: 400, headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await admin.rpc("md_resolve", { _token: m[2] });
  if (!data?.id) return new Response("Inactive", { status: 404, headers: corsHeaders });
  const png: Uint8Array = await QRCode.toBuffer(u, { type: "png", width: 420, margin: 1 });
  return new Response(png, { headers: { ...corsHeaders, "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
});
