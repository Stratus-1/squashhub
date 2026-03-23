import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface SmtpConfig {
  name: string;
  logo_url: string | null;
  sender_name: string | null;
  sender_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
}

async function getClubBySubdomain(subdomain: string): Promise<SmtpConfig | null> {
  const { data, error } = await supabaseAdmin
    .from("clubs")
    .select("name, logo_url, sender_name, sender_email, smtp_host, smtp_port, smtp_user, smtp_pass")
    .eq("subdomain", subdomain)
    .single();

  if (error || !data) return null;
  return data as SmtpConfig;
}

async function getPlatformSmtp(): Promise<SmtpConfig | null> {
  const keys = [
    "platform_sender_email",
    "platform_sender_name",
    "platform_smtp_host",
    "platform_smtp_port",
    "platform_smtp_user",
    "platform_smtp_pass",
  ];
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", keys);

  if (!data || data.length === 0) return null;

  const map: Record<string, string> = {};
  data.forEach((r: { key: string; value: string }) => (map[r.key] = r.value));

  if (!map.platform_smtp_host || !map.platform_smtp_user || !map.platform_smtp_pass || !map.platform_sender_email) {
    return null;
  }

  return {
    name: map.platform_sender_name || "SquashHub",
    logo_url: null,
    sender_name: map.platform_sender_name || "SquashHub",
    sender_email: map.platform_sender_email,
    smtp_host: map.platform_smtp_host,
    smtp_port: parseInt(map.platform_smtp_port || "587", 10),
    smtp_user: map.platform_smtp_user,
    smtp_pass: map.platform_smtp_pass,
  };
}

function hasSmtpConfig(config: SmtpConfig): boolean {
  return !!(config.smtp_host && config.smtp_user && config.smtp_pass && config.sender_email);
}

