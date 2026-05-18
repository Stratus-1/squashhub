// Receives ZKTeco Push-protocol payloads (attendance/door events) from a
// terminal at the club. Auth = ?secret= matching club_secrets.zk_webhook_secret.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret") || req.headers.get("x-webhook-secret");
    const clubId = url.searchParams.get("club_id");
    if (!secret || !clubId) {
      return new Response("missing secret or club_id", { status: 400, headers: corsHeaders });
    }

    const svc = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: s } = await svc.from("club_secrets").select("zk_webhook_secret").eq("club_id", clubId).maybeSingle();
    if (!s || (s as any).zk_webhook_secret !== secret) {
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }

    const body = req.method === "GET" ? Object.fromEntries(url.searchParams) : await req.json().catch(() => ({}));

    // ZK Push posts to /iclock/cdata for attendance and /iclock/getrequest for commands.
    // We treat everything as an event log; commands queue (TODO) returns empty.
    if (url.pathname.endsWith("/getrequest")) {
      // Could return pending enrolment commands here in future
      return new Response("OK", { headers: corsHeaders });
    }

    const personId = (body as any).pin || (body as any).PIN || (body as any).emp_code;
    let memberId: string | null = null;
    if (personId) {
      const { data: m } = await svc.from("club_members")
        .select("id").eq("club_id", clubId)
        .or(`face_provider_person_id.eq.${personId},club_member_number.eq.${personId}`)
        .maybeSingle();
      memberId = (m as any)?.id ?? null;
    }

    await svc.from("access_events").insert({
      club_id: clubId,
      club_member_id: memberId,
      provider_person_id: personId ? String(personId) : null,
      door_name: (body as any).door_name || (body as any).device || null,
      event_type: (body as any).event_type || "access_granted",
      raw: body,
    });

    return new Response("OK", { headers: corsHeaders });
  } catch (err: any) {
    console.error("[access-zk-push]", err);
    return new Response("err", { status: 500, headers: corsHeaders });
  }
});
