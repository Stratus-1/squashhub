import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-internal-secret",
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

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

async function handleTestEmail(req: Request) {
  // Authenticate via Supabase JWT
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
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
    if (clubId) {
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
    }

    // Send test email via Resend (the only provider currently wired)
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
    const text = `Email Settings Working!\n\nThis is a test email from ${senderName} (${senderEmail}).\nYour club email configuration is set up correctly.\n`;

    const result = await sendViaResend({ to, subject, html, text });

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : (result.skipped ? 200 : 500),
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Handle test email from client (body has action field)
  if (!action && req.method === "POST") {
    try {
      const cloned = req.clone();
      const body = await cloned.json();
      if (body?.action === "test") {
        return handleTestEmail(req);
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
    const title = String(payload?.title || "Notification");
    const body = String(payload?.body || "");
    const notifUrl = String(payload?.url || "/notifications");
    const type = String(payload?.type || "");
    const data = payload?.data ?? null;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "Missing targetUserId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("email,name")
      .eq("id", targetUserId)
      .single();
    if (profileErr) throw profileErr;

    const email = String(profile?.email || "").trim();
    if (!email) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "No email on profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const siteUrl = (Deno.env.get("SITE_URL") || "https://www.squashhub.co.za").trim();
    const link = absoluteUrl(siteUrl, notifUrl);

    const managePrefsUrl = absoluteUrl(siteUrl, "/");
    const mergeVars: Record<string, string> = {
      name: String((profile as any)?.name || ""),
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
      const safeBody = escapeHtml(body);
      const safeLink = escapeHtml(link);

      html = `
        <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height:1.4; color:#0f172a">
          <h2 style="margin:0 0 8px 0">${safeTitle}</h2>
          <p style="margin:0 0 14px 0; color:#334155">${safeBody}</p>
          <p style="margin:0 0 18px 0">
            <a href="${safeLink}" style="display:inline-block; padding:10px 14px; background:#1a5c3a; color:#fff; text-decoration:none; border-radius:8px">
              Open in SquashHub
            </a>
          </p>
          <p style="margin:0; font-size:12px; color:#64748b">
            If you prefer not to receive these emails, you’ll be able to disable transactional emails in your profile settings.
          </p>
        </div>
      `.trim();

      text = `${title}\n\n${body}\n\nOpen: ${link}\n`;
    }

    const result = await sendViaResend({ to: email, subject, html, text });

    if (!result.ok) {
      return new Response(JSON.stringify(result), {
        status: result.skipped ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
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
