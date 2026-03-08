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

  const from = (Deno.env.get("EMAIL_FROM") || "GB Squash <onboarding@resend.dev>").trim();

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

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

    const siteUrl = (Deno.env.get("SITE_URL") || "https://gordon-s-bay-squash-hub.vercel.app").trim();
    const link = absoluteUrl(siteUrl, notifUrl);

    const subject = `GB Squash: ${title}`;
    const safeTitle = escapeHtml(title);
    const safeBody = escapeHtml(body);
    const safeLink = escapeHtml(link);

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height:1.4; color:#0f172a">
        <h2 style="margin:0 0 8px 0">${safeTitle}</h2>
        <p style="margin:0 0 14px 0; color:#334155">${safeBody}</p>
        <p style="margin:0 0 18px 0">
          <a href="${safeLink}" style="display:inline-block; padding:10px 14px; background:#1a5c3a; color:#fff; text-decoration:none; border-radius:8px">
            Open in GB Squash
          </a>
        </p>
        <p style="margin:0; font-size:12px; color:#64748b">
          If you prefer not to receive these emails, you’ll be able to disable transactional emails in your profile settings.
        </p>
      </div>
    `.trim();

    const text = `${title}\n\n${body}\n\nOpen: ${link}\n`;

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

