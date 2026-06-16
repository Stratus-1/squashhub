import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth check
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { name, category, clubId } = await req.json();
    if (!name || !clubId) throw new Error("Missing name or clubId");

    const prompt = `A clean, professional product photo of "${name}" (${category || "bar item"}) on a plain white background, centered, soft studio lighting, square crop, e-commerce style. No text, no watermarks, no labels added.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        prompt,
        size: "1024x1024",
        n: 1,
      }),
    });
    if (!aiRes.ok) {
      const text = await aiRes.text();
      return new Response(JSON.stringify({ error: `AI failed: ${aiRes.status} ${text}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const aiJson = await aiRes.json();
    const b64 = aiJson?.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned");

    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const path = `${clubId}/${crypto.randomUUID()}.png`;

    const admin = createClient(supabaseUrl, serviceKey);
    const { error: upErr } = await admin.storage.from("bar-items").upload(path, bytes, {
      contentType: "image/png", upsert: false,
    });
    if (upErr) throw upErr;

    const { data: pub } = admin.storage.from("bar-items").getPublicUrl(path);
    return new Response(JSON.stringify({ url: pub.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
