// deno-lint-ignore-file no-explicit-any
// Public tracking endpoint for outreach campaigns.
// GET /outreach-track/open?r=<recipientId>   -> 1x1 pixel, logs an open
// GET /outreach-track/click?r=<rid>&l=<lid>  -> 302 to target, logs a click
// GET /outreach-track/u?r=<rid>              -> unsubscribe confirmation page
// POST /outreach-track/u  { r }              -> performs the opt-out
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const PIXEL = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33,
  249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pixelResponse() {
  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
    },
  });
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function page(title: string, body: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;background:#0E1F35;color:#E8EEF6;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
.card{max-width:460px;width:100%;background:#15294191;border:1px solid #274468;border-radius:14px;padding:28px}
h1{font-size:20px;margin:0 0 10px}p{font-size:14px;line-height:1.6;color:#B7C6DA;margin:0 0 18px}
button{background:#E8B44A;color:#10233C;border:0;border-radius:9px;padding:11px 18px;font-size:14px;font-weight:600;cursor:pointer}
small{color:#7D91AB;font-size:12px}
</style></head><body><div class="card">${body}</div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function logEvent(rec: any, type: string, url: string | null, ua: string | null) {
  await admin.from("outreach_events").insert({
    recipient_id: rec.id,
    campaign_id: rec.campaign_id,
    contact_id: rec.contact_id,
    event_type: type,
    url,
    user_agent: ua ? ua.slice(0, 400) : null,
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const seg = url.pathname.split("/").filter(Boolean);
  const action = seg[seg.length - 1] || "";
  const rid = url.searchParams.get("r") || "";
  const ua = req.headers.get("user-agent");

  if (!UUID_RE.test(rid)) {
    return action === "open" ? pixelResponse() : page("Not found", "<h1>Link not found</h1>");
  }

  const { data: rec } = await admin
    .from("outreach_recipients")
    .select("id,campaign_id,contact_id,prospect_id,open_count,click_count,first_opened_at,first_clicked_at")
    .eq("id", rid)
    .maybeSingle();

  if (!rec) {
    return action === "open" ? pixelResponse() : page("Not found", "<h1>Link not found</h1>");
  }

  // ---- open pixel ----
  if (action === "open") {
    const now = new Date().toISOString();
    await admin.from("outreach_recipients").update({
      first_opened_at: rec.first_opened_at ?? now,
      last_opened_at: now,
      open_count: (rec.open_count ?? 0) + 1,
    }).eq("id", rec.id);
    await logEvent(rec, "open", null, ua);
    await admin.from("outreach_prospects")
      .update({ status: "opened" })
      .eq("id", rec.prospect_id)
      .in("status", ["new", "contacted"]);
    return pixelResponse();
  }

  // ---- click redirect ----
  if (action === "click") {
    const lid = url.searchParams.get("l") || "";
    if (!UUID_RE.test(lid)) return page("Not found", "<h1>Link not found</h1>");
    const { data: link } = await admin
      .from("outreach_links").select("target_url").eq("id", lid).maybeSingle();
    if (!link?.target_url) return page("Not found", "<h1>Link not found</h1>");

    const now = new Date().toISOString();
    await admin.from("outreach_recipients").update({
      first_clicked_at: rec.first_clicked_at ?? now,
      click_count: (rec.click_count ?? 0) + 1,
    }).eq("id", rec.id);
    await logEvent(rec, "click", link.target_url, ua);
    await admin.from("outreach_prospects")
      .update({ status: "clicked" })
      .eq("id", rec.prospect_id)
      .in("status", ["new", "contacted", "opened"]);

    return new Response(null, { status: 302, headers: { Location: link.target_url } });
  }

  // ---- unsubscribe ----
  if (action === "u") {
    if (req.method === "POST") {
      await admin.from("outreach_contacts").update({ opted_out: true }).eq("id", rec.contact_id);
      await admin.from("outreach_recipients")
        .update({ unsubscribed_at: new Date().toISOString() }).eq("id", rec.id);
      await admin.from("outreach_prospects")
        .update({ status: "unsubscribed" }).eq("id", rec.prospect_id);
      await logEvent(rec, "unsubscribe", null, ua);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: contact } = await admin
      .from("outreach_contacts").select("opted_out,email").eq("id", rec.contact_id).maybeSingle();

    if (contact?.opted_out) {
      return page("Unsubscribed", `<h1>You're unsubscribed</h1>
<p>${escapeHtml(contact.email)} will not receive any further emails from SquashHub.</p>
<small>SquashHub — HKFT Services</small>`);
    }

    return page("Unsubscribe", `<h1>Unsubscribe from SquashHub</h1>
<p>Click below and we will not contact ${escapeHtml(contact?.email ?? "this address")} again.</p>
<button id="go">Unsubscribe me</button>
<p id="done" style="display:none;margin-top:16px">Done — you have been removed from our list.</p>
<script>
document.getElementById('go').addEventListener('click', async function(){
  this.disabled = true; this.textContent = 'Working…';
  await fetch(window.location.href, { method: 'POST' });
  this.style.display='none';
  document.getElementById('done').style.display='block';
});
</script>`);
  }

  return page("Not found", "<h1>Link not found</h1>");
});