function buildConfirmationHtml(
  config: SmtpConfig,
  confirmationUrl: string,
  recipientName: string,
  emailType: string,
): string {
  const clubName = escapeHtml(config.name);
  const logoHtml = config.logo_url
    ? `<img src="${escapeHtml(config.logo_url)}" alt="${clubName}" style="width:64px;height:64px;object-fit:contain;border-radius:8px;margin-bottom:16px" />`
    : "";

  let heading = "Confirm Your Email";
  let bodyText = `Thanks for registering with <strong>${clubName}</strong>. Please click the button below to confirm your email address and activate your account.`;
  let buttonText = "Confirm Email";

  if (emailType === "recovery" || emailType === "reset") {
    heading = "Reset Your Password";
    bodyText = `You requested a password reset for your <strong>${clubName}</strong> account. Click the button below to set a new password.`;
    buttonText = "Reset Password";
  } else if (emailType === "magic_link" || emailType === "magiclink") {
    heading = "Your Login Link";
    bodyText = `Click the button below to sign in to <strong>${clubName}</strong>.`;
    buttonText = "Sign In";
  } else if (emailType === "invite") {
    heading = "You've Been Invited";
    bodyText = `You've been invited to join <strong>${clubName}</strong>. Click the button below to accept and set up your account.`;
    buttonText = "Accept Invitation";
  } else if (emailType === "email_change") {
    heading = "Confirm Email Change";
    bodyText = `You requested to change the email address on your <strong>${clubName}</strong> account. Click the button below to confirm.`;
    buttonText = "Confirm Change";
  } else if (emailType === "test") {
    heading = "Test Email";
    bodyText = `This is a test email from <strong>${clubName}</strong>. If you received this, your SMTP settings are working correctly! 🎉`;
    buttonText = "Visit SquashHub";
  } else if (emailType === "welcome") {
    heading = "Welcome! 🎉";
    bodyText = `Your account with <strong>${clubName}</strong> has been created successfully. You can now log in and start using the platform.`;
    buttonText = "";
  } else if (emailType === "club_registered") {
    heading = "Club Registered! 🏸";
    bodyText = `Congratulations! Your club <strong>${clubName}</strong> has been successfully registered on SquashHub. You are now the club captain with full admin rights. Head to your Club Admin panel to start setting up courts, members, and more.`;
    buttonText = "Go to Club Admin";
  }

  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : "Hi,";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
<tr><td style="padding:32px 24px;text-align:center">
  ${logoHtml}
  <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a">${heading}</h1>
  <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.5">${greeting}<br/>${bodyText}</p>
  ${confirmationUrl ? `<a href="${escapeHtml(confirmationUrl)}" style="display:inline-block;padding:12px 28px;background:#1a5c3a;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;border-radius:8px">${buttonText}</a>` : ""}
  <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.4">
    If you didn't request this, you can safely ignore this email.
  </p>
</td></tr>
<tr><td style="padding:16px 24px;background:#f8fafc;text-align:center;border-top:1px solid #e2e8f0">
  <p style="margin:0;font-size:11px;color:#94a3b8">${clubName} — Powered by SquashHub</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`.trim();
}

async function sendViaSmtp(
  config: SmtpConfig,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const smtpHost = config.smtp_host!.trim();
    const smtpPort = config.smtp_port || 587;
    const smtpUser = config.smtp_user!.trim();
    const smtpPass = config.smtp_pass!.trim();
    const senderName = (config.sender_name || config.name).trim();
    const senderEmail = config.sender_email!.trim();

    console.log(`[auth-email-hook] Sending via SMTP: ${smtpHost}:${smtpPort} from ${senderEmail} to ${to}`);

    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: smtpPort === 465,
        auth: { username: smtpUser, password: smtpPass },
      },
    });

    await client.send({
      from: `${senderName} <${senderEmail}>`,
      to,
      subject,
      content: text,
      html,
    });

    await client.close();
    console.log(`[auth-email-hook] SMTP send succeeded to ${to}`);
    return { ok: true };
  } catch (err) {
    console.error(`[auth-email-hook] SMTP send failed:`, err);
    return { ok: false, reason: (err as Error).message || String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ── Test email action ──
    if (action === "test") {
      const body = await req.json();
      const recipientEmail = body.to;
      const source = body.source || "platform"; // "platform" or "club"
      const subdomain = body.subdomain || null;

      if (!recipientEmail) {
        return new Response(JSON.stringify({ error: "Missing 'to' field" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let smtpConfig: SmtpConfig | null = null;

      if (source === "club" && subdomain) {
        smtpConfig = await getClubBySubdomain(subdomain);
      }

      if (!smtpConfig || !hasSmtpConfig(smtpConfig)) {
        smtpConfig = await getPlatformSmtp();
      }

      if (!smtpConfig || !hasSmtpConfig(smtpConfig)) {
        return new Response(
          JSON.stringify({ error: "No SMTP settings configured. Please save your SMTP settings first." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const subject = `${smtpConfig.name}: Test Email`;
      const html = buildConfirmationHtml(smtpConfig, "", "", "test");
      const text = `Test email from ${smtpConfig.name}. If you received this, your SMTP settings are working correctly!`;

      const sendPromise = sendViaSmtp(smtpConfig, recipientEmail, subject, html, text);
      const timeoutPromise = new Promise<{ ok: false; reason: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, reason: "SMTP timeout after 15s" }), 15000),
      );

      const result = await Promise.race([sendPromise, timeoutPromise]);

      if (result.ok) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ error: result.reason || "SMTP send failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Welcome email action (sent after auto-confirmed signup) ──
    if (action === "welcome") {
      const body = await req.json();
      const recipientEmail = body.to;
      const recipientName = body.name || "";
      const subdomain = body.subdomain || null;

      if (!recipientEmail) {
        return new Response(JSON.stringify({ error: "Missing 'to' field" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let smtpConfig: SmtpConfig | null = null;
      if (subdomain) {
        smtpConfig = await getClubBySubdomain(subdomain);
      }
      if (!smtpConfig || !hasSmtpConfig(smtpConfig)) {
        smtpConfig = await getPlatformSmtp();
      }
      if (!smtpConfig || !hasSmtpConfig(smtpConfig)) {
        console.log("[auth-email-hook] No SMTP config for welcome email, skipping");
        return new Response(JSON.stringify({ skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const subject = `Welcome to ${smtpConfig.name}!`;
      const html = buildConfirmationHtml(smtpConfig, "", recipientName, "welcome");
      const text = `Welcome to ${smtpConfig.name}! Your account has been created successfully.`;

      const sendPromise = sendViaSmtp(smtpConfig, recipientEmail, subject, html, text);
      const timeoutPromise = new Promise<{ ok: false; reason: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, reason: "SMTP timeout after 15s" }), 15000),
      );

      const result = await Promise.race([sendPromise, timeoutPromise]);

      return new Response(JSON.stringify({ success: result.ok, reason: result.ok ? undefined : result.reason }), {
        status: result.ok ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Club registered email action ──
    if (action === "club-registered") {
      const body = await req.json();
      const recipientEmail = body.to;
      const recipientName = body.name || "";
      const clubName = body.clubName || "Your Club";
      const clubAdminUrl = body.clubAdminUrl || "";

      if (!recipientEmail) {
        return new Response(JSON.stringify({ error: "Missing 'to' field" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use platform SMTP for club registration (club doesn't have SMTP yet)
      let smtpConfig = await getPlatformSmtp();
      if (!smtpConfig || !hasSmtpConfig(smtpConfig)) {
        console.log("[auth-email-hook] No platform SMTP config for club-registered email, skipping");
        return new Response(JSON.stringify({ skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Override the config name with the new club name for branding
      const emailConfig = { ...smtpConfig, name: clubName };
      const subject = `Welcome to SquashHub — ${clubName} is live!`;
      const html = buildConfirmationHtml(emailConfig, clubAdminUrl, recipientName, "club_registered");
      const text = `Congratulations! ${clubName} has been registered on SquashHub. You are the club captain with full admin rights. Visit your Club Admin panel to get started.`;

      const sendPromise = sendViaSmtp(smtpConfig, recipientEmail, subject, html, text);
      const timeoutPromise = new Promise<{ ok: false; reason: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, reason: "SMTP timeout after 15s" }), 15000),
      );

      const result = await Promise.race([sendPromise, timeoutPromise]);

      return new Response(JSON.stringify({ success: result.ok, reason: result.ok ? undefined : result.reason }), {
        status: result.ok ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Parse the webhook payload from the auth system
    const payload = await req.json();
    const user = payload?.user;
    const emailData = payload?.email_data;

    if (!user || !emailData) {
      console.log("[auth-email-hook] No user or email_data in payload, passing through");
      return new Response(JSON.stringify({}), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipientEmail = user.email;
    const userMeta = user.user_metadata || {};
    const clubSubdomain = userMeta.club_subdomain || null;
    const recipientName = userMeta.name || "";
    const confirmationUrl = emailData.confirmation_url || emailData.action_link || "";
    const emailType = (emailData.email_action_type || emailData.token_type || "signup").toLowerCase();

    console.log(`[auth-email-hook] email_type=${emailType}, club_subdomain=${clubSubdomain}, to=${recipientEmail}`);

    // Determine SMTP config: club first, then platform fallback
    let smtpConfig: SmtpConfig | null = null;

    if (clubSubdomain) {
      smtpConfig = await getClubBySubdomain(clubSubdomain);
    }

    if (!smtpConfig || !hasSmtpConfig(smtpConfig)) {
      // Try platform SMTP as fallback
      smtpConfig = await getPlatformSmtp();
    }

    if (!smtpConfig || !hasSmtpConfig(smtpConfig)) {
      console.log("[auth-email-hook] No SMTP config available (club or platform), using default Supabase email");
      return new Response(JSON.stringify({}), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build branded email
    let subject = `${smtpConfig.name}: Confirm Your Email`;
    if (emailType === "recovery" || emailType === "reset") {
      subject = `${smtpConfig.name}: Reset Your Password`;
    } else if (emailType === "magic_link" || emailType === "magiclink") {
      subject = `${smtpConfig.name}: Your Login Link`;
    } else if (emailType === "invite") {
      subject = `${smtpConfig.name}: You've Been Invited`;
    } else if (emailType === "email_change") {
      subject = `${smtpConfig.name}: Confirm Email Change`;
    }

    const html = buildConfirmationHtml(smtpConfig, confirmationUrl, recipientName, emailType);
    const text = `${subject}\n\nClick the link below:\n${confirmationUrl}\n\nIf you didn't request this, ignore this email.\n\n${smtpConfig.name} — Powered by SquashHub`;

    // Send with timeout
    const sendPromise = sendViaSmtp(smtpConfig, recipientEmail, subject, html, text);
    const timeoutPromise = new Promise<{ ok: false; reason: string }>((resolve) =>
      setTimeout(() => resolve({ ok: false, reason: "SMTP timeout after 15s" }), 15000),
    );

    const result = await Promise.race([sendPromise, timeoutPromise]);

    if (result.ok) {
      return new Response(JSON.stringify({ handled: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.error(`[auth-email-hook] SMTP failed (${result.reason}), falling back to default`);
    return new Response(JSON.stringify({}), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[auth-email-hook] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
