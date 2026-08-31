import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { sendAppEmail } from '../_shared/send-app-email.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-internal-secret",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

let internalSecretCache: string | null = null;

async function getInternalSecret() {
  if (internalSecretCache) return internalSecretCache;

  const envSecret = Deno.env.get("EMAIL_INTERNAL_SECRET");
  if (envSecret) {
    internalSecretCache = envSecret;
    return envSecret;
  }

  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "email_private_internal_secret")
    .single();

  internalSecretCache = data?.value ?? null;
  return internalSecretCache;
}

function absoluteUrl(siteUrl: string, pathOrUrl: string) {
  try {
    return new URL(pathOrUrl).toString();
  } catch {
    const base = siteUrl.replace(/\/+$/, "");
    const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    return `${base}${path}`;
  }
}

async function sendViaResend(args: { to: string; subject: string; html: string; text: string }) {
  const apiKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
  if (!apiKey) return { ok: false, skipped: true, reason: "Missing RESEND_API_KEY" };

  const from = (Deno.env.get("EMAIL_FROM") || "SquashHub <onboarding@resend.dev>").trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, skipped: false, reason: body || `Resend error ${res.status}` };
  }

  return { ok: true };
}

/**
 * Platform fallback: send through the Lovable Emails queue (verified sender
 * domain). Used when a club has no SMTP configured, or its SMTP send fails.
 * RESEND_API_KEY is not configured on this project, so Resend alone silently
 * dropped these emails.
 */
