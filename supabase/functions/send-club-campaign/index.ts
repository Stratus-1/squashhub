// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ALLOWED_SMTP_PORTS = new Set([25, 465, 587, 2525]);

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function stripHtml(html: string) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h\d|br|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function renderMerge(tpl: string, vars: Record<string, string>) {
  return String(tpl ?? "").replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : ""
  );
}

async function buildRecipients(clubId: string, campaign: any) {
  const audience = campaign.audience_type as string;
  let memberQ = admin.from("club_members")
    .select("id,name,email,phone,club_member_number,id_number")
    .eq("club_id", clubId)
    .not("email", "is", null);

  if (audience === "selected") {
    const ids = (campaign.audience_member_ids ?? []) as string[];
    if (!ids.length) return [];
    memberQ = memberQ.in("id", ids);
  } else if (audience === "league") {
    if (!campaign.audience_league_id) return [];
    const { data: regs } = await admin
      .from("member_league_registrations")
      .select("club_member_id")
      .eq("league_id", campaign.audience_league_id);
    const ids = (regs ?? []).map((r: any) => r.club_member_id).filter(Boolean);
    if (!ids.length) return [];
    memberQ = memberQ.in("id", ids);
  }

  const { data: members } = await memberQ;
  return (members ?? []).filter((m: any) => m.email && m.email.includes("@"));
}

async function getMergeVars(member: any, club: any, leagueId: string | null) {
  const fullName = String(member.name || "").trim();
  const [firstName, ...rest] = fullName.split(/\s+/);
  const surname = rest.join(" ");
  let leagueName = "", leagueNumber = "";
  if (leagueId) {
    const { data: reg } = await admin
      .from("member_league_registrations")
      .select("league_association_number, leagues(name)")
      .eq("club_member_id", member.id).eq("league_id", leagueId).maybeSingle();
    if (reg) {
      leagueNumber = String((reg as any).league_association_number || "");
      leagueName = String(((reg as any).leagues?.name) || "");
    }
  } else {
    const { data: reg } = await admin
      .from("member_league_registrations")
      .select("league_association_number, leagues(name)")
      .eq("club_member_id", member.id).limit(1).maybeSingle();
    if (reg) {
      leagueNumber = String((reg as any).league_association_number || "");
      leagueName = String(((reg as any).leagues?.name) || "");
    }
  }
  return {
    name: fullName,
    first_name: firstName || "",
    surname,
    title: "", // not stored; placeholder for future
    member_number: String(member.club_member_number || ""),
    email: String(member.email || ""),
    phone: String(member.phone || ""),
    id_number: String(member.id_number || ""),
    league_name: leagueName,
    league_number: leagueNumber,
    club_name: String(club?.name || ""),
    club_email: String(club?.email || ""),
    club_phone: String(club?.phone || ""),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: campaign, error: cErr } = await admin
      .from("club_email_campaigns").select("*").eq("id", campaign_id).maybeSingle();
    if (cErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: isAdmin } = await admin.rpc("is_club_admin", { _user_id: user.id, _club_id: campaign.club_id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Not a club admin" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (campaign.status === "sending" || campaign.status === "sent") {
      return new Response(JSON.stringify({ error: `Already ${campaign.status}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load club + smtp
    const [{ data: club }, { data: secrets }] = await Promise.all([
      admin.from("clubs").select("name,email,phone,email_signature_html,email_disclaimer").eq("id", campaign.club_id).maybeSingle(),
      admin.from("club_secrets").select("smtp_host,smtp_port,smtp_user,smtp_pass,sender_name,sender_email").eq("club_id", campaign.club_id).maybeSingle(),
    ]);

    if (!secrets?.smtp_host || !secrets?.smtp_user || !secrets?.smtp_pass || !secrets?.sender_email) {
      return new Response(JSON.stringify({ error: "Club SMTP not configured. Set it in Banking/Settings." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const smtpPort = Number(secrets.smtp_port) || 587;
    if (!ALLOWED_SMTP_PORTS.has(smtpPort)) {
      return new Response(JSON.stringify({ error: `SMTP port ${smtpPort} not allowed` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const recipients = await buildRecipients(campaign.club_id, campaign);
    if (!recipients.length) {
      await admin.from("club_email_campaigns")
        .update({ status: "failed", total_recipients: 0, failed_count: 0, sent_at: new Date().toISOString() })
        .eq("id", campaign_id);
      return new Response(JSON.stringify({ error: "No recipients with email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await admin.from("club_email_campaigns").update({ status: "sending", total_recipients: recipients.length }).eq("id", campaign_id);

    const nodemailer = await import("npm:nodemailer@6.9.14");
    const transporter = nodemailer.default.createTransport({
      host: secrets.smtp_host,
      port: smtpPort,
      secure: smtpPort === 465,
      requireTLS: smtpPort === 587,
      auth: { user: secrets.smtp_user, pass: secrets.smtp_pass },
    });
    const fromHeader = `${secrets.sender_name || club?.name || "Club"} <${secrets.sender_email}>`;
    const sigBlock = club?.email_signature_html
      ? `<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:14px">${club.email_signature_html}</div>`
      : "";
    const disclaimerBlock = club?.email_disclaimer
      ? `<p style="margin:14px 0 0;font-size:11px;color:#94a3b8;line-height:1.4">${escapeHtml(club.email_disclaimer)}</p>`
      : "";

    let sent = 0, failed = 0;
    for (const m of recipients) {
      try {
        const vars = await getMergeVars(m, club, campaign.audience_league_id);
        const subject = renderMerge(campaign.subject, vars);
        const bodyHtml = renderMerge(campaign.body_html, vars);
        const html = `${bodyHtml}${sigBlock}${disclaimerBlock}`;
        const text = stripHtml(html);
        await transporter.sendMail({ from: fromHeader, to: m.email, subject, html, text });
        await admin.from("club_email_campaign_recipients").insert({
          campaign_id, club_member_id: m.id, email: m.email, status: "sent", sent_at: new Date().toISOString(),
        });
        sent++;
      } catch (err) {
        failed++;
        await admin.from("club_email_campaign_recipients").insert({
          campaign_id, club_member_id: m.id, email: m.email, status: "failed",
          error_message: String((err as Error)?.message || err).slice(0, 500),
        });
      }
    }

    await admin.from("club_email_campaigns").update({
      status: failed === recipients.length ? "failed" : "sent",
      sent_count: sent, failed_count: failed, sent_at: new Date().toISOString(),
    }).eq("id", campaign_id);

    return new Response(JSON.stringify({ ok: true, sent, failed, total: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error)?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
