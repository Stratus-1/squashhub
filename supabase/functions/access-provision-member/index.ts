// Pushes a member's face/identity to the club's configured access-control
// system (currently ZKTeco ZKBio CVSecurity / ZKBio Access). For the
// "standalone push" provider we only log — the terminal pulls on heartbeat.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return btoa(bin);
  } catch { return null; }
}

async function zkbioLogin(baseUrl: string, username: string, password: string) {
  const r = await fetch(`${baseUrl.replace(/\/$/, "")}/api-token-auth/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error(`ZKBio login failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.token as string;
}

async function zkbioUpsertPerson(baseUrl: string, token: string, payload: any) {
  const url = `${baseUrl.replace(/\/$/, "")}/personnel/api/employees/`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Token ${token}` },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { club_id, club_member_id } = await req.json();
    if (!club_id || !club_member_id) {
      return new Response(JSON.stringify({ error: "club_id and club_member_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const svc = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: secrets } = await svc.from("club_secrets").select("*").eq("club_id", club_id).maybeSingle();
    const provider = (secrets as any)?.access_provider || "none";

    const { data: member } = await svc
      .from("club_members")
      .select("id, club_id, name, club_member_number, avatar_url, face_provider_person_id")
      .eq("id", club_member_id).maybeSingle();
    if (!member) throw new Error("Member not found");

    const personId = member.face_provider_person_id || member.club_member_number || member.id;

    if (provider === "zkbio") {
      const baseUrl = (secrets as any).zk_base_url;
      const username = (secrets as any).zk_username;
      const password = (secrets as any).zk_password;
      if (!baseUrl || !username || !password) throw new Error("ZKBio not fully configured");

      const photoB64 = member.avatar_url ? await fetchAsBase64(member.avatar_url) : null;
      const token = await zkbioLogin(baseUrl, username, password);

      const [first, ...rest] = (member.name || "Member").split(" ");
      const payload: any = {
        emp_code: String(personId),
        first_name: first,
        last_name: rest.join(" ") || first,
        department: (secrets as any).zk_area_id || 1,
      };
      if (photoB64) payload.face_photo = photoB64;

      const res = await zkbioUpsertPerson(baseUrl, token, payload);
      const status = res.ok ? "success" : "failed";

      await svc.from("access_provisioning_log").insert({
        club_id, club_member_id, provider: "zkbio", action: "upsert_person", status,
        request: { emp_code: payload.emp_code, has_photo: !!photoB64 },
        response: { status: res.status, body: res.body.slice(0, 2000) },
      });

      if (res.ok) {
        await svc.from("club_members").update({
          face_provisioned_at: new Date().toISOString(),
          face_provider_person_id: String(personId),
        }).eq("id", club_member_id);
      }

      return new Response(JSON.stringify({ ok: res.ok, status: res.status }), {
        status: res.ok ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (provider === "zk_push") {
      // Terminal pulls via webhook; we just log the queued enrolment.
      await svc.from("access_provisioning_log").insert({
        club_id, club_member_id, provider: "zk_push", action: "queue_for_push", status: "queued",
        request: { person_id: personId },
      });
      await svc.from("club_members").update({ face_provider_person_id: String(personId) }).eq("id", club_member_id);
      return new Response(JSON.stringify({ ok: true, queued: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, skipped: true, reason: `provider=${provider}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[access-provision-member]", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
