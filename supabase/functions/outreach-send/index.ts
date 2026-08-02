// deno-lint-ignore-file no-explicit-any
// Outreach campaign sender (platform super admin only, plus cron).
// Actions: prepare | test | run
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const TRACK_BASE = `${SUPABASE_URL}/functions/v1/outreach-track`;
const ALLOWED_SMTP_PORTS = new Set([25, 465, 587, 2525]);

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function stripHtml(html: string) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h\d|br|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function renderMerge(tpl: string, vars: Record<string, string>) {
  return String(tpl ?? "").replace(
    /{{\s*([a-zA-Z0-9_.]+)\s*}}/g,
    (_, k) => (vars[k] != null ? String(vars[k]) : ""),
  );
}

/** Clickable YouTube thumbnail block. We never attach an MP4. */
function videoBlock(campaign: any) {
  const desktopUrl = campaign?.video_desktop_url || "";
  const mobileUrl = campaign?.video_mobile_url || "";
  const thumbUrl = campaign?.video_thumb_url || "";
  if (!desktopUrl && !mobileUrl) return "";
  const primary = desktopUrl || mobileUrl;
  const thumb = thumbUrl
    ? `<a href="${primary}"><img src="${thumbUrl}" alt="Watch the SquashHub overview" width="560" style="display:block;width:100%;max-width:560px;border-radius:10px;border:1px solid #e2e8f0"></a>`
    : "";
  const mobileLine =
    mobileUrl && desktopUrl
      ? `<p style="margin:8px 0 0;font-size:13px;color:#64748b">Watching on your phone? <a href="${mobileUrl}" style="color:#1d4ed8">Here's the mobile walkthrough</a>.</p>`
      : "";
  return `<div style="margin:22px 0">
${thumb}
<p style="margin:12px 0 0"><a href="${primary}" style="display:inline-block;background:#0E1F35;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">▶ Watch the 60-second overview</a></p>
${mobileLine}
</div>`;
}

function mergeVars(prospect: any, contact: any, campaign?: any) {
  const name = String(contact?.name || "").trim();
  return {
    club_name: String(prospect?.club_name || "your club"),
    club_subdomain: String(prospect?.club_subdomain || ""),
    club_url: prospect?.club_subdomain ? `https://${prospect.club_subdomain}.squashhub.co.za` : "https://squashhub.co.za",
    club_link: prospect?.club_subdomain
      ? `<a href="https://${prospect.club_subdomain}.squashhub.co.za" style="color:#1d4ed8;font-weight:bold">${prospect.club_subdomain}.squashhub.co.za</a>`
      : `<a href="https://squashhub.co.za" style="color:#1d4ed8;font-weight:bold">squashhub.co.za</a>`,
    contact_name: name || "there",
    first_name: name.split(/\s+/)[0] || "there",
    role: String(contact?.role || ""),
    association: String(prospect?.association || ""),
    city: String(prospect?.city || ""),
    country: String(prospect?.country || ""),
    email: String(contact?.email || ""),
    video_block: videoBlock(campaign),
  };
}


async function getSettings() {
  const keys = [
    "platform_smtp_host", "platform_smtp_port", "platform_smtp_user",
    "platform_smtp_pass", "platform_sender_email", "platform_sender_name",
  ];
  const { data } = await admin.from("app_settings").select("key,value").in("key", keys);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[(row as any).key] = String((row as any).value ?? "");
  return map;
}

/** Rewrites every href in the body to a tracked redirect, registering links on the campaign. */
async function buildLinkMap(campaignId: string, bodyHtml: string) {
  const urls = new Set<string>();
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyHtml)) !== null) {
    const u = m[1].trim();
    if (/^https?:\/\//i.test(u)) urls.add(u);
  }
  const map = new Map<string, string>();
  if (!urls.size) return map;

  const { data: existing } = await admin
    .from("outreach_links").select("id,target_url").eq("campaign_id", campaignId);
  for (const row of existing ?? []) map.set((row as any).target_url, (row as any).id);

  const missing = [...urls].filter((u) => !map.has(u));
  if (missing.length) {
    const { data: inserted } = await admin
      .from("outreach_links")
      .insert(missing.map((u) => ({ campaign_id: campaignId, target_url: u })))
      .select("id,target_url");
    for (const row of inserted ?? []) map.set((row as any).target_url, (row as any).id);
  }
  return map;
}

