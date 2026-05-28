// GoBook → SquashHub one-way sync.
//
// Pulls bookings from gobook.co.za for all clubs where clubs.uses_gobook = true
// and clubs.booking_slot_minutes = 60 (GoBook is hourly-only), and upserts them
// into public.bookings with source='gobook'. Cancellations on GoBook are
// reflected by deleting rows whose external_id no longer appears in the fresh
// grid for a given date.
//
// Auth modes (POST JSON):
//   1) Cron:    { cron: true, days?: 14 }                    + header X-Cron-Secret = EMAIL_INTERNAL_SECRET
//   2) Manual:  { club_id, days?: 14 }                       + Authorization: Bearer <user-jwt>
//
// Uses an opted-in (is_sync_source=true), verified credential for the club.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const GOBOOK_BASE = "https://www.gobook.co.za";
const SQUASH_SERVICE_ID = "6";
const CSIR_PROVIDER_ID = "234";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- AES-GCM (same scheme as gobook-book) ----------
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("GOBOOK_CRED_KEY");
  if (!raw) throw new Error("GOBOOK_CRED_KEY not configured");
  const keyBytes = b64ToBytes(raw);
  if (keyBytes.length !== 32) {
    throw new Error("GOBOOK_CRED_KEY must be 32 bytes (base64)");
  }
  return await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "decrypt",
  ]);
}
async function decryptPassword(ciphertextB64: string, ivB64: string) {
  const key = await getKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(ivB64) },
    key,
    b64ToBytes(ciphertextB64),
  );
  return new TextDecoder().decode(plain);
}