async function sendViaPlatform(args: {
  to: string;
  subject: string;
  text: string;
  url?: string;
  ctaLabel?: string;
  recipientName?: string;
  clubName?: string;
  clubLogoUrl?: string;
  idempotencyKey?: string;
}) {
  try {
    const res = await sendAppEmail({
      templateName: "club-notification",
      recipientEmail: args.to,
      idempotencyKey: args.idempotencyKey || crypto.randomUUID(),
      templateData: {
        title: args.subject,
        messageBody: args.text,
        url: args.url || "",
        ctaLabel: args.ctaLabel || "Open in SquashHub",
        recipientName: args.recipientName || "",
        clubName: args.clubName || "",
        clubLogoUrl: args.clubLogoUrl || "",
      },
    });
    if (!res.ok) {
      return { ok: false, skipped: false, reason: res.error || "Platform email error" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, skipped: false, reason: (e as Error).message };
  }
}

interface ClubMail {
  clubId: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  senderName: string;
  senderEmail: string;
  signatureHtml: string;
  disclaimer: string;
  clubName: string;
  clubLogoUrl: string;
}

async function resolveClubMail(userId: string, explicitClubId?: string | null): Promise<ClubMail | null> {
  try {
    let clubId: string | null = explicitClubId && explicitClubId.trim() ? explicitClubId.trim() : null;
    if (!clubId) {
      const { data: member } = await supabaseAdmin
        .from("club_members")
        .select("club_id")
        .eq("user_id", userId)
        .not("club_id", "is", null)
        .limit(1)
        .maybeSingle();
      clubId = member?.club_id ?? null;
    }
    if (!clubId) return null;

    const [{ data: secrets }, { data: club }] = await Promise.all([
      supabaseAdmin
        .from("club_secrets")
        .select("smtp_host,smtp_port,smtp_user,smtp_pass,sender_name,sender_email")
        .eq("club_id", clubId)
        .maybeSingle(),
      supabaseAdmin
        .from("clubs")
        .select("name,logo_url,email_signature_html,email_disclaimer")
        .eq("id", clubId)
        .maybeSingle(),
    ]);

    if (!secrets?.smtp_host || !secrets?.smtp_user || !secrets?.smtp_pass || !secrets?.sender_email) {
      return null;
    }
    return {
      clubId,
      smtpHost: String(secrets.smtp_host).trim(),
      smtpPort: Number(secrets.smtp_port) || 587,
      smtpUser: String(secrets.smtp_user).trim(),
      smtpPass: String(secrets.smtp_pass),
      senderName: String(secrets.sender_name || club?.name || "Club").trim(),
      senderEmail: String(secrets.sender_email).trim(),
      signatureHtml: String(club?.email_signature_html || "").trim(),
      disclaimer: String(club?.email_disclaimer || "").trim(),
      clubName: String(club?.name || "").trim(),
      clubLogoUrl: String(club?.logo_url || "").trim(),
    };
  } catch (err) {
    console.warn("[resolveClubMail] failed", err);
    return null;
  }
}

async function sendViaClubSmtp(cfg: ClubMail, args: { to: string; cc?: string[]; subject: string; html: string; text: string }) {
  const ALLOWED_SMTP_PORTS = new Set([25, 465, 587, 2525]);
  if (!ALLOWED_SMTP_PORTS.has(cfg.smtpPort)) {
    return { ok: false as const, skipped: false, reason: `SMTP port ${cfg.smtpPort} not allowed` };
  }

  const signatureBlock = cfg.signatureHtml
    ? `<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:14px">${cfg.signatureHtml}</div>`
    : "";
  const disclaimerBlock = cfg.disclaimer
    ? `<p style="margin:14px 0 0;font-size:11px;color:#94a3b8;line-height:1.4">${escapeHtml(cfg.disclaimer)}</p>`
    : "";
  const fullHtml = `${args.html}${signatureBlock}${disclaimerBlock}`;
  const fullText = `${args.text}${cfg.disclaimer ? `\n\n${cfg.disclaimer}` : ""}`;

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpPort === 465,
      requireTLS: cfg.smtpPort === 587,
      auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    });
    const ccList = (args.cc || [])
      .map((c) => String(c || "").trim())
      .filter((c) => c.length > 3 && c.toLowerCase() !== args.to.toLowerCase());
    const info: any = await transporter.sendMail({
      from: `${cfg.senderName} <${cfg.senderEmail}>`,
      to: args.to,
      ...(ccList.length ? { cc: ccList } : {}),
      subject: args.subject,
      text: fullText,
      html: fullHtml,
    });
    // Gmail (and most relays) can accept the session but reject the individual
    // recipient. Never report success unless the recipient was accepted.
    const accepted: string[] = Array.isArray(info?.accepted) ? info.accepted.map(String) : [];
    const rejected: string[] = Array.isArray(info?.rejected) ? info.rejected.map(String) : [];
    const serverResponse = String(info?.response || "").trim();
    // A rejected CC address must not fail the whole send — only the primary
    // recipient decides success.
    const primaryRejected = rejected.some((r) => r.toLowerCase().includes(args.to.toLowerCase()));
    if (primaryRejected || (accepted.length === 0 && Array.isArray(info?.accepted))) {
      const reason = `Recipient rejected by ${cfg.smtpHost}: ${rejected.join(", ") || args.to}. ${serverResponse}`.trim();
      await logEmailAttempt({ to: args.to, template: "club-smtp", status: "failed", error: reason, clubId: cfg.clubId });
      return { ok: false as const, skipped: false, reason };
    }
    await logEmailAttempt({
      to: args.to,
      template: "club-smtp",
      status: "sent",
      error: null,
      messageId: String(info?.messageId || "") || undefined,
      detail: serverResponse ? `${cfg.senderEmail} via ${cfg.smtpHost}: ${serverResponse}` : undefined,
      clubId: cfg.clubId,
    });
    return { ok: true as const };
  } catch (err) {
    const reason = (err as Error).message || String(err);
    await logEmailAttempt({ to: args.to, template: "club-smtp", status: "failed", error: `${cfg.senderEmail} via ${cfg.smtpHost}: ${reason}`, clubId: cfg.clubId });
    return { ok: false as const, skipped: false, reason };
  }
}

/**
 * Append-only audit of club-SMTP delivery attempts. The platform sender already
 * writes to email_send_log; club SMTP sends were previously invisible, so an
 * admin could not tell whether a member's invitation actually left the building.
 */
async function logEmailAttempt(args: {
  to: string;
  template: string;
  status: "sent" | "failed";
  error?: string | null;
  messageId?: string;
  detail?: string;
  clubId?: string | null;
}) {
  try {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: args.messageId || crypto.randomUUID(),
      template_name: args.template,
      recipient_email: args.to,
      status: args.status,
      error_message: args.error || args.detail || null,
      club_id: args.clubId || null,
    });
  } catch (e) {
    console.warn("[email-notifications] failed to log send attempt", e);
  }
}