function applyTracking(
  html: string,
  linkMap: Map<string, string>,
  recipientId: string,
  trackable: boolean,
) {
  let out = html;
  if (trackable) {
    out = out.replace(/href\s*=\s*["']([^"']+)["']/gi, (full, u) => {
      const id = linkMap.get(String(u).trim());
      if (!id) return full;
      return `href="${TRACK_BASE}/click?r=${recipientId}&l=${id}"`;
    });
  }
  const unsub = trackable
    ? `<a href="${TRACK_BASE}/u?r=${recipientId}" style="color:#94a3b8">Unsubscribe</a>`
    : `<span style="color:#94a3b8">Unsubscribe</span>`;
  const footer = `<div style="margin-top:26px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:11px;color:#94a3b8;line-height:1.5">
SquashHub — HKFT Services, South Africa.<br>
You are receiving this because you are listed as a contact for a squash club. ${unsub} and we will not contact you again.
</div>`;
  const pixel = trackable
    ? `<img src="${TRACK_BASE}/open?r=${recipientId}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">`
    : "";
  return `${out}${footer}${pixel}`;
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token && token === SERVICE_KEY) return { cron: true, userId: null as string | null };

  const userClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;
  const { data: ok } = await admin.rpc("is_platform_admin", { _user_id: user.id });
  if (!ok) return null;
  return { cron: false, userId: user.id };
}

/** Materialise the recipient list for a campaign from its audience filter. */
async function prepare(campaign: any) {
  const f = campaign.audience_filter ?? {};
  let q = admin.from("outreach_prospects").select("id,club_name,association,city,country,status");

  if (f.association) q = q.eq("association", f.association);
  if (f.country) q = q.eq("country", f.country);
  if (typeof f.is_nsa === "boolean") q = q.eq("is_nsa", f.is_nsa);
  if (f.status) q = q.eq("status", f.status);
  if (Array.isArray(f.tags) && f.tags.length) q = q.overlaps("tags", f.tags);
  if (Array.isArray(f.prospect_ids) && f.prospect_ids.length) q = q.in("id", f.prospect_ids);

  const { data: prospects, error } = await q;
  if (error) throw new Error(error.message);
  const ids = (prospects ?? []).map((p: any) => p.id);

  const { data: contacts } = ids.length
    ? await admin
        .from("outreach_contacts")
        .select("id,prospect_id,email,name,role,opted_out,bounced")
        .in("prospect_id", ids)
    : { data: [] as any[] };

  const eligible = (contacts ?? []).filter(
    (c: any) => c.email && c.email.includes("@") && !c.opted_out && !c.bounced,
  );
  const skipped = (contacts ?? []).length - eligible.length;

  // Prune queued (not yet sent) recipients that no longer match the audience.
  const keepIds = eligible.map((c: any) => c.id);
  let pruneQ = admin
    .from("outreach_recipients")
    .delete()
    .eq("campaign_id", campaign.id)
    .eq("send_status", "queued");
  if (keepIds.length) pruneQ = pruneQ.not("contact_id", "in", `(${keepIds.join(",")})`);
  const { data: pruned } = await pruneQ.select("id");
  const removed = (pruned ?? []).length;

  if (!eligible.length) return { added: 0, skipped, removed };

  const rows = eligible.map((c: any) => ({
    campaign_id: campaign.id,
    prospect_id: c.prospect_id,
    contact_id: c.id,
    email: c.email,
    send_status: "queued",
  }));

  const { data: ins } = await admin
    .from("outreach_recipients")
    .upsert(rows, { onConflict: "campaign_id,contact_id", ignoreDuplicates: true })
    .select("id");

  return { added: (ins ?? []).length, skipped, removed };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "run");

    // ---------- cron sweep ----------
    if (action === "cron") {
      const { data: running } = await admin
        .from("outreach_campaigns").select("id").eq("status", "sending");
      const results: any[] = [];
      for (const c of running ?? []) {
        const r = await runCampaign((c as any).id);
        results.push({ campaign_id: (c as any).id, ...r });
      }
      return json({ ok: true, campaigns: results });
    }

    const campaignId = String(body.campaign_id || "");
    if (!campaignId) return json({ error: "campaign_id required" }, 400);

    const { data: campaign } = await admin
      .from("outreach_campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (!campaign) return json({ error: "Campaign not found" }, 404);

    if (action === "prepare") {
      const res = await prepare(campaign);
      return json({ ok: true, ...res });
    }

    if (action === "test") {
      const to = String(body.to || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: "Valid 'to' required" }, 400);
      const s = await getSettings();
      const smtp = await makeTransport(s);
      if ("error" in smtp) return json({ error: smtp.error }, 400);

      // Optionally render the test using a real prospect's details.
      let prospect: any = {
        club_name: "Pretoria Squash Club", association: "Squash Northerns",
        city: "Pretoria", country: "South Africa", club_subdomain: "pcc",
      };
      let contact: any = { name: "Test Chairman", role: "Chairman", email: to };

      const prospectId = String(body.prospect_id || "").trim();
      if (prospectId) {
        const { data: p } = await admin
          .from("outreach_prospects")
          .select("id,club_name,association,city,country,club_subdomain")
          .eq("id", prospectId).maybeSingle();
        if (p) {
          prospect = p;
          const { data: cts } = await admin
            .from("outreach_contacts")
            .select("name,role,email,is_primary")
            .eq("prospect_id", prospectId);
          const pick = (cts ?? []).find((x: any) => x.is_primary) ?? (cts ?? [])[0];
          if (pick) contact = { ...pick, email: to };
        }
      }

      const vars = mergeVars(prospect, contact, campaign);
      const label = prospect?.club_name ? ` ${prospect.club_name}` : "";

      const html = applyTracking(renderMerge(campaign.body_html, vars), new Map(), "", false);
      let info: any = null;
      try {
        try {
          await smtp.transporter.verify();
          console.log("outreach-send SMTP verify ok", { host: s.platform_smtp_host, port: s.platform_smtp_port });
        } catch (ve) {
          const vmsg = (ve as Error)?.message || String(ve);
          console.error("outreach-send SMTP verify failed", vmsg);
          return json({ error: `SMTP connection failed: ${vmsg}` }, 502);
        }
        info = await smtp.transporter.sendMail({
          from: smtp.from,
          to,
          replyTo: s.platform_smtp_user || undefined,
          subject: `[TEST${label}] ${renderMerge(campaign.subject, vars)}`,
          html,
          text: stripHtml(html),
        });
        console.log("outreach-send test accepted by SMTP", {
          to,
          from: smtp.from,
          messageId: info?.messageId,
          accepted: info?.accepted,
          rejected: info?.rejected,
          response: info?.response,
        });
      } catch (e) {
        const msg = (e as Error)?.message || String(e);
        console.error("outreach-send test SMTP failure", msg);
        return json({ error: `SMTP send failed: ${msg}` }, 502);
      }
      if (info?.rejected?.length) {
        return json({ error: `Server rejected recipient: ${info.rejected.join(", ")} — ${info?.response ?? ""}` }, 502);
      }
      return json({
        ok: true,
        sent_to: to,
        smtp_response: info?.response ?? null,
        message_id: info?.messageId ?? null,
        accepted: info?.accepted ?? [],
      });
    }

    if (action === "run") {
      await admin.from("outreach_campaigns").update({ status: "sending" }).eq("id", campaignId);
      const res = await runCampaign(campaignId);
      return json({ ok: true, ...res });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("outreach-send failed", err);
    return json({ error: (err as Error)?.message || String(err) }, 500);
  }
});