// ---------- Cookie jar ----------
type Jar = Map<string, string>;
function jarFromHeaders(headers: Headers, jar: Jar): Jar {
  // deno-lint-ignore no-explicit-any
  const anyH = headers as any;
  const cookies: string[] = typeof anyH.getSetCookie === "function"
    ? anyH.getSetCookie()
    : (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
  for (const raw of cookies) {
    const first = raw.split(";")[0];
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (value === "" || /^expired?$/i.test(value)) jar.delete(name);
    else jar.set(name, value);
  }
  return jar;
}
function cookieHeader(jar: Jar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function extractInput(html: string, name: string): string | null {
  const re = new RegExp(
    `<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["']`,
    "i",
  );
  return html.match(re)?.[1] ?? null;
}

async function gobookLogin(email: string, password: string): Promise<Jar> {
  const jar: Jar = new Map();
  const getRes = await fetch(`${GOBOOK_BASE}/Home/Login`, {
    headers: { "User-Agent": "SquashHub/1.0 (+squashhub.co.za)" },
  });
  jarFromHeaders(getRes.headers, jar);
  const loginHtml = await getRes.text();
  const token = extractInput(loginHtml, "__RequestVerificationToken");

  const form = new URLSearchParams();
  if (token) form.set("__RequestVerificationToken", token);
  form.set("Email", email);
  form.set("UserName", email);
  form.set("Password", password);
  form.set("RememberMe", "false");

  const postRes = await fetch(`${GOBOOK_BASE}/Home/Login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "SquashHub/1.0 (+squashhub.co.za)",
      "Referer": `${GOBOOK_BASE}/Home/Login`,
      cookie: cookieHeader(jar),
    },
    body: form.toString(),
  });
  jarFromHeaders(postRes.headers, jar);
  return jar;
}

function dateKey(yyyyMmDd: string): string {
  return yyyyMmDd.replaceAll("-", "").replaceAll("/", "");
}

type GridSlot = {
  startHour: number;
  courtNumber: number;
  slotId: string | null;
  bookerName: string | null;
  free: boolean;
};

async function fetchGrid(jar: Jar, yyyyMmDd: string): Promise<GridSlot[]> {
  const url =
    `${GOBOOK_BASE}/Bookings/New?key=${SQUASH_SERVICE_ID},${CSIR_PROVIDER_ID},0,0,${
      dateKey(yyyyMmDd)
    }&x=${Date.now()}`;
  const res = await fetch(url, {
    headers: {
      cookie: cookieHeader(jar),
      "User-Agent": "SquashHub/1.0 (+squashhub.co.za)",
    },
  });
  jarFromHeaders(res.headers, jar);
  const html = await res.text();

  const out: GridSlot[] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRe.exec(html)) !== null) {
    const inner = trMatch[1];
    const timeMatch = inner.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!timeMatch) continue;
    const startHour = Number(timeMatch[1]);

    const cells: string[] = [];
    const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRe.exec(inner)) !== null) cells.push(tdMatch[1]);
    if (cells.length < 2) continue;

    cells.slice(1).forEach((cell, idx) => {
      const cb = cell.match(
        /<input[^>]*type=["']checkbox["'][^>]*value=["']([^"']+)["']/i,
      );
      if (cb) {
        out.push({
          startHour,
          courtNumber: idx + 1,
          slotId: cb[1],
          bookerName: null,
          free: true,
        });
        return;
      }
      const text = cell
        .replace(/<img[^>]*>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      out.push({
        startHour,
        courtNumber: idx + 1,
        slotId: null,
        bookerName: text || null,
        free: false,
      });
    });
  }
  return out;
}

// ---------- Sync logic ----------
type SyncResult = {
  club_id: string;
  synced: number;
  cancelled: number;
  dates: string[];
  skipped_reason?: string;
};

function parseCourtNumber(name: string): number | null {
  const m = name.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function syncClub(
  admin: ReturnType<typeof createClient>,
  clubId: string,
  days: number,
): Promise<SyncResult> {
  const result: SyncResult = {
    club_id: clubId,
    synced: 0,
    cancelled: 0,
    dates: [],
  };

  const { data: club, error: clubErr } = await admin
    .from("clubs")
    .select("id, uses_gobook, booking_slot_minutes")
    .eq("id", clubId)
    .maybeSingle();
  if (clubErr) throw new Error(clubErr.message);
  if (!club) {
    result.skipped_reason = "club_not_found";
    return result;
  }
  if (!club.uses_gobook) {
    result.skipped_reason = "uses_gobook_false";
    return result;
  }
  if (club.booking_slot_minutes !== 60) {
    result.skipped_reason = "non_hourly_slots";
    return result;
  }

  // Pick a sync-source credential — most recently verified, status ok.
  // member_gobook_credentials has user_id; join club_members to scope by club.
  const { data: memberRows, error: memErr } = await admin
    .from("club_members")
    .select("id, full_name, user_id")
    .eq("club_id", clubId);
  if (memErr) throw new Error(memErr.message);
  const memberIds = (memberRows ?? []).map((m: any) => m.id);
  if (memberIds.length === 0) {
    result.skipped_reason = "no_members";
    return result;
  }

  const { data: creds, error: credErr } = await admin
    .from("member_gobook_credentials")
    .select(
      "club_member_id, gobook_username, gobook_password_ciphertext, gobook_password_iv, last_verified_at, last_verification_status, is_sync_source",
    )
    .in("club_member_id", memberIds)
    .eq("is_sync_source", true)
    .eq("last_verification_status", "ok")
    .order("last_verified_at", { ascending: false })
    .limit(1);
  if (credErr) throw new Error(credErr.message);
  const cred = creds?.[0];
  if (!cred) {
    result.skipped_reason = "no_sync_source";
    return result;
  }

  // Courts: map court number -> court id by parsing name.
  const { data: courts, error: courtErr } = await admin
    .from("courts")
    .select("id, name")
    .eq("club_id", clubId);
  if (courtErr) throw new Error(courtErr.message);
  const courtMap = new Map<number, number>();
  for (const c of courts ?? []) {
    const num = parseCourtNumber((c as any).name);
    if (num != null) courtMap.set(num, (c as any).id);
  }
  if (courtMap.size === 0) {
    result.skipped_reason = "no_courts";
    return result;
  }

  // Name → club_member lookup (case-insensitive, exact full_name match)
  const nameMap = new Map<string, { id: string; user_id: string | null }>();
  for (const m of memberRows ?? []) {
    const key = String((m as any).full_name || "").trim().toLowerCase();
    if (!key) continue;
    if (nameMap.has(key)) {
      // ambiguous — drop so we don't mis-link
      nameMap.set(key, { id: "", user_id: null });
    } else {
      nameMap.set(key, {
        id: (m as any).id,
        user_id: (m as any).user_id ?? null,
      });
    }
  }

  // Login
  const password = await decryptPassword(
    cred.gobook_password_ciphertext as string,
    cred.gobook_password_iv as string,
  );
  let jar: Jar;
  try {
    jar = await gobookLogin(cred.gobook_username as string, password);
  } catch (e) {
    await admin
      .from("member_gobook_credentials")
      .update({
        last_verification_status: "invalid",
        last_verified_at: new Date().toISOString(),
      })
      .eq("club_member_id", cred.club_member_id);
    result.skipped_reason = "login_failed: " + (e as Error).message;
    return result;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const dateStr = isoDate(d);
    result.dates.push(dateStr);

    let slots: GridSlot[];
    try {
      slots = await fetchGrid(jar, dateStr);
    } catch (e) {
      console.error("fetchGrid failed", dateStr, e);
      continue;
    }

    const seenExternal = new Set<string>();
    for (const s of slots) {
      if (s.free) continue;
      const courtId = courtMap.get(s.courtNumber);
      if (!courtId) continue;
      // Identify the slot: name-based, since booked slots have no slotId.
      // Use date + court + hour as a stable composite external_id.
      const external = `${dateKey(dateStr)}-${s.courtNumber}-${
        String(s.startHour).padStart(2, "0")
      }`;
      seenExternal.add(external);

      const link = s.bookerName
        ? nameMap.get(s.bookerName.trim().toLowerCase())
        : undefined;
      const linkedMemberId = link && link.id ? link.id : null;
      const linkedUserId = link && link.id ? link.user_id : null;

      const row: Record<string, unknown> = {
        club_id: clubId,
        court_id: courtId,
        date: dateStr,
        start_time: `${String(s.startHour).padStart(2, "0")}:00:00`,
        end_time: `${String((s.startHour + 1) % 24).padStart(2, "0")}:00:00`,
        status: "active",
        source: "gobook",
        external_id: external,
        external_booker_name: s.bookerName,
        is_friendly: false,
        lights_requested: false,
        club_member_id: linkedMemberId,
        user_id: linkedUserId,
      };

      const { error: upErr } = await admin
        .from("bookings")
        .upsert(row, { onConflict: "club_id,source,external_id" });
      if (upErr) {
        console.error("upsert failed", external, upErr.message);
        continue;
      }
      result.synced++;
    }

    // Cancellations: delete any gobook rows for this date+club not in seen set.
    const { data: existing } = await admin
      .from("bookings")
      .select("id, external_id")
      .eq("club_id", clubId)
      .eq("source", "gobook")
      .eq("date", dateStr);
    const stale = (existing ?? []).filter(
      (r: any) => r.external_id && !seenExternal.has(r.external_id),
    );
    if (stale.length > 0) {
      const { error: delErr } = await admin
        .from("bookings")
        .delete()
        .in("id", stale.map((r: any) => r.id));
      if (!delErr) result.cancelled += stale.length;
    }
  }

  return result;
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

    const admin = createClient(SUPABASE_URL, SERVICE);
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body.days) || 14, 1), 30);

    // Cron mode
    if (body.cron === true) {
      const cronHeader = req.headers.get("X-Cron-Secret") ||
        req.headers.get("x-cron-secret");
      if (cronHeader !== CRON_SECRET) {
        return json({ error: "Forbidden" }, 403);
      }
      const { data: clubs, error } = await admin
        .from("clubs")
        .select("id")
        .eq("uses_gobook", true);
      if (error) return json({ error: error.message }, 500);
      const results: SyncResult[] = [];
      for (const c of clubs ?? []) {
        try {
          results.push(await syncClub(admin, (c as any).id, days));
        } catch (e) {
          results.push({
            club_id: (c as any).id,
            synced: 0,
            cancelled: 0,
            dates: [],
            skipped_reason: "error: " + (e as Error).message,
          });
        }
      }
      return json({ ok: true, results });
    }

    // Manual mode — require user JWT + membership in club
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth
      .getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claimsData?.claims) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;
    const clubId = String(body.club_id || "");
    if (!clubId) return json({ error: "club_id required" }, 400);

    const { data: membership } = await admin
      .from("club_members")
      .select("id")
      .eq("club_id", clubId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return json({ error: "Not a member of this club" }, 403);

    const result = await syncClub(admin, clubId, days);
    return json({ ok: true, ...result });
  } catch (e) {
    console.error("gobook-sync error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
