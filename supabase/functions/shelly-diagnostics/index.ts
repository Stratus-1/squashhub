import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_SERVER = "https://shelly-44-eu.shelly.cloud";

function normalizeServer(value?: string | null) {
  const raw = (value || DEFAULT_SERVER).trim();
  const m = raw.match(/https?:\/\/[^\s]+/i);
  const extracted = (m?.[0] || raw).replace(/\/+$/, "");
  return /^https?:\/\//i.test(extracted) ? extracted : DEFAULT_SERVER;
}

async function deviceStatus(server: string, authKey: string, ids: string[]) {
  const res = await fetch(
    `${normalizeServer(server)}/v2/devices/api/get?auth_key=${encodeURIComponent(authKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, select: ["status"] }),
    },
  );
  const raw = (await res.text()).slice(0, 4000);
  try {
    return { httpStatus: res.status, devices: JSON.parse(raw) };
  } catch {
    return { httpStatus: res.status, devices: null, raw };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id ?? null;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { club_id } = (await req.json().catch(() => ({}))) as { club_id?: string };
    if (!club_id) {
      return new Response(JSON.stringify({ error: "Missing club_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Only club admins may run hardware diagnostics.
    const { data: member } = await admin
      .from("club_members")
      .select("id, role")
      .eq("club_id", club_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member || member.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("shelly_auth_key, shelly_server_url, shelly_door_device_id, shelly_door_channel")
      .eq("club_id", club_id)
      .maybeSingle();
    if (!secrets?.shelly_auth_key) throw new Error("Shelly auth key not configured");

    const { data: courts } = await admin
      .from("courts")
      .select("name, relay_device_id, relay_server, relay_channel")
      .eq("club_id", club_id);

    const targets = new Map<string, { server: string; labels: string[] }>();
    if (secrets.shelly_door_device_id) {
      targets.set(secrets.shelly_door_device_id, {
        server: secrets.shelly_server_url || DEFAULT_SERVER,
        labels: [`Door (channel ${secrets.shelly_door_channel ?? 0})`],
      });
    }
    for (const c of courts ?? []) {
      if (!c.relay_device_id) continue;
      const existing = targets.get(c.relay_device_id);
      const label = `${c.name} lights (channel ${c.relay_channel ?? 0})`;
      if (existing) existing.labels.push(label);
      else
        targets.set(c.relay_device_id, {
          server: c.relay_server || secrets.shelly_server_url || DEFAULT_SERVER,
          labels: [label],
        });
    }

    const byServer = new Map<string, string[]>();
    for (const [id, t] of targets) {
      const s = normalizeServer(t.server);
      byServer.set(s, [...(byServer.get(s) ?? []), id]);
    }

    const results: any[] = [];
    for (const [server, ids] of byServer) {
      const status = await deviceStatus(server, secrets.shelly_auth_key, ids);
      const list = Array.isArray(status.devices) ? status.devices : [];
      for (const id of ids) {
        const dev = list.find((d: any) => d?.id === id) ?? null;
        results.push({
          device_id: id,
          used_for: targets.get(id)?.labels ?? [],
          server,
          online: dev ? dev.online === 1 : null,
          model: dev?.code ?? null,
          gen: dev?.gen ?? null,
          switch_status: dev?.status ?? null,
          http_status: status.httpStatus,
        });
      }
      // Shelly Cloud allows ~1 request/second.
      await new Promise((r) => setTimeout(r, 1100));
    }

    const offline = results.filter((r) => r.online === false).map((r) => r.device_id);
    return new Response(
      JSON.stringify({
        ok: offline.length === 0,
        checked_at: new Date().toISOString(),
        offline_devices: offline,
        devices: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