async function makeTransport(s: Record<string, string>) {
  if (!s.platform_smtp_host || !s.platform_smtp_user || !s.platform_smtp_pass || !s.platform_sender_email) {
    return { error: "Platform SMTP is not configured. Set it in Super Admin → Settings." } as const;
  }
  const port = Number(s.platform_smtp_port) || 587;
  if (!ALLOWED_SMTP_PORTS.has(port)) {
    return { error: `SMTP port ${port} is not allowed` } as const;
  }
  const nodemailer = await import("npm:nodemailer@6.9.14");
  const transporter = nodemailer.default.createTransport({
    host: s.platform_smtp_host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user: s.platform_smtp_user, pass: s.platform_smtp_pass },
  });
  const from = `${s.platform_sender_name || "SquashHub"} <${s.platform_sender_email}>`;
  return { transporter, from } as const;
}

async function runCampaign(campaignId: string) {
  const { data: campaign } = await admin
    .from("outreach_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (!campaign) return { sent: 0, failed: 0, remaining: 0, error: "not found" };

  const cap = Math.max(1, Math.min(500, Number(campaign.daily_cap) || 30));
  const delay = Math.max(0, Math.min(30000, Number(campaign.send_delay_ms) || 4000));

  // Respect the daily cap across today's sends.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await admin
    .from("outreach_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("send_status", "sent")
    .gte("sent_at", startOfDay.toISOString());

  const budget = cap - (sentToday ?? 0);
  if (budget <= 0) return { sent: 0, failed: 0, remaining: -1, capped: true };

  const { data: queued } = await admin
    .from("outreach_recipients")
    .select("id,contact_id,prospect_id,email")
    .eq("campaign_id", campaignId)
    .eq("send_status", "queued")
    .limit(budget);

  if (!queued?.length) {
    await admin.from("outreach_campaigns")
      .update({ status: "sent", last_run_at: new Date().toISOString() }).eq("id", campaignId);
    return { sent: 0, failed: 0, remaining: 0, done: true };
  }

  const s = await getSettings();
  const smtp = await makeTransport(s);
  if ("error" in smtp) throw new Error(smtp.error);

  const linkMap = await buildLinkMap(
    campaignId,
    String(campaign.body_html || "").replace(/{{\s*video_block\s*}}/g, videoBlock(campaign)),
  );


  const prospectIds = [...new Set(queued.map((r: any) => r.prospect_id))];
  const contactIds = queued.map((r: any) => r.contact_id);
  const [{ data: prospects }, { data: contacts }] = await Promise.all([
    admin.from("outreach_prospects").select("id,club_name,association,city,country,club_subdomain").in("id", prospectIds),
    admin.from("outreach_contacts").select("id,name,role,email,opted_out,bounced").in("id", contactIds),
  ]);
  const pMap = new Map((prospects ?? []).map((p: any) => [p.id, p]));
  const cMap = new Map((contacts ?? []).map((c: any) => [c.id, c]));

  let sent = 0, failed = 0, skipped = 0;
  // Stay well inside the gateway's request ceiling: stop the batch after ~100s
  // and report what's left so the caller can run again (the UI keeps polling).
  const deadline = Date.now() + 100_000;
  let timedOut = false;
  for (const r of queued as any[]) {
    if (Date.now() > deadline) { timedOut = true; break; }
    const contact = cMap.get(r.contact_id);
    if (!contact || contact.opted_out || contact.bounced) {
      await admin.from("outreach_recipients")
        .update({ send_status: "skipped", error_message: "Opted out or bounced" }).eq("id", r.id);
      skipped++;
      continue;
    }
    const vars = mergeVars(pMap.get(r.prospect_id), contact, campaign);
    const html = applyTracking(renderMerge(campaign.body_html || "", vars), linkMap, r.id, true);
    const subject = renderMerge(campaign.subject || "", vars);

    try {
      await smtp.transporter.sendMail({
        from: smtp.from,
        to: contact.email,
        subject,
        html,
        text: stripHtml(html),
        headers: {
          "List-Unsubscribe": `<${TRACK_BASE}/u?r=${r.id}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      const now = new Date().toISOString();
      await admin.from("outreach_recipients")
        .update({ send_status: "sent", sent_at: now, error_message: null }).eq("id", r.id);
      await admin.from("outreach_prospects")
        .update({ status: "contacted", last_contacted_at: now })
        .eq("id", r.prospect_id).eq("status", "new");
      await admin.from("outreach_events").insert({
        recipient_id: r.id, campaign_id: campaignId, contact_id: r.contact_id, event_type: "sent",
      });
      sent++;
    } catch (err) {
      const msg = String((err as Error)?.message || err).slice(0, 500);
      const isBounce = /550|551|553|invalid recipient|no such user|does not exist|mailbox unavailable/i.test(msg);
      await admin.from("outreach_recipients").update({
        send_status: isBounce ? "bounced" : "failed",
        error_message: msg,
      }).eq("id", r.id);
      if (isBounce) {
        await admin.from("outreach_contacts").update({ bounced: true }).eq("id", r.contact_id);
        await admin.from("outreach_prospects").update({ status: "bounced" }).eq("id", r.prospect_id);
      }
      await admin.from("outreach_events").insert({
        recipient_id: r.id, campaign_id: campaignId, contact_id: r.contact_id,
        event_type: isBounce ? "bounce" : "send_failed", url: null,
      });
      failed++;
    }
    if (delay) await new Promise((res) => setTimeout(res, delay));
  }

  const { count: remaining } = await admin
    .from("outreach_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("send_status", "queued");

  await admin.from("outreach_campaigns").update({
    status: (remaining ?? 0) > 0 ? "sending" : "sent",
    last_run_at: new Date().toISOString(),
  }).eq("id", campaignId);

  return { sent, failed, skipped, remaining: remaining ?? 0 };
}
