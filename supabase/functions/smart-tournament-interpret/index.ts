// Smart Tournament Builder (BETA) — interpretation layer.
//
// Turns an organiser's message + the current Tournament Definition into a
// PROPOSED new definition plus what was understood / what is still ambiguous.
// It never writes data: the client validates the proposal deterministically
// and the organiser must accept it. Super Admin only during the beta.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const MODEL = "openai/gpt-6-astra";

const Body = z.object({
  message: z.string().min(1).max(4000),
  mode: z.enum(["guide", "describe"]),
  definition: z.record(z.any()),
  clubId: z.string().uuid().optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) })).max(30).default([]),
});

const SYSTEM = `You are the SquashHub Smart Tournament Builder, an expert squash tournament designer.
You convert what the organiser says into a JSON "Tournament Definition" and ask ONLY genuinely necessary questions.

Definition shape (TypeScript):
{ version:1, name, ownerKind:"club"|"association"|"federation", category:"championship"|"closed"|"open"|"invitational", rankingEvent:boolean,
  registrationClosesAt?: string|null,
  divisions: [{ id, name, eligibility:"men"|"ladies"|"mixed"|"open"|"open_any_pair", entry:"individual"|"pairs",
    sections: [{ id, name, stages: [Stage] }] }],
  understood: string[], questions: [{ id, term?, question, options?: string[], kind:"structural"|"operational", resolved:boolean, answer?: string|null }],
  notUnderstood: string[] }
Stage = { id, name, kind:"round_robin"|"knockout"|"swiss"|"placement"|"split"|"pair_from_positions"|"custom",
  discipline:"singles"|"doubles", groups:int (pools/draws/levels in parallel), groupSize:int|null (entrants per group; null if dynamic),
  input:{ fromStageId?: string|null, entrants?: int|null, arrangement?: "combined"|"by_level_across_groups"|"same_group" },
  advance:{ role:"qualify"|"seed"|"none", perGroup?: int|null, positions?: int[] },
  pairing?: [[1,2],[3,4],...] (only for pair_from_positions: which finishing positions become one doubles pair; each pair index is a LEVEL),
  seedingBands?: string[] (strength bands feeding ONE draw — not separate competitions),
  splits?: [{name, fromPosition, toPosition}], swissRounds?: int|null, seededMatchups?: string|null (e.g. "1v4,2v3"),
  minMatches?: int|null, dynamic?: boolean (resolves when registration closes), loserBehaviour?: "eliminated"|"plate"|"placement",
  notes?: string,
  schedule:{ mode:"unset"|"fixed"|"play_by"|"self_booking"|"admin", startDate?, endDate?, roundDates?: string[], weekday?: 0-6, venueNames?: string[], rotateVenues?: boolean, courtsPerVenue?, sessionMinutes?, matchMinutes? } }

Rules:
- Keep everything already in the current definition unless the organiser changes it. Keep existing ids stable. New ids: short unique strings.
- Sections are parallel groupings within a division; each section has its own flow of stages. A stage after pools that combines the same level from every pool in the section uses arrangement "by_level_across_groups" with groups = number of levels and groupSize = number of pools.
- Round robin that sends everyone on: advance.role="seed". Knockouts end the flow (advance.role "none").
- NEVER guess ambiguous phrases. Put them in questions (kind "structural") with 2-4 short options, and leave the related part out or marked with notes. Examples that MUST be clarified if not already answered: "1st and 2nd, 3rd and 4th" (doubles pairs? matches? seeding?), "groups" (pools/separate competitions vs strength/seeding bands), "rotate" (venues? partners?), how doubles partners are formed, who may enter an "Open" doubles, what happens to losers.
- Never re-ask something already answered in the conversation or already resolved in questions. Mark answered questions resolved:true with the answer.
- Once the structure is fully determined, stop asking structural questions. Dates, actual clubs, court availability, registration close and entry counts are "operational" questions — at most list them once, never block on them.
- Unknown entry counts in self-entry events: set dynamic:true and groupSize:null.
- If you cannot understand part of a message, add it to notUnderstood instead of guessing.
- "understood" lists short plain-English facts including derived maths (e.g. "6 players per pool → 5 matches each, 15 per pool; 48 players in total").
- For an edit ("change Section 2 to 5 pools"), apply exactly that change and list the downstream consequences in "consequences" (e.g. later stages now receive a different number of pairs) with a suggested resolution; do not silently fix other stages.
- In "guide" mode, ask one or two simple questions at a time and build as you go.
- Reply briefly and plainly for a sports administrator. No jargon about JSON.`;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "understood", "questions", "not_understood", "consequences", "definition_json"],
  properties: {
    reply: { type: "string" },
    understood: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["term", "question", "options", "kind"],
        properties: {
          term: { type: ["string", "null"] },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          kind: { type: "string", enum: ["structural", "operational"] },
        },
      },
    },
    not_understood: { type: "array", items: { type: "string" } },
    consequences: { type: "array", items: { type: "string" } },
    definition_json: { type: "string", description: "The complete updated Tournament Definition as a JSON string." },
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sign in required" }, 401);
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(auth.slice(7));
    if (userErr || !userData?.user) return json({ error: "Sign in required" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
    const isSuper = (roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "moderator");
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }, 400);
    if (!isSuper) {
      // Beta clubs: server-side check (club flagged + caller is club admin / has Tournaments permission).
      const clubId = parsed.data.clubId;
      const { data: allowed } = clubId
        ? await admin.rpc("can_use_tournament_beta", { _user_id: userData.user.id, _club_id: clubId })
        : { data: false };
      if (allowed !== true) return json({ error: "Tournament Beta isn't switched on for your club, or you don't have tournament permission." }, 403);
    }
    const { message, mode, definition, history } = parsed.data;

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "AI is not configured" }, 500);

    const input = [
      ...history.map((m) => ({
        role: m.role,
        content: [{ type: m.role === "assistant" ? "output_text" : "input_text", text: m.content }],
      })),
      {
        role: "user",
        content: [{
          type: "input_text",
          text: `Mode: ${mode}\nCurrent definition JSON:\n${JSON.stringify(definition)}\n\nOrganiser says:\n${message}`,
        }],
      },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: MODEL,
        instructions: SYSTEM,
        input,
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "smart_builder_turn", strict: true, schema: OUTPUT_SCHEMA } },
      }),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text();
      console.error("smart-tournament-interpret gateway", res.status, detail.slice(0, 400));
      const msg = res.status === 402 ? "AI credits are used up. Top up in Settings → Plans & credits."
        : res.status === 429 ? "The AI is busy. Please try again in a moment."
        : "The AI could not answer right now.";
      return json({ error: msg, status: res.status }, res.status === 402 || res.status === 429 || res.status === 403 ? res.status : 502);
    }

    // Read SSE and collect the final text.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const ev = JSON.parse(data);
            if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
            else if (ev.type === "response.completed" && !text) text = ev.response?.output_text ?? "";
            else if (ev.type === "response.failed" || ev.type === "error") {
              return json({ error: "The AI could not answer right now." }, 502);
            }
          } catch { /* ignore partial */ }
        }
      }
    }
    if (!text) return json({ error: "The AI returned an empty answer. Please rephrase." }, 502);
    const out = JSON.parse(text);
    let proposed: unknown = null;
    try { proposed = JSON.parse(out.definition_json); } catch { proposed = null; }
    return json({
      reply: out.reply,
      understood: out.understood,
      questions: out.questions,
      notUnderstood: out.not_understood,
      consequences: out.consequences,
      definition: proposed,
    });
  } catch (e) {
    console.error("smart-tournament-interpret", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
