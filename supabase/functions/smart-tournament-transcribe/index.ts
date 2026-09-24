// Tournament Beta — voice input. Transcribes a short spoken description to
// text ONLY. The transcript goes back to the builder's normal text box, where
// the admin reviews it and sends it through the same interpretation flow as
// typed text. Audio is forwarded in memory and never stored.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const MODEL = "google/gemini-3.5-transcribe";
const MAX_FILE_BYTES = 13 * 1024 * 1024; // model cap is 14 MB
const MAX_REQUEST_BYTES = 14 * 1024 * 1024;

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

    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_REQUEST_BYTES) return json({ error: "Recording is too long — please keep it under about 5 minutes." }, 413);

    const form = await req.formData();
    const file = form.get("file");
    const clubId = String(form.get("clubId") ?? "") || null;
    if (!(file instanceof File) || !file.size) return json({ error: "No recording received — please try again." }, 400);
    if (file.size > MAX_FILE_BYTES) return json({ error: "Recording is too long — please keep it under about 5 minutes." }, 413);
    if (!file.type.startsWith("audio/")) return json({ error: "Unexpected recording format." }, 400);

    // Same access rule as the builder itself.
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
    const isSuper = (roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "moderator");
    if (!isSuper) {
      const { data: allowed } = clubId
        ? await admin.rpc("can_use_tournament_beta", { _user_id: userData.user.id, _club_id: clubId })
        : { data: false };
      if (allowed !== true) return json({ error: "Tournament Beta isn't switched on for your club, or you don't have tournament permission." }, 403);
    }

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "Voice input is not configured" }, 500);

    const upstreamForm = new FormData();
    upstreamForm.append("model", MODEL);
    upstreamForm.append("file", file, file.name || "recording.wav");
    upstreamForm.append("response_format", "json");
    upstreamForm.append("stream", "true");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: upstreamForm,
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`transcribe failed [${res.status}]: ${body.slice(0, 500)}`);
      const msg = res.status === 429 ? "Voice input is busy — please try again in a moment."
        : res.status === 402 ? "AI credits are used up for this workspace."
        : res.status === 400 ? "The recording couldn't be understood — please try again, a little closer to the mic."
        : "Transcription failed — please try again or type instead.";
      return json({ error: msg }, res.status);
    }
    return new Response(res.body, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": res.headers.get("content-type") ?? "text/event-stream" },
    });
  } catch (e) {
    console.error("transcribe error", (e as Error).message);
    return json({ error: "Transcription failed — please try again or type instead." }, 500);
  }
});
