// deno-lint-ignore-file no-explicit-any
// Super Admin only: drafts a "Updates from SquashHub" note with AI, grounded in
// the platform change log (public.platform_change_log). Never sends anything.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["campaign_name", "subject", "body_html", "action_label", "action_url"],
  properties: {
    campaign_name: { type: "string" },
    subject: { type: "string" },
    body_html: { type: "string" },
    action_label: { type: ["string", "null"] },
    action_url: { type: ["string", "null"] },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(token);
    const userId = u?.user?.id;
    if (!userId) return json({ error: "Not authenticated" }, 401);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return json({ error: "Platform super admins only" }, 403);

    const body = await req.json().catch(() => ({}));
    const topic = String(body?.topic ?? "").trim().slice(0, 500);
    const audience = body?.audience === "members" ? "members" : "admins";
    if (!topic) return json({ error: "Tell me what the update is about" }, 400);

    const { data: log } = await admin
      .from("platform_change_log")
      .select("changed_on,area,title,summary,audience_hint")
      .order("changed_on", { ascending: false })
      .limit(80);
    const changes = (log ?? [])
      .map((c: any) => `- ${c.changed_on} [${c.area}] (${c.audience_hint}) ${c.title}: ${c.summary}`)
      .join("\n") || "(no recorded changes)";

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

    const instructions = `You write short, friendly in-app product updates for SquashHub, a squash club app in South Africa.
Use ONLY facts from the change log below; never invent features, dates or numbers. If nothing matches the topic, say so plainly in the body.
Audience: ${audience === "members" ? "all club members (players) — avoid admin-only details unless clearly useful" : "club administrators"}.
Style: plain English, warm, concise (under 160 words), British/South African spelling. Body is simple HTML using only <p>, <strong>, <ul>, <li>. Start with one sentence on what's new, then how to use it.
Subject: under 70 characters. Campaign name: short internal label. action_label/action_url: null unless an in-app path is obvious (e.g. "/settings").

CHANGE LOG (newest first):
${changes}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions,
        input: [{ role: "user", content: `Write the update about: ${topic}` }],
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "platform_update", strict: true, schema: SCHEMA } },
      }),
    });

    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      let msg = "The AI could not write a draft right now.";
      try { msg = JSON.parse(t)?.error?.message || JSON.parse(t)?.message || msg; } catch { /* keep */ }
      if (res.status === 402) msg = "AI credits have run out. Top up in Settings → Plans & credits.";
      if (res.status === 429) msg = "The AI is busy. Please try again in a minute.";
      return json({ error: msg }, res.status);
    }

    // Consume the SSE stream server-side and collect output text.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "", failed: string | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          else if (ev.type === "response.failed" || ev.type === "error") failed = ev?.response?.error?.message || ev?.message || "AI failed";
        } catch { /* ignore partial */ }
      }
    }
    if (failed) return json({ error: failed }, 502);
    let draft: any;
    try { draft = JSON.parse(text); } catch { return json({ error: "The AI returned an unreadable draft. Please try again." }, 502); }
    return json({ draft });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
