// Network-agnostic router / internet monitoring poller.
//
// Actions:
//   { action: "poll", clubId }      – poll one club (admin or cron)
//   { action: "poll_all" }          – poll every enabled club that is due (cron)
//   { action: "test", clubId }      – poll without persisting alerts
//
// New router APIs are added in drivers.ts only.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getDriver, DRIVERS, type RouterReading } from "./drivers.ts";
import { clubHasCapability } from "../_shared/capabilities.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MB = 1024 * 1024;

type Admin = any;

async function pollClub(admin: Admin, clubId: string, opts: { persistAlerts: boolean }) {
  // Member Wi-Fi / internet monitoring switched off for this club → do nothing.
  if (!(await clubHasCapability(admin, clubId, "wifi"))) {
    throw new Error("Member Wi-Fi & internet monitoring is switched off for this club");
  }
  const [{ data: config }, { data: secrets }, { data: bundle }] = await Promise.all([
    admin.from("club_router_configs").select("*").eq("club_id", clubId).maybeSingle(),
    admin
      .from("club_secrets")
      .select("router_username, router_password, router_api_token")
      .eq("club_id", clubId)
      .maybeSingle(),
    admin
      .from("club_data_bundles")
      .select("*")
      .eq("club_id", clubId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (!config) throw new Error("No router configuration for this club");
  const cfg = config as {
    host: string;
    port?: number | null;
    use_https?: boolean | null;
    driver: string;
    model?: string | null;
  };
  if (!cfg.host) throw new Error("Router host / IP address is not set");

  const driver = getDriver(cfg.driver);
  let reading: RouterReading | null = null;
  let error: string | null = null;

  const secretsRow = secrets as {
    router_username?: string | null;
    router_password?: string | null;
    router_api_token?: string | null;
  } | null;

  try {
    reading = await driver.poll({
      host: cfg.host,
      port: cfg.port,
      useHttps: !!cfg.use_https,
      username: secretsRow?.router_username ?? null,
      password: secretsRow?.router_password ?? null,
      apiToken: secretsRow?.router_api_token ?? null,
      model: cfg.model,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const totalBytes = reading?.totalBytes ?? null;

  const { data: poll } = await admin
    .from("club_router_polls")
    .insert({
      club_id: clubId,
      bundle_id: bundle?.id ?? null,
      online: reading?.online ?? false,
      signal_strength: reading?.signalStrength ?? null,
      signal_unit: reading?.signalUnit ?? null,
      uptime_seconds: reading?.uptimeSeconds ?? null,
      total_bytes: totalBytes,
      error,
      raw: reading?.raw ?? {},
    })
    .select()
    .maybeSingle();

  // Usage against the active bundle
  let usedBytes = bundle?.used_bytes ?? 0;
  let percentUsed: number | null = null;
  if (bundle && totalBytes !== null) {
    // Counter resets (router reboot) are handled by re-basing the baseline.
    let baseline = Number(bundle.baseline_bytes || 0);
    if (totalBytes < baseline) {
      baseline = 0;
      await admin.from("club_data_bundles").update({ baseline_bytes: 0 }).eq("id", bundle.id);
    }
    usedBytes = Math.max(0, totalBytes - baseline);
    await admin.from("club_data_bundles").update({ used_bytes: usedBytes }).eq("id", bundle.id);
    const sizeBytes = Number(bundle.size_mb || 0) * MB;
    if (sizeBytes > 0) percentUsed = (usedBytes / sizeBytes) * 100;
  }

  await admin
    .from("club_router_configs")
    .update({
      last_polled_at: new Date().toISOString(),
      last_status: {
        online: reading?.online ?? false,
        signal_strength: reading?.signalStrength ?? null,
        uptime_seconds: reading?.uptimeSeconds ?? null,
        total_bytes: totalBytes,
        used_bytes: usedBytes,
        percent_used: percentUsed,
        error,
      },
    })
    .eq("club_id", clubId);

  if (opts.persistAlerts) {
    await maybeAlert(admin, clubId, bundle, percentUsed, reading?.online ?? false, error);
  }

  return { poll, percentUsed, usedBytes, error, online: reading?.online ?? false };
}

async function maybeAlert(
  admin: Admin,
  clubId: string,
  bundle: any,
  percentUsed: number | null,
  online: boolean,
  error: string | null,
) {
  const { data: settings } = await admin
    .from("club_router_alert_settings")
    .select("*")
    .eq("club_id", clubId)
    .maybeSingle();
  const thresholds: number[] = settings?.thresholds ?? [75, 90, 95];
  const notifyEmail = settings?.notify_email ?? true;
  const notifyPush = settings?.notify_push ?? true;
  const notifyOffline = settings?.notify_offline ?? true;

  const channels = [notifyEmail && "email", notifyPush && "push"].filter(Boolean) as string[];
  if (channels.length === 0) return;

  // Offline alert — at most one per 6 hours
  if (notifyOffline && (!online || error)) {
    const since = new Date(Date.now() - 6 * 3600_000).toISOString();
    const { data: recent } = await admin
      .from("club_router_alerts")
      .select("id")
      .eq("club_id", clubId)
      .eq("kind", "offline")
      .gte("sent_at", since)
      .maybeSingle();
    if (!recent) {
      const message = error
        ? `The club router could not be reached: ${error}`
        : "The club internet connection appears to be offline.";
      await admin.from("club_router_alerts").insert({
        club_id: clubId,
        bundle_id: bundle?.id ?? null,
        kind: "offline",
        message,
        channels,
      });
      await deliver(admin, clubId, "Club internet offline", message, channels);
    }
  }

  if (!bundle || percentUsed === null) return;

  const crossed = thresholds
    .filter((t: number) => percentUsed >= t)
    .sort((a: number, b: number) => b - a);
  if (crossed.length === 0) return;
  const top = crossed[0];

  const { data: already } = await admin
    .from("club_router_alerts")
    .select("threshold")
    .eq("bundle_id", bundle.id)
    .eq("kind", "usage");
  const done = new Set((already ?? []).map((r: any) => r.threshold));
  if (done.has(top)) return;

  const remainingMb = Math.max(0, Number(bundle.size_mb) - Number(bundle.used_bytes || 0) / MB);
  const message = `Data bundle is ${percentUsed.toFixed(1)}% used (${remainingMb.toFixed(0)} MB of ${Number(
    bundle.size_mb,
  ).toFixed(0)} MB remaining).`;

  await admin.from("club_router_alerts").insert({
    club_id: clubId,
    bundle_id: bundle.id,
    kind: "usage",
    threshold: top,
    message,
    channels,
  });
  await deliver(admin, clubId, `Data bundle ${top}% used`, message, channels);
}

async function deliver(
  admin: Admin,
  clubId: string,
  title: string,
  message: string,
  channels: string[],
) {
  const { data: settings } = await admin
    .from("club_router_alert_settings")
    .select("recipients")
    .eq("club_id", clubId)
    .maybeSingle();

  const { data: admins } = await admin
    .from("club_members")
    .select("id, user_id, email, name")
    .eq("club_id", clubId)
    .eq("role", "admin");

  if (channels.includes("push")) {
    const rows = (admins ?? [])
      .filter((m: any) => m.user_id)
      .map((m: any) => ({
        user_id: m.user_id,
        club_member_id: m.id,
        title,
        message,
        type: "router",
        url: "/club-admin?tab=router",
      }));
    if (rows.length) await admin.from("notifications").insert(rows);
  }

  if (channels.includes("email")) {
    const emails = new Set<string>();
    for (const m of admins ?? []) if (m.email) emails.add(m.email);
    for (const r of settings?.recipients ?? []) if (r) emails.add(r);
    for (const to of emails) {
      await admin.functions
        .invoke("send-transactional-email", {
          body: {
            clubId,
            to,
            subject: title,
            html: `<p>${message}</p><p>— SquashHub internet monitoring</p>`,
            text: message,
          },
        })
        .catch((e: unknown) => console.error("email failed", e));
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "poll";
    const admin: Admin = createClient(SUPABASE_URL, SERVICE_KEY);

    if (action === "drivers") {
      return json({ drivers: Object.values(DRIVERS).map((d) => ({ id: d.id, label: d.label })) });
    }

    if (action === "poll_all") {
      const { data: configs } = await admin
        .from("club_router_configs")
        .select("club_id, poll_interval_minutes, last_polled_at")
        .eq("enabled", true);
      const now = Date.now();
      const results: Record<string, string> = {};
      for (const c of (configs as any[]) ?? []) {
        const due =
          !c.last_polled_at ||
          now - new Date(c.last_polled_at).getTime() >= (c.poll_interval_minutes || 15) * 60_000;
        if (!due) continue;
        if (!(await clubHasCapability(admin, c.club_id, "wifi"))) {
          results[c.club_id] = "skipped: wifi capability off";
          continue;
        }
        try {
          await pollClub(admin, c.club_id, { persistAlerts: true });
          results[c.club_id] = "ok";
        } catch (e) {
          results[c.club_id] = e instanceof Error ? e.message : String(e);
        }
      }
      return json({ ok: true, results });
    }

    const clubId: string | undefined = body.clubId;
    if (!clubId) return json({ error: "clubId required" }, 400);

    // Authorise the caller for single-club polls
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes } = await userClient.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return json({ error: "Unauthorised" }, 401);
      const { data: allowed } = await admin.rpc("is_club_admin", { _user_id: uid, _club_id: clubId });
      if (!allowed) return json({ error: "Club admins only" }, 403);
    }

    const result = await pollClub(admin, clubId, { persistAlerts: action !== "test" });
    return json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("router-poll error", msg);
    return json({ error: msg }, 500);
  }
});
