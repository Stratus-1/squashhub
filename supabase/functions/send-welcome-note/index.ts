// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const INTERNAL_SECRET = Deno.env.get("INTERNAL_TRIGGER_SECRET") || "";

function esc(s: any) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function stripHtml(html: string) {
  return String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h\d|br|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildBody(memberName: string, clubName: string) {
  const first = (memberName || "").split(/\s+/)[0] || "there";
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:620px;margin:0 auto;color:#0f172a;line-height:1.55">
    <h2 style="color:#1E3A5F;margin:0 0 12px">Welcome to ${esc(clubName)}, ${esc(first)}! 👋</h2>
    <p>Here's a quick <strong>Did you know?</strong> to get you playing this week.</p>

    <div style="background:#f8fafc;border-left:4px solid #F5A623;padding:14px 18px;margin:18px 0;border-radius:6px">
      <h3 style="margin:0 0 8px;color:#1E3A5F">Getting started in 60 seconds</h3>
      <ol style="margin:0;padding-left:20px">
        <li><strong>Book a court</strong> from the <em>Bookings</em> page.</li>
        <li>Make sure you have funds in <em>My Account</em> — top up any time, or pay at checkout when prompted.</li>
        <li>Pay by <strong>EFT</strong> or <strong>card</strong>.</li>
        <li><strong>Lights</strong> switch on automatically for your slot — you'll be prompted at the start, and they turn off by themselves when your booking ends.</li>
      </ol>
    </div>

    <div style="background:#fff7ed;border-left:4px solid #F5A623;padding:14px 18px;margin:18px 0;border-radius:6px">
      <h3 style="margin:0 0 8px;color:#1E3A5F">Did you know? 💡</h3>
      <p style="margin:0"><strong>My Account</strong> always reflects your balance owed to the club. Members who prefer to pay <strong>monthly</strong> will soon be able to register for a monthly debit — that functionality is being finalised and will be available in the next few days.</p>
    </div>

    <p style="margin:22px 0 6px">See you on court!</p>
    <p style="margin:0;color:#475569">— ${esc(clubName)}</p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const provided = req.headers.get("x-internal-secret") || "";
    if (!INTERNAL_SECRET || provided !== INTERNAL_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const club_id = String(body.club_id || "");
    const mode = (body.mode === "one" ? "one" : "all") as "one" | "all";
    const member_id = body.member_id ? String(body.member_id) : null;
    if (!club_id) {
      return new Response(JSON.stringify({ error: "club_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [{ data: club }, { data: secrets }] = await Promise.all([
      admin.from("clubs").select("name,email_signature_html,email_disclaimer").eq("id", club_id).maybeSingle(),
      admin.from("club_secrets").select("smtp_host,smtp_port,smtp_user,smtp_pass,sender_name,sender_email").eq("club_id", club_id).maybeSingle(),
    ]);

    let memberQ = admin.from("club_members")
      .select("id,name,email,user_id")
      .eq("club_id", club_id);
    if (mode === "one" && member_id) memberQ = memberQ.eq("id", member_id);
    const { data: members } = await memberQ;
    const list = members ?? [];
    if (!list.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, notified: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // In-app notifications for everyone with a user_id — embed full HTML so the detail view renders it
    const subject = `Welcome to ${club?.name || "the club"} — quick getting-started tips`;
    const notifRows = list
      .filter((m: any) => m.user_id)
      .map((m: any) => {
        const html = buildBody(m.name || "", club?.name || "");
        return {
          user_id: m.user_id,
          club_member_id: m.id,
          title: `Welcome to ${club?.name || "the club"}!`,
          message: "Getting started: Book a court, top up in My Account, pay by EFT/card. Lights come on automatically. Tap to read the tips.",
          type: "general",
          url: "/notifications",
          data: { email: { subject, html, text: stripHtml(html) } },
        };
      });
    let notified = 0;
    if (notifRows.length) {
      const { error: nErr } = await admin.from("notifications").insert(notifRows);
      if (!nErr) notified = notifRows.length;
    }

    // Emails via club SMTP
    let sent = 0, failed = 0, skipped = 0;
    if (secrets?.smtp_host && secrets?.smtp_user && secrets?.smtp_pass && secrets?.sender_email) {
      const nodemailer = await import("npm:nodemailer@6.9.14");
      const port = Number(secrets.smtp_port) || 587;
      const transporter = nodemailer.default.createTransport({
        host: secrets.smtp_host,
        port,
        secure: port === 465,
        requireTLS: port === 587,
        auth: { user: secrets.smtp_user, pass: secrets.smtp_pass },
      });
      const fromHeader = `${secrets.sender_name || club?.name || "Club"} <${secrets.sender_email}>`;
      const sig = club?.email_signature_html
        ? `<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:14px">${club.email_signature_html}</div>` : "";
      const disc = club?.email_disclaimer
        ? `<p style="margin:14px 0 0;font-size:11px;color:#94a3b8;line-height:1.4">${esc(club.email_disclaimer)}</p>` : "";

      for (const m of list as any[]) {
        if (!m.email || !String(m.email).includes("@")) { skipped++; continue; }
        try {
          const html = `${buildBody(m.name || "", club?.name || "")}${sig}${disc}`;
          await transporter.sendMail({
            from: fromHeader,
            to: m.email,
            subject: `Welcome to ${club?.name || "the club"} — quick getting-started tips`,
            html,
            text: stripHtml(html),
          });
          sent++;
        } catch (e) {
          console.error("send failed", m.email, (e as Error).message);
          failed++;
        }
      }
    } else {
      skipped = list.length;
    }

    return new Response(JSON.stringify({ ok: true, mode, total: list.length, notified, sent, failed, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error)?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
