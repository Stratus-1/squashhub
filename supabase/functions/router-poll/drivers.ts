// Network-agnostic router driver registry.
// Add a new router API by implementing RouterDriver and registering it below.

export interface RouterReading {
  online: boolean;
  signalStrength?: number | null;
  signalUnit?: string | null;
  uptimeSeconds?: number | null;
  totalBytes?: number | null;
  raw?: Record<string, unknown>;
}

export interface RouterTarget {
  host: string;
  port?: number | null;
  useHttps: boolean;
  username?: string | null;
  password?: string | null;
  apiToken?: string | null;
  model?: string | null;
}

export interface RouterDriver {
  id: string;
  label: string;
  poll(target: RouterTarget): Promise<RouterReading>;
}

export function baseUrl(t: RouterTarget) {
  const scheme = t.useHttps ? "https" : "http";
  const host = (t.host || "").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return t.port ? `${scheme}://${host}:${t.port}` : `${scheme}://${host}`;
}

async function timedFetch(url: string, init: RequestInit = {}, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Number(n) : null;
}

function pick(obj: Record<string, any>, keys: string[]): unknown {
  for (const k of keys) {
    const parts = k.split(".");
    let cur: any = obj;
    for (const p of parts) cur = cur?.[p];
    if (cur !== undefined && cur !== null) return cur;
  }
  return undefined;
}

/**
 * Generic JSON driver — works with any router/agent that exposes a JSON
 * endpoint. It looks for common field names for status, signal, uptime and
 * total bytes so most vendor APIs and custom agents work without new code.
 */
const genericHttp: RouterDriver = {
  id: "generic_http",
  label: "Generic HTTP/JSON endpoint",
  async poll(t) {
    const url = /^https?:\/\//i.test(t.host) ? t.host : `${baseUrl(t)}/status`;
    const headers: Record<string, string> = { accept: "application/json" };
    if (t.apiToken) headers["authorization"] = `Bearer ${t.apiToken}`;
    else if (t.username) {
      headers["authorization"] = `Basic ${btoa(`${t.username}:${t.password ?? ""}`)}`;
    }
    const res = await timedFetch(url, { headers });
    const text = await res.text();
    if (!res.ok) throw new Error(`Router responded ${res.status}: ${text.slice(0, 200)}`);
    let data: Record<string, any>;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Router did not return JSON");
    }
    const rx = num(pick(data, ["rx_bytes", "bytes_received", "download_bytes", "rx", "data.rx_bytes"])) ?? 0;
    const tx = num(pick(data, ["tx_bytes", "bytes_sent", "upload_bytes", "tx", "data.tx_bytes"])) ?? 0;
    const total =
      num(pick(data, ["total_bytes", "data_used_bytes", "usage_bytes", "data.total_bytes"])) ??
      (rx || tx ? rx + tx : null);
    const online = Boolean(
      pick(data, ["online", "connected", "wan_connected", "data.online"]) ?? true,
    );
    return {
      online,
      signalStrength: num(pick(data, ["signal", "rssi", "signal_strength", "data.rssi"])),
      signalUnit: (pick(data, ["signal_unit"]) as string) ?? "dBm",
      uptimeSeconds: num(pick(data, ["uptime", "uptime_seconds", "data.uptime"])),
      totalBytes: total,
      raw: data,
    };
  },
};

