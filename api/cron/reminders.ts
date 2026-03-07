import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const isVercelCron = req.headers["x-vercel-cron"] === "1";
  const cronToken = (process.env.CRON_TOKEN || "").trim();
  const providedToken =
    (typeof req.query.token === "string" ? req.query.token : "") ||
    (typeof req.headers["x-cron-token"] === "string" ? req.headers["x-cron-token"] : "");

  if (!isVercelCron && cronToken && providedToken !== cronToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const internalSecret = (process.env.REMINDERS_INTERNAL_SECRET || "").trim();

  if (!supabaseUrl) {
    res.status(500).json({ error: "Missing SUPABASE_URL (or VITE_SUPABASE_URL)" });
    return;
  }
  if (!internalSecret) {
    res.status(500).json({ error: "Missing REMINDERS_INTERNAL_SECRET" });
    return;
  }

  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/reminders`, {
      method: "POST",
      headers: {
        "x-internal-secret": internalSecret,
      },
    });

    const text = await r.text();
    res.status(r.status);
    res.setHeader("content-type", r.headers.get("content-type") || "application/json");
    res.setHeader("cache-control", "no-store");
    res.send(text);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to call reminders function" });
  }
}