/**
 * Plain-English explanation of an SMTP failure so admins are never left
 * guessing why a club email did not go out.
 */
function describeSmtpError(reason: string, cfg: ClubMail): string {
  const r = String(reason || "").trim();
  const low = r.toLowerCase();
  const where = `${cfg.senderEmail} via ${cfg.smtpHost}:${cfg.smtpPort}`;
  let hint = "";
  if (low.includes("535") || low.includes("username and password not accepted") || low.includes("authentication failed") || low.includes("invalid login")) {
    hint = "The mailbox username or password was rejected. For Gmail/Google Workspace you must use a 16-character App Password (not the normal account password) with 2-step verification enabled.";
  } else if (low.includes("534") || low.includes("application-specific password")) {
    hint = "Google requires an App Password for this mailbox.";
  } else if (low.includes("timeout") || low.includes("etimedout") || low.includes("econnrefused") || low.includes("enotfound")) {
    hint = "The mail server could not be reached — check the SMTP host and port in the club email settings.";
  } else if (low.includes("certificate") || low.includes("tls") || low.includes("ssl")) {
    hint = "The secure connection failed — try port 587 (STARTTLS) or 465 (SSL).";
  } else if (low.includes("550") || low.includes("relay") || low.includes("not allowed to send")) {
    hint = "The server refused to send from this address — the sender address must match the mailbox you authenticate with.";
  }
  return `Club email (SMTP) send failed for ${where}. ${hint} Server said: ${r || "no detail returned"}`.trim();
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|br|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Render a plain-text notification body as email-safe HTML.
 * Lines starting with a bullet marker (•, -, *) become real <ul><li> items so
 * clients that ignore white-space rules (Outlook) still show a readable list.
 * Separator lines like "— Tournament details —" become small captions.
 */
function renderBodyHtml(body: string): string {
  const lines = String(body || "").replace(/\r\n|\r/g, "\n").split("\n");
  const out: string[] = [];
  let bullets: string[] = [];
  let paragraph: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    out.push(
      `<ul style="margin:0 0 14px 0; padding-left:20px; color:#334155">${bullets
        .map((b) => `<li style="margin:0 0 6px 0; line-height:1.5">${escapeHtml(b)}</li>`)
        .join("")}</ul>`,
    );
    bullets = [];
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(
      `<p style="margin:0 0 14px 0; color:#334155; line-height:1.5">${paragraph
        .map((l) => escapeHtml(l))
        .join("<br />")}</p>`,
    );
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      flushParagraph();
      continue;
    }
    const bulletMatch = line.match(/^[•\-\*]\s+(.*)$/);
    const captionMatch = line.match(/^—\s*(.+?)\s*—$/);
    if (bulletMatch) {
      flushParagraph();
      bullets.push(bulletMatch[1]);
      continue;
    }
    if (captionMatch) {
      flushBullets();
      flushParagraph();
      out.push(
        `<p style="margin:0 0 8px 0; font-size:12px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:#64748b">${escapeHtml(captionMatch[1])}</p>`,
      );
      continue;
    }
    flushBullets();
    paragraph.push(line);
  }
  flushBullets();
  flushParagraph();

  return out.join("\n") || `<p style="margin:0; color:#334155">${escapeHtml(String(body || ""))}</p>`;
}



function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

