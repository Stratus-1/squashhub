import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json(500, { error: "LOVABLE_API_KEY not configured" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { error: "Missing bearer token" });
    }

    const body = await req.json().catch(() => ({}));
    const name = (body?.name || "").toString().trim();
    const category = (body?.category || "bar item").toString();
    const clubId = (body?.clubId || "").toString();
    if (!name || !clubId) return json(400, { error: "Missing name or clubId" });

    const prompt = `A clean, professional product photo of "${name}" (${category}) on a plain white background, centered, soft studio lighting, square crop, e-commerce style. No text, no watermarks, no extra labels.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-image-2",
        prompt,
        size: "1024x1024",
        quality: "low",
        n: 1,
      }),
    });

    const aiText = await aiRes.text();
    if (!aiRes.ok) {
      console.error("AI gateway error", aiRes.status, aiText);
      if (aiRes.status === 429) return json(429, { error: "Rate limited — try again shortly" });
      if (aiRes.status === 402) return json(402, { error: "AI credits exhausted" });
      return json(502, { error: `AI gateway ${aiRes.status}`, detail: aiText.slice(0, 500) });
    }

    let aiJson: any;
    try { aiJson = JSON.parse(aiText); } catch {
      return json(502, { error: "AI returned non-JSON", detail: aiText.slice(0, 300) });
    }
    const image = Array.isArray(aiJson?.data) ? aiJson.data[0] : null;
    const rawB64 = image?.b64_json || image?.base64 || image?.image || aiJson?.images?.[0];
    const b64 = typeof rawB64 === "string" ? rawB64.replace(/^data:image\/\w+;base64,/, "") : "";
    if (!b64) {
      console.error("No b64 in response", aiText.slice(0, 500));
      return json(502, { error: "AI returned no image", detail: "The image model completed but did not include image data." });
    }

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `${clubId}/${crypto.randomUUID()}.png`;

    const admin = createClient(supabaseUrl, serviceKey);
    const { error: upErr } = await admin.storage.from("bar-items").upload(path, bytes, {
      contentType: "image/png",
      upsert: false,
    });
    if (upErr) {
      console.error("Upload error", upErr);
      return json(500, { error: `Upload failed: ${upErr.message}` });
    }

    const { data: pub } = admin.storage.from("bar-items").getPublicUrl(path);
    return json(200, { url: pub.publicUrl });
  } catch (e: any) {
    console.error("Unhandled error", e);
    return json(500, { error: e?.message || String(e) });
  }
});