/** MikroTik RouterOS REST API (v7+) */
const mikrotik: RouterDriver = {
  id: "mikrotik_rest",
  label: "MikroTik RouterOS REST",
  async poll(t) {
    const auth = `Basic ${btoa(`${t.username ?? ""}:${t.password ?? ""}`)}`;
    const headers = { authorization: auth, accept: "application/json" };
    const [resRes, ifRes] = await Promise.all([
      timedFetch(`${baseUrl(t)}/rest/system/resource`, { headers }),
      timedFetch(`${baseUrl(t)}/rest/interface`, { headers }),
    ]);
    if (!resRes.ok) throw new Error(`RouterOS responded ${resRes.status}`);
    const resource = await resRes.json();
    const ifaces = ifRes.ok ? await ifRes.json() : [];
    let bytes = 0;
    for (const i of Array.isArray(ifaces) ? ifaces : []) {
      if (i?.running === "true" || i?.running === true) {
        bytes += (num(i["rx-byte"]) ?? 0) + (num(i["tx-byte"]) ?? 0);
      }
    }
    const uptime = String(resource?.uptime ?? "");
    const m = uptime.match(/(?:(\d+)w)?(?:(\d+)d)?(?:(\d+):(\d+):(\d+))?/);
    const seconds = m
      ? (+(m[1] || 0)) * 604800 + (+(m[2] || 0)) * 86400 + (+(m[3] || 0)) * 3600 + (+(m[4] || 0)) * 60 + (+(m[5] || 0))
      : null;
    return {
      online: true,
      signalStrength: null,
      signalUnit: "dBm",
      uptimeSeconds: seconds,
      totalBytes: bytes || null,
      raw: { resource },
    };
  },
};

/** Huawei HiLink LTE routers (B535/B818 etc.) — open XML API */
const huaweiHilink: RouterDriver = {
  id: "huawei_hilink",
  label: "Huawei HiLink (LTE)",
  async poll(t) {
    const root = baseUrl(t);
    const get = async (path: string) => {
      const r = await timedFetch(`${root}${path}`, { headers: { accept: "application/xml" } });
      if (!r.ok) throw new Error(`Huawei responded ${r.status} on ${path}`);
      return await r.text();
    };
    const tag = (xml: string, name: string) => {
      const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`, "i"));
      return m ? m[1] : null;
    };
    const [status, traffic, signal] = await Promise.all([
      get("/api/monitoring/status"),
      get("/api/monitoring/traffic-statistics"),
      get("/api/device/signal").catch(() => ""),
    ]);
    const connStatus = num(tag(status, "ConnectionStatus"));
    return {
      online: connStatus === 901,
      signalStrength: num((tag(signal, "rsrp") || "").replace(/dBm/i, "")),
      signalUnit: "dBm",
      uptimeSeconds: num(tag(traffic, "CurrentConnectTime")),
      totalBytes:
        (num(tag(traffic, "TotalDownload")) ?? 0) + (num(tag(traffic, "TotalUpload")) ?? 0) || null,
      raw: { connStatus },
    };
  },
};

/** TP-Link / GL.iNet style token endpoint (LuCI-compatible JSON RPC) */
const glinet: RouterDriver = {
  id: "glinet_luci",
  label: "GL.iNet / OpenWrt (LuCI RPC)",
  async poll(t) {
    const root = baseUrl(t);
    const login = await timedFetch(`${root}/cgi-bin/luci/rpc/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1, method: "login", params: [t.username ?? "root", t.password ?? ""] }),
    });
    const loginJson = await login.json().catch(() => ({}));
    const token = loginJson?.result;
    if (!token) throw new Error("OpenWrt login failed — check username and password");
    const call = async (method: string, params: unknown[]) => {
      const r = await timedFetch(`${root}/cgi-bin/luci/rpc/sys?auth=${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: 1, method, params }),
      });
      return (await r.json())?.result;
    };
    const uptime = num(await call("uptime", []));
    const netdev = await call("net.deviceinfo", []);
    let bytes = 0;
    if (netdev && typeof netdev === "object") {
      for (const [name, stats] of Object.entries<any>(netdev)) {
        if (name === "lo") continue;
        bytes += (num(stats?.[0]) ?? 0) + (num(stats?.[8]) ?? 0);
      }
    }
    return {
      online: true,
      signalStrength: null,
      signalUnit: "dBm",
      uptimeSeconds: uptime,
      totalBytes: bytes || null,
      raw: {},
    };
  },
};

export const DRIVERS: Record<string, RouterDriver> = {
  [genericHttp.id]: genericHttp,
  [mikrotik.id]: mikrotik,
  [huaweiHilink.id]: huaweiHilink,
  [glinet.id]: glinet,
};

export function getDriver(id?: string | null): RouterDriver {
  return DRIVERS[id || "generic_http"] || genericHttp;
}