async function handleTestEmail(payload: Record<string, unknown>, authHeader: string) {
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const to = String(payload?.to || "").trim();
    const senderName = String(payload?.sender_name || "Test").trim();
    const senderEmail = String(payload?.sender_email || "").trim();

    if (!to || !senderEmail) {
      return new Response(JSON.stringify({ error: "Missing 'to' or 'sender_email'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is a club admin
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.98.0");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clubId = String(payload?.clubId || "");
    if (!clubId) {
      return new Response(JSON.stringify({ error: "clubId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await supabaseAdmin.rpc("is_club_admin", {
      _user_id: user.id,
      _club_id: clubId,
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Only club admins can send test emails" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const smtpHost = String(payload?.smtp_host || "").trim();
    const smtpPort = Number(payload?.smtp_port) || 587;
    const smtpUser = String(payload?.smtp_user || "").trim();
    const smtpPass = String(payload?.smtp_pass || "").trim();

    // Restrict SMTP ports to standard submission/SMTP ports to limit SSRF surface
    const ALLOWED_SMTP_PORTS = new Set([25, 465, 587, 2525]);
    if (!ALLOWED_SMTP_PORTS.has(smtpPort)) {
      return new Response(JSON.stringify({ ok: false, reason: `SMTP port ${smtpPort} is not allowed. Use 25, 465, 587, or 2525.` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!smtpHost || !smtpUser || !smtpPass) {
      return new Response(JSON.stringify({ ok: false, reason: "Missing SMTP settings (host, user, or password)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = `✅ SquashHub Test Email — ${senderName}`;
    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height:1.4; color:#0f172a">
        <h2 style="margin:0 0 8px 0">🎉 Email Settings Working!</h2>
        <p style="margin:0 0 14px 0; color:#334155">
          This is a test email from <strong>${escapeHtml(senderName)}</strong> (${escapeHtml(senderEmail)}).
        </p>
        <p style="margin:0 0 14px 0; color:#334155">
          Your club email configuration is set up correctly. Members will receive
          notifications from this sender address.
        </p>
        <p style="margin:0; font-size:12px; color:#64748b">
          Sent via SquashHub email settings test.
        </p>
      </div>
    `.trim();
    const textBody = `Email Settings Working!\n\nThis is a test email from ${senderName} (${senderEmail}).\nYour club email configuration is set up correctly.\n`;

    // Send via club's own SMTP with timeout
    console.log(`[test-email] Attempting SMTP send to ${to} via ${smtpHost}:${smtpPort}`);
    
    const smtpPromise = (async () => {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465, // true for 465 (implicit TLS), false for 587 (STARTTLS)
        auth: { user: smtpUser, pass: smtpPass },
        requireTLS: smtpPort === 587,
      });

      await transporter.sendMail({
        from: `${senderName} <${senderEmail}>`,
        to,
        subject,
        text: textBody,
        html,
      });

      console.log(`[test-email] SMTP send succeeded to ${to}`);
      return { ok: true };
    })();

    const timeoutPromise = new Promise<{ ok: false; reason: string }>((resolve) =>
      setTimeout(() => resolve({ ok: false, reason: "SMTP connection timed out after 15 seconds. Your SMTP server may be unreachable from this environment. Please verify your SMTP host, port, username, and password." }), 15000)
    );

    const result = await Promise.race([smtpPromise, timeoutPromise]);

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Test email error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

/**
 * Club-branded ad-hoc send (client-triggered, club admin only).
 * Uses the CLUB's own SMTP sender when configured so tenant emails come from
 * the club's address; falls back to the platform sender only when the club has
 * not configured SMTP (or its SMTP send fails).
 */
async function handleClubSend(body: any, authHeader: string) {
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const clubId = String(body?.clubId || "").trim();
  const to = String(body?.to || "").trim();
  const subject = String(body?.subject || "").trim();
  const messageBody = String(body?.body || "");
  const link = String(body?.url || "").trim();
  const ctaLabel = String(body?.ctaLabel || "Open invitation").trim();
  const recipientName = String(body?.recipientName || "").trim();

  if (!clubId || !to || !to.includes("@") || !subject) {
    return json({ error: "clubId, to and subject are required" }, 400);
  }

  const { data: isAdmin } = await supabaseAdmin.rpc("is_club_admin", { _user_id: user.id, _club_id: clubId });
  if (!isAdmin) return json({ error: "Not a club admin" }, 403);

  let clubLogoUrl = "";
  try {
    const { data: clubRow } = await supabaseAdmin
      .from("clubs")
      .select("logo_url")
      .eq("id", clubId)
      .maybeSingle();
    clubLogoUrl = String((clubRow as any)?.logo_url || "").trim();
  } catch (err) {
    console.warn("[handleClubSend] club logo lookup failed", err);
  }
  const logoHeaderHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0">
      <tr>
        <td align="left" valign="middle">${clubLogoUrl ? `<img src="${escapeHtml(clubLogoUrl)}" alt="Club logo" height="36" style="display:inline-block;max-height:36px;max-width:140px;border-radius:6px" />` : ""}</td>
        <td align="right" valign="middle"><img src="https://bzbuppwzljadulwntjys.supabase.co/storage/v1/object/public/club-logos/_platform/squashhub-logo.png" alt="SquashHub" height="28" style="display:inline-block;max-height:28px;max-width:120px" /></td>
      </tr>
    </table>`;

  const greetingHtml = recipientName
    ? `<p style="margin:0 0 12px 0; color:#334155">Dear ${escapeHtml(recipientName)},</p>`
    : "";
  const ctaHtml = link
    ? `<p style="margin:0 0 18px 0"><a href="${escapeHtml(link)}" style="display:inline-block; padding:10px 14px; background:#1a5c3a; color:#fff; text-decoration:none; border-radius:8px">${escapeHtml(ctaLabel)}</a></p>`
    : "";
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height:1.5; color:#0f172a">
      ${logoHeaderHtml}
      <h2 style="margin:0 0 8px 0">${escapeHtml(subject)}</h2>
      ${greetingHtml}
      <div style="margin:0 0 14px 0; color:#334155">${renderBodyHtml(messageBody)}</div>
      ${ctaHtml}
    </div>
  `.trim();
  const text = `${subject}\n\n${recipientName ? `Dear ${recipientName},\n\n` : ""}${messageBody}${link ? `\n\nOpen: ${link}\n` : "\n"}`;

  const clubMail = await resolveClubMail(user.id, clubId);
  const platformArgs = {
    to,
    subject,
    text: messageBody,
    url: link,
    ctaLabel,
    recipientName,
    clubName: clubMail?.clubName || "",
    clubLogoUrl: clubMail?.clubLogoUrl || clubLogoUrl || "",
  };
  // The club's own email settings are tried FIRST. If they fail we still get the
  // message out via the platform sender, but we always report that the fallback
  // was used and why the club's own settings did not work.
  if (clubMail) {
    const result = await sendViaClubSmtp(clubMail, { to, subject, html, text });
    if (result.ok) return json({ ok: true, sender: clubMail.senderEmail });

    const message = describeSmtpError(result.reason || "", clubMail);
    console.error("[email-notifications] club SMTP send failed, falling back to platform", message);
    const fb = await sendViaPlatform(platformArgs);
    if (!fb.ok) {
      return json({ ok: false, error: `${message} The SquashHub fallback sender also failed: ${fb.reason || "unknown error"}.`, smtpError: result.reason || null }, 502);
    }
    return json({
      ok: true,
      sender: "platform",
      fallbackUsed: true,
      warning: `${message} The email was sent from the SquashHub address instead.`,
    });
  }

  const result = await sendViaPlatform(platformArgs);
  if (!result.ok) {
    return json({ ok: false, error: `Email could not be sent: ${result.reason || "unknown error"}. This club has no email (SMTP) settings configured, so the SquashHub sender was used.` }, 502);
  }
  return json({ ok: true, sender: "platform" });
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Handle requests from the client (body contains action)
  if (!action && req.method === "POST") {
    try {
      const body = await req.clone().json();
      const authHeader = req.headers.get("authorization") ?? "";
      if (body?.action === "test") {
        return handleTestEmail(body, authHeader);
      }
      if (body?.action === "club-send") {
        return handleClubSend(body, authHeader);
      }
    } catch { /* not JSON or no action, fall through */ }
  }


  if (action !== "send") {
    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const internalHeader = req.headers.get("x-internal-secret") ?? "";
  const expected = await getInternalSecret();
  if (!expected || internalHeader !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
    const targetUserId = String(payload?.targetUserId || "");
    const payloadEmail = String(payload?.targetEmail || "").trim();
    const payloadName = String(payload?.targetName || "").trim();
    const title = String(payload?.title || "Notification");
    const body = String(payload?.body || "");
    const notifUrl = String(payload?.url || "/notifications");
    const type = String(payload?.type || "");
    const data = payload?.data ?? null;
    const ccEmails: string[] = Array.isArray(payload?.ccEmails)
      ? Array.from(
          new Set<string>(
            payload.ccEmails
              .map((c: unknown) => String(c || "").trim().toLowerCase())
              .filter((c: string) => c.length > 3 && c.includes("@")),
          ),
        ).slice(0, 3)
      : [];

    if (!targetUserId && !payloadEmail) {
      return new Response(JSON.stringify({ error: "Missing recipient" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let profile: { email?: string | null; name?: string | null } | null = null;
    if (targetUserId) {
      const { data: profileData, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .select("email,name")
        .eq("id", targetUserId)
        .maybeSingle();
      if (profileErr) throw profileErr;
      profile = profileData;
    }

    const email = String(profile?.email || payloadEmail || "").trim();
    if (!email) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "No email on profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Club branding (logo + name) for the email header — resolved even when the
    // club has no SMTP config, so platform-sent mail carries the same logos.
    const explicitClubId = String(payload?.clubId || (data as any)?.club_id || "") || null;
    let clubBrand: { name: string; logoUrl: string } = { name: "", logoUrl: "" };
    if (explicitClubId) {
      try {
        const { data: clubRow } = await supabaseAdmin
          .from("clubs")
          .select("name,logo_url")
          .eq("id", explicitClubId)
          .maybeSingle();
        clubBrand = {
          name: String((clubRow as any)?.name || "").trim(),
          logoUrl: String((clubRow as any)?.logo_url || "").trim(),
        };
      } catch (err) {
        console.warn("[email-notifications] club branding lookup failed", err);
      }
    }

    const siteUrl = (Deno.env.get("SITE_URL") || "https://www.squashhub.co.za").trim();
    const link = absoluteUrl(siteUrl, notifUrl);

    const managePrefsUrl = absoluteUrl(siteUrl, "/");
    const mergeVars: Record<string, string> = {
      name: String((profile as any)?.name || payloadName || ""),
      email,
      site_url: siteUrl,
      link_url: link,
      unsubscribe_url: managePrefsUrl,
      campaign_name: String((data as any)?.campaign_name || (data as any)?.campaignName || ""),
      url: notifUrl,
      ...(typeof (data as any)?.merge === "object" && (data as any).merge ? (data as any).merge : {}),
    };

    let subject = `SquashHub: ${title}`;
    let html = "";
    let text = "";

    const marketingEmail = type === "marketing" && (data as any)?.email && typeof (data as any).email === "object" ? (data as any).email : null;
    if (marketingEmail && typeof marketingEmail.html === "string" && marketingEmail.html.trim()) {
      const subjectTpl = typeof marketingEmail.subject === "string" && marketingEmail.subject.trim() ? marketingEmail.subject : title;
      subject = renderTemplate(subjectTpl, mergeVars);

      const hasUnsubTag = /{{\s*unsubscribe_url\s*}}/i.test(marketingEmail.html);
      const rawHtml = renderTemplate(marketingEmail.html, mergeVars).replace(/<script[\s\S]*?<\/script>/gi, "");
      const footer = `
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0" />
        <p style="margin:0;font-size:12px;color:#64748b">
          You’re receiving this because you opted in to marketing emails. Unsubscribe: <a href="${escapeHtml(mergeVars.unsubscribe_url)}">${escapeHtml(mergeVars.unsubscribe_url)}</a>
        </p>
      `.trim();
      html = hasUnsubTag ? rawHtml : `${rawHtml}\n${footer}`;

      const rawText = typeof marketingEmail.text === "string" ? renderTemplate(marketingEmail.text, mergeVars) : "";
      text = rawText.trim() ? rawText.trim() : stripHtml(html);
      if (!text.includes(mergeVars.unsubscribe_url)) {
        text = `${text}\n\nUnsubscribe: ${mergeVars.unsubscribe_url}\n`;
      }
    } else {
      const safeTitle = escapeHtml(title);
      const recipientName = String((profile as any)?.name || payloadName || "").trim();
      const greetingName = recipientName.split(/\s+/).length > 0 ? recipientName : "";
      const greetingHtml = greetingName
        ? `<p style="margin:0 0 12px 0; color:#334155">Dear ${escapeHtml(greetingName)},</p>`
        : "";
      const safeBody = renderBodyHtml(body);
      const safeLink = escapeHtml(link);

      const ctaLabel =
        type === "tournament_invite" || type === "tournament_partner_invite"
          ? "Accept / Register"
          : "Open in SquashHub";

      const clubLogoUrl = clubBrand.logoUrl;
      const clubNameForHeader = clubBrand.name || "Club logo";
      const logoHeaderHtml = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0">
          <tr>
            <td align="left" valign="middle">${clubLogoUrl ? `<img src="${escapeHtml(clubLogoUrl)}" alt="${escapeHtml(clubNameForHeader)}" height="36" style="display:inline-block;max-height:36px;max-width:140px;border-radius:6px" />` : ""}</td>
            <td align="right" valign="middle"><img src="https://bzbuppwzljadulwntjys.supabase.co/storage/v1/object/public/club-logos/_platform/squashhub-logo.png" alt="SquashHub" height="28" style="display:inline-block;max-height:28px;max-width:120px" /></td>
          </tr>
        </table>`;

      const isTournamentInvite = type === "tournament_invite" || type === "tournament_partner_invite";
      const inviteExplainerHtml = isTournamentInvite
        ? `<p style="margin:0 0 18px 0; font-size:12px; color:#64748b">
            No SquashHub account yet? No problem — just tap the button above. You can accept or decline straight away,
            and if you'd like an account you can create one from that page; it will be linked to your club membership automatically.
          </p>`
        : "";

      html = `
        <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height:1.5; color:#0f172a">
          ${logoHeaderHtml}
          <h2 style="margin:0 0 8px 0">${safeTitle}</h2>
          ${greetingHtml}
          <div style="margin:0 0 14px 0; color:#334155">${safeBody}</div>
          <p style="margin:0 0 ${isTournamentInvite ? "6" : "18"}px 0">
            <a href="${safeLink}" style="display:inline-block; padding:10px 14px; background:#1a5c3a; color:#fff; text-decoration:none; border-radius:8px">
              ${escapeHtml(ctaLabel)}
            </a>
          </p>
          ${inviteExplainerHtml}
          <p style="margin:0; font-size:12px; color:#64748b">
            If you prefer not to receive these emails, you’ll be able to disable transactional emails in your profile settings.
          </p>
        </div>
      `.trim();

      text = `${title}\n\n${greetingName ? `Dear ${greetingName},\n\n` : ""}${body}\n\n${ctaLabel}: ${link}\n`;
    }


    const clubMail = await resolveClubMail(targetUserId, explicitClubId);
    let result: { ok: boolean; skipped?: boolean; reason?: string };
    const platformArgs = {
      to: email,
      subject,
      text: body,
      url: link,
      ctaLabel: type === "tournament_invite" || type === "tournament_partner_invite" ? "Accept / Register" : "Open in SquashHub",
      recipientName: String((profile as any)?.name || payloadName || "").trim(),
      clubName: clubMail?.clubName || clubBrand.name || "",
      clubLogoUrl: clubMail?.clubLogoUrl || clubBrand.logoUrl || "",
    };
    let fallbackWarning: string | null = null;
    let usedPlatform = false;
    if (clubMail) {
      result = await sendViaClubSmtp(clubMail, { to: email, cc: ccEmails, subject, html, text });
      if (!result.ok) {
        // Try the club's own settings first, then fall back to the platform
        // sender so the message still goes out — always logged/reported.
        fallbackWarning = describeSmtpError(result.reason || "", clubMail);
        console.error("[email-notifications] club SMTP failed, using platform sender", fallbackWarning);
        result = await sendViaPlatform(platformArgs);
        usedPlatform = true;
      }
    } else {
      result = await sendViaPlatform(platformArgs);
      usedPlatform = true;
    }

    // The platform sender has no CC field: send the admin their own copy so the
    // club still sees what went out.
    if (usedPlatform && result.ok && ccEmails.length) {
      for (const cc of ccEmails) {
        try {
          await sendViaPlatform({ ...platformArgs, to: cc, subject: `[copy] ${subject}` });
        } catch (e) {
          console.error("[email-notifications] cc copy failed", cc, (e as Error).message);
        }
      }
    }


    if (!result.ok) {
      return new Response(JSON.stringify({ ...result, error: result.reason || "Email could not be sent" }), {
        status: result.skipped ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, fallbackUsed: !!fallbackWarning, warning: fallbackWarning }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Email notifications error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
