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

interface ClubSmtp {
  name: string;
  logo_url: string | null;
  sender_name: string | null;
  sender_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
}

async function getClubBySubdomain(subdomain: string): Promise<ClubSmtp | null> {
  const { data, error } = await supabaseAdmin
    .from("clubs")
    .select("name, logo_url, sender_name, sender_email, smtp_host, smtp_port, smtp_user, smtp_pass")
    .eq("subdomain", subdomain)
    .single();

  if (error || !data) return null;
  return data as ClubSmtp;
}

function hasSmtpConfig(club: ClubSmtp): boolean {
  return !!(club.smtp_host && club.smtp_user && club.smtp_pass && club.sender_email);
}

function buildConfirmationHtml(
  club: ClubSmtp,
  confirmationUrl: string,
  recipientName: string,
  emailType: string,
): string {
  const clubName = escapeHtml(club.name);
  const logoHtml = club.logo_url
    ? `<img src="${escapeHtml(club.logo_url)}" alt="${clubName}" style="width:64px;height:64px;object-fit:contain;border-radius:8px;margin-bottom:16px" />`
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
  <a href="${escapeHtml(confirmationUrl)}" style="display:inline-block;padding:12px 28px;background:#1a5c3a;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;border-radius:8px">${buttonText}</a>
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

async function sendViaClubSmtp(
  club: ClubSmtp,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const smtpHost = club.smtp_host!.trim();
    const smtpPort = club.smtp_port || 587;
    const smtpUser = club.smtp_user!.trim();
    const smtpPass = club.smtp_pass!.trim();
    const senderName = (club.sender_name || club.name).trim();
    const senderEmail = club.sender_email!.trim();

    console.log(`[auth-email-hook] Sending via club SMTP: ${smtpHost}:${smtpPort} from ${senderEmail} to ${to}`);

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
    const payload = await req.json();

    // Supabase auth hook payload structure
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

    // If no club subdomain in metadata, let Supabase send the default email
    if (!clubSubdomain) {
      console.log("[auth-email-hook] No club_subdomain, using default Supabase email");
      return new Response(JSON.stringify({}), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up club SMTP settings
    const club = await getClubBySubdomain(clubSubdomain);
    if (!club || !hasSmtpConfig(club)) {
      console.log(`[auth-email-hook] Club "${clubSubdomain}" not found or missing SMTP config, using default`);
      return new Response(JSON.stringify({}), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build branded email
    let subject = `${club.name}: Confirm Your Email`;
    if (emailType === "recovery" || emailType === "reset") {
      subject = `${club.name}: Reset Your Password`;
    } else if (emailType === "magic_link" || emailType === "magiclink") {
      subject = `${club.name}: Your Login Link`;
    } else if (emailType === "invite") {
      subject = `${club.name}: You've Been Invited`;
    } else if (emailType === "email_change") {
      subject = `${club.name}: Confirm Email Change`;
    }

    const html = buildConfirmationHtml(club, confirmationUrl, recipientName, emailType);
    const text = `${subject}\n\nClick the link below:\n${confirmationUrl}\n\nIf you didn't request this, ignore this email.\n\n${club.name} — Powered by SquashHub`;

    // Send with timeout
    const sendPromise = sendViaClubSmtp(club, recipientEmail, subject, html, text);
    const timeoutPromise = new Promise<{ ok: false; reason: string }>((resolve) =>
      setTimeout(() => resolve({ ok: false, reason: "SMTP timeout after 15s" }), 15000),
    );

    const result = await Promise.race([sendPromise, timeoutPromise]);

    if (result.ok) {
      // Tell Supabase NOT to send its default email
      return new Response(JSON.stringify({ handled: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If club SMTP failed, fall back to default Supabase email
    console.error(`[auth-email-hook] Club SMTP failed (${result.reason}), falling back to default`);
    return new Response(JSON.stringify({}), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[auth-email-hook] Error:", err);
    return new Response(JSON.stringify({}), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
