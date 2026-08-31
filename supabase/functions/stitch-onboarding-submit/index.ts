// Sends a Stitch bank-account onboarding application to Stitch (Beon Pienaar)
// via Lovable managed email delivery. A copy is
// sent to the club's main contact and to admin@stratsol.co.za for record.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendAppEmail } from '../_shared/send-app-email.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STITCH_EMAIL = "beon.pienaar@stitch.money";
const STITCH_NAME = "Beon Pienaar";
const STITCH_PHONE = "+27 68 921 4245";
const STRATSOL_EMAIL = "admin@stratsol.co.za";

type FileRef = { label: string; path: string; filename?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const {
      club_id,
      contact_name,
      contact_email,
      contact_cell,
      club_url,
      board_members,
      files,
    } = body || {};

    if (!club_id || !contact_email || !contact_cell || !club_url || !Array.isArray(files) || files.length === 0) {
      return json({ error: "Missing required fields" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify caller is admin of this club
    const { data: adminCheck } = await admin.rpc("is_club_admin", { _user_id: userId, _club_id: club_id });
    if (!adminCheck) return json({ error: "Only club admins can submit this application." }, 403);

    const { data: club } = await admin
      .from("clubs").select("id, name, subdomain")
      .eq("id", club_id).maybeSingle();
    if (!club) return json({ error: "Club not found" }, 404);

    // Sign each file for 7 days
    const signed: Array<{ label: string; url: string; filename: string }> = [];
    for (const f of files as FileRef[]) {
      if (!f?.path) continue;
      const { data: sig, error: sErr } = await admin.storage
        .from("stitch-onboarding")
        .createSignedUrl(f.path, 60 * 60 * 24 * 7);
      if (sErr || !sig?.signedUrl) {
        console.error("sign fail", f.path, sErr);
        continue;
      }
      signed.push({
        label: f.label || "Document",
        url: sig.signedUrl,
        filename: f.filename || f.path.split("/").pop() || "file",
      });
    }

    const boardList = Array.isArray(board_members)
      ? (board_members as string[]).filter(Boolean)
      : [];

    // Send to Stitch + CC contact + Stratsol
    const recipients = [
      { email: STITCH_EMAIL, tag: "stitch" },
      { email: contact_email, tag: "contact" },
      { email: STRATSOL_EMAIL, tag: "stratsol" },
    ];
    const copiedTo = [contact_email, STRATSOL_EMAIL];
    const stamp = Date.now();

    const results = await Promise.all(recipients.map((r) =>
      sendAppEmail({
        templateName: "stitch-onboarding-application",
        recipientEmail: r.email,
        clubId: club.id,
        idempotencyKey: `stitch-onboarding-${club.id}-${r.tag}-${stamp}`,
        templateData: {
            clubName: club.name,
            clubUrl: club_url,
            contactName: contact_name || "",
            contactEmail: contact_email,
            contactCell: contact_cell,
            boardMembers: boardList,
            files: signed,
          stitchContactName: STITCH_NAME,
          copiedTo,
        },
      }).then((res) => ({ email: r.email, ok: res.ok, error: res.ok ? undefined : res.error }))
        .catch((e) => ({ email: r.email, ok: false, error: (e as Error).message }))
    ));

    const failed = results.filter((r) => !r.ok);
    if (failed.length === recipients.length) {
      return json({ error: `Failed to send: ${failed.map((f) => f.error).join("; ")}` }, 502);
    }

    // Mark draft as submitted (if a draft exists)
    await admin.from("stitch_onboarding_drafts")
      .update({ submitted_at: new Date().toISOString() })
      .eq("club_id", club_id);

    return json({
      ok: true,
      sent_to: STITCH_EMAIL,
      cc: [contact_email, STRATSOL_EMAIL],
      failed,
      stitch_contact: { name: STITCH_NAME, phone: STITCH_PHONE, email: STITCH_EMAIL },
    });
  } catch (err) {
    console.error("stitch-onboarding-submit error", err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
