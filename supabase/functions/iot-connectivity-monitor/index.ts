// IoT connectivity-loss alerts (club-scoped, generic).
//
// Reuses the same Shelly Cloud online flag that shelly-diagnostics / device-control read
// (`/v2/devices/api/get` → `online: 0|1`). Never switches anything — read-only status checks.
//
// Actions:
//   { action: "poll_all" }                 – cron: check every club with alerts enabled
//   { action: "test_email", club_id }      – club admin: send a test alert to the selected recipients
//
// State per device lives in club_iot_device_health:
//   online → offline seen: offline_since = now (no email yet)
//   still offline after grace_minutes and no alert_sent_at → ONE offline email, alert_sent_at = now
//   back online: if an alert was sent → ONE recovery email with downtime; state cleared
//   unknown status (Shelly Cloud unreachable / no answer) → state untouched, never alerts
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DEFAULT_SERVER = "https://shelly-44-eu.shelly.cloud";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function normalizeServer(value?: string | null) {
  const raw = (value || DEFAULT_SERVER).trim();
  const m = raw.match(/https?:\/\/[^\s]+/i);
  const extracted = (m?.[0] || raw).replace(/\/+$/, "");
  return /^https?:\/\//i.test(extracted) ? extracted : DEFAULT_SERVER;
}
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function onlineMap(server: string, authKey: string, ids: string[]): Promise<Map<string, boolean | null>> {
  const out = new Map<string, boolean | null>(ids.map((i) => [i, null]));
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10_000);
    const res = await fetch(`${normalizeServer(server)}/v2/devices/api/get?auth_key=${encodeURIComponent(authKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, select: ["status"] }), signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return out;
    const list = await res.json();
    if (!Array.isArray(list)) return out;
    for (const d of list) if (d?.id && (d.online === 0 || d.online === 1)) out.set(d.id, d.online === 1);
  } catch { /* unknown → no change */ }
  return out;
}

type Target = { id: string; server: string; labels: string[] };

async function targetsFor(admin: any, clubId: string, secrets: any): Promise<Target[]> {
  const map = new Map<string, Target>();
  const add = (id: string | null | undefined, server: string | null | undefined, label: string) => {
    if (!id) return;
    const t = map.get(id);
    if (t) { if (!t.labels.includes(label)) t.labels.push(label); return; }
    map.set(id, { id, server: server || secrets.shelly_server_url || DEFAULT_SERVER, labels: [label] });
  };
  add(secrets.shelly_door_device_id, secrets.shelly_server_url, "Door controller");
  const [{ data: courts }, { data: devices }] = await Promise.all([
    admin.from("courts").select("name, relay_device_id, relay_server").eq("club_id", clubId),
    admin.from("club_devices").select("name, shelly_device_id, provider, enabled").eq("club_id", clubId).eq("provider", "shelly").eq("enabled", true),
  ]);
  for (const c of courts ?? []) add(c.relay_device_id, c.relay_server, `${c.name} lights`);
  for (const d of devices ?? []) add(d.shelly_device_id, null, d.name);
  return [...map.values()];
}

async function sendMail(admin: any, clubId: string, recipients: string[], subject: string, html: string) {
  const [{ data: s }, { data: club }] = await Promise.all([
    admin.from("club_secrets").select("smtp_host,smtp_port,smtp_user,smtp_pass,sender_name,sender_email").eq("club_id", clubId).maybeSingle(),
    admin.from("clubs").select("name").eq("id", clubId).maybeSingle(),
  ]);
  if (!(s?.smtp_host && s?.smtp_user && s?.smtp_pass && s?.sender_email)) throw new Error("Club email (SMTP) settings are not configured");
  const nodemailer = await import("npm:nodemailer@6.9.14");
  const port = Number(s.smtp_port) || 587;
  const tx = nodemailer.default.createTransport({ host: s.smtp_host, port, secure: port === 465, requireTLS: port === 587, auth: { user: s.smtp_user, pass: s.smtp_pass } });
  let sent = 0;
  for (const to of recipients) {
    try {
      await tx.sendMail({ from: `${s.sender_name || club?.name || "Club"} <${s.sender_email}>`, to, subject, html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
      sent++;
    } catch (e) { console.error("iot alert send failed", (e as Error).message); }
  }
  return sent;
}

async function recipientsFor(admin: any, clubId: string, ids: string[]) {
  if (!ids?.length) return [] as string[];
  const { data } = await admin.from("club_members").select("email").eq("club_id", clubId).in("id", ids.slice(0, 2));
  return [...new Set((data ?? []).map((m: any) => String(m.email || "").trim()).filter((e: string) => e.includes("@")))] as string[];
}

const fmt = (iso: string, tz: string) => new Date(iso).toLocaleString("en-ZA", { timeZone: tz, dateStyle: "medium", timeStyle: "short" });
const dur = (ms: number) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

async function checkClub(admin: any, clubId: string, cfg: any) {
  const { data: secrets } = await admin.from("club_secrets").select("shelly_auth_key, shelly_server_url, shelly_door_device_id").eq("club_id", clubId).maybeSingle();
  if (!secrets?.shelly_auth_key) return { clubId, skipped: "no Shelly key" };
  const targets = await targetsFor(admin, clubId, secrets);
  if (!targets.length) return { clubId, skipped: "no devices" };
  const { data: club } = await admin.from("clubs").select("name").eq("id", clubId).maybeSingle();
  const tz = "Africa/Johannesburg";
  const clubName = club?.name || "your club";

  const status = new Map<string, boolean | null>();
  const byServer = new Map<string, string[]>();
  for (const t of targets) { const s = normalizeServer(t.server); byServer.set(s, [...(byServer.get(s) ?? []), t.id]); }
  for (const [server, ids] of byServer) {
    (await onlineMap(server, secrets.shelly_auth_key, ids)).forEach((v, k) => status.set(k, v));
    await new Promise((r) => setTimeout(r, 1100)); // Shelly Cloud ~1 req/s
  }

  const { data: rows } = await admin.from("club_iot_device_health").select("*").eq("club_id", clubId);
  const prev = new Map<string, any>((rows ?? []).map((r: any) => [r.device_id, r]));
  const now = new Date();
  const nowIso = now.toISOString();
  const graceMs = (cfg.grace_minutes || 5) * 60_000;
  const toAlert: { t: Target; since: string }[] = [];
  const recovered: { t: Target; since: string }[] = [];
  const upserts: any[] = [];

  for (const t of targets) {
    const online = status.get(t.id) ?? null;
    const p = prev.get(t.id) ?? {};
    const row: any = { club_id: clubId, device_id: t.id, label: t.labels.join(", "), last_checked_at: nowIso,
      online: p.online ?? null, last_online_at: p.last_online_at ?? null, offline_since: p.offline_since ?? null, alert_sent_at: p.alert_sent_at ?? null };
    if (online === true) {
      if (row.alert_sent_at && row.offline_since) recovered.push({ t, since: row.offline_since });
      Object.assign(row, { online: true, last_online_at: nowIso, offline_since: null, alert_sent_at: null });
    } else if (online === false) {
      row.online = false;
      if (!row.offline_since) row.offline_since = nowIso;
      else if (!row.alert_sent_at && now.getTime() - new Date(row.offline_since).getTime() >= graceMs) {
        toAlert.push({ t, since: row.offline_since });
        row.alert_sent_at = nowIso;
      }
    }
    upserts.push(row);
  }

  const recipients = await recipientsFor(admin, clubId, cfg.recipient_member_ids);
  let mails = 0;
  if (recipients.length && toAlert.length) {
    const items = toAlert.map(({ t, since }) => `<li><b>${esc(t.labels.join(", "))}</b> (device ${esc(t.id)}) — offline since ${esc(fmt(since, tz))}</li>`).join("");
    mails += await sendMail(admin, clubId, recipients, `⚠ ${clubName}: IoT device connectivity lost`,
      `<p><b>${esc(clubName)}</b> — SquashHub has lost connection to the following installed device${toAlert.length > 1 ? "s" : ""}:</p><ul>${items}</ul><p>Detected at ${esc(fmt(nowIso, tz))} after staying offline for at least ${cfg.grace_minutes} minutes. Remote door, light and gadget control for ${toAlert.length > 1 ? "these devices" : "this device"} may not work until the device is back on Wi-Fi/internet. Please check power and the club Wi-Fi/router.</p><p>You will receive one further email when the connection is restored.</p>`);
  }
  if (recipients.length && recovered.length) {
    const items = recovered.map(({ t, since }) => `<li><b>${esc(t.labels.join(", "))}</b> (device ${esc(t.id)}) — offline from ${esc(fmt(since, tz))}, restored ${esc(fmt(nowIso, tz))} (down about ${dur(now.getTime() - new Date(since).getTime())})</li>`).join("");
    mails += await sendMail(admin, clubId, recipients, `✅ ${clubName}: IoT device connectivity restored`,
      `<p><b>${esc(clubName)}</b> — connection restored:</p><ul>${items}</ul>`);
  }
  if (upserts.length) await admin.from("club_iot_device_health").upsert(upserts, { onConflict: "club_id,device_id" });
  return { clubId, checked: targets.length, alerts: toAlert.length, recovered: recovered.length, mails };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "poll_all") {
      const { data: cfgs } = await admin.from("club_iot_alert_settings").select("*").eq("enabled", true);
      const results = [];
      for (const cfg of cfgs ?? []) {
        try { results.push(await checkClub(admin, cfg.club_id, cfg)); }
        catch (e) { results.push({ clubId: cfg.club_id, error: (e as Error).message }); }
      }
      return json({ ok: true, results });
    }

    if (action === "test_email") {
      const clubId = String(body?.club_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(clubId)) return json({ error: "Missing club_id" }, 400);
      const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
      const { data: u } = await user.auth.getUser();
      if (!u?.user) return json({ error: "Not authenticated" }, 401);
      const { data: isAdmin } = await admin.rpc("is_club_admin", { _user_id: u.user.id, _club_id: clubId });
      if (!isAdmin) return json({ error: "Admin access required" }, 403);
      const { data: cfg } = await admin.from("club_iot_alert_settings").select("*").eq("club_id", clubId).maybeSingle();
      const recipients = await recipientsFor(admin, clubId, cfg?.recipient_member_ids ?? []);
      if (!recipients.length) return json({ error: "No recipients with an email address selected" }, 400);
      const { data: club } = await admin.from("clubs").select("name").eq("id", clubId).maybeSingle();
      const sent = await sendMail(admin, clubId, recipients, `Test: ${club?.name || "Club"} IoT connectivity alerts`,
        `<p>This is a test. You are set up to receive an email when an installed IoT device at <b>${esc(club?.name)}</b> loses its internet/Wi-Fi connection, and again when it is restored.</p>`);
      return json({ ok: sent > 0, sent });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
