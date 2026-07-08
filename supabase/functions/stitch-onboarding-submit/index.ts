// Sends a Stitch bank-account onboarding application to Stitch (Beon Pienaar)
// with the club contact person in CC. Files were uploaded by the club admin
// to the private `stitch-onboarding` bucket; we generate 7-day signed URLs and
// include them in the email body.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STITCH_EMAIL = "beon.pienaar@stitch.money";
const STITCH_NAME = "Beon Pienaar";
const STITCH_PHONE = "+27 68 921 4245";

type FileRef = { label: string; path: string; filename?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RESEND_API_KEY = (Deno.env.get("RESEND_API_KEY") || "").trim();
    const EMAIL_FROM = (Deno.env.get("EMAIL_FROM") || "SquashHub <onboarding@resend.dev>").trim();

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

    const subject = `Stitch account application — ${club.name}`;
    const filesHtml = signed.map(
      (f) => `<li><strong>${escapeHtml(f.label)}:</strong> <a href="${f.url}">${escapeHtml(f.filename)}</a></li>`,
    ).join("");
    const filesText = signed.map((f) => `• ${f.label}: ${f.url}`).join("\n");

    const boardHtml = boardList.length
      ? `<p><strong>Board Members:</strong></p><ul>${boardList.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
      : "";
    const boardText = boardList.length ? `\nBoard Members:\n${boardList.map((n) => `• ${n}`).join("\n")}\n` : "";

    const html = `
      <div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.55;color:#0f172a">
        <p>Hi ${escapeHtml(STITCH_NAME)},</p>
        <p><strong>${escapeHtml(club.name)}</strong> would like to open a Stitch Express bank account.
        Please find the required onboarding information and documents below.</p>

        <h3 style="margin:18px 0 6px">Club Details</h3>
        <ul>
          <li><strong>Club name:</strong> ${escapeHtml(club.name)}</li>
          <li><strong>SquashHub URL:</strong> <a href="${escapeAttr(club_url)}">${escapeHtml(club_url)}</a></li>
          <li><strong>Main contact:</strong> ${escapeHtml(contact_name || "—")}</li>
          <li><strong>Contact email:</strong> ${escapeHtml(contact_email)}</li>
          <li><strong>Contact cell:</strong> ${escapeHtml(contact_cell)}</li>
        </ul>

        ${boardHtml}

        <h3 style="margin:18px 0 6px">Documents (signed links, valid 7 days)</h3>
        <ul>${filesHtml}</ul>

        <p style="margin-top:20px">Please reply-all to this email to progress the application. The
        club contact person is CC'd.</p>

        <p style="color:#64748b;font-size:12px;margin-top:24px">Submitted via SquashHub on behalf of ${escapeHtml(club.name)}.</p>
      </div>
    `;
    const text = [
      `Hi ${STITCH_NAME},`,
      ``,
      `${club.name} would like to open a Stitch Express bank account. Please find the required onboarding information and documents below.`,
      ``,
      `Club Details`,
      `• Club name: ${club.name}`,
      `• SquashHub URL: ${club_url}`,
      `• Main contact: ${contact_name || "—"}`,
      `• Contact email: ${contact_email}`,
      `• Contact cell: ${contact_cell}`,
      boardText,
      `Documents (signed links, valid 7 days):`,
      filesText,
      ``,
      `Please reply-all to this email to progress the application. The club contact person is CC'd.`,
    ].join("\n");

    if (!RESEND_API_KEY) {
      return json({ error: "Email service not configured (missing RESEND_API_KEY)." }, 500);
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [STITCH_EMAIL],
        cc: [contact_email],
        reply_to: contact_email,
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error("resend fail", res.status, errBody);
      return json({ error: `Email send failed: ${errBody}` }, 502);
    }

    return json({ ok: true, sent_to: STITCH_EMAIL, cc: contact_email, stitch_contact: { name: STITCH_NAME, phone: STITCH_PHONE, email: STITCH_EMAIL } });
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

function escapeHtml(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function escapeAttr(s: string) { return escapeHtml(s); }
