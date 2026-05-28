// GoBook (gobook.co.za) credential storage + court-booking proxy for CSIR members.
//
// Actions (POST JSON, field "action"):
//   save_credentials     { club_member_id, gobook_username, gobook_password }
//   delete_credentials   { club_member_id }
//   get_credentials_meta { club_member_id }
//   verify_credentials   { club_member_id }
//   debug_grid           { club_member_id, date (YYYY-MM-DD), court? }     -> parsed grid for inspection
//   book                 { club_member_id, date (YYYY-MM-DD), start_hour (0-23), court? (1..4 or "any"), notes?, sms?, email? }
//
// Defaults: ServiceId=6 (Squash), ProviderId=234 (CSIR), ProviderConsultantId=476 ("Any" court).
// Time slots are hourly (00:00-01:00 ... 23:00-24:00) on a 4-court grid.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GOBOOK_BASE = "https://www.gobook.co.za";
const SQUASH_SERVICE_ID = "6";
const CSIR_PROVIDER_ID = "234";
const ANY_COURT_CONSULTANT_ID = "476";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- AES-GCM helpers (key = base64 32 bytes) ----------
function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("GOBOOK_CRED_KEY");
  if (!raw) throw new Error("GOBOOK_CRED_KEY not configured");
  const keyBytes = b64ToBytes(raw);
  if (keyBytes.length !== 32) {
    throw new Error("GOBOOK_CRED_KEY must be 32 bytes (base64)");
  }
  return await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
async function encryptPassword(plain: string) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plain),
    ),
  );
  return { ciphertext: bytesToB64(cipher), iv: bytesToB64(iv) };
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

// ---------- Cookie jar (very small) ----------
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
    if (value === "" || /^expired?$/i.test(value)) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
  return jar;
}
function cookieHeader(jar: Jar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

// ---------- GoBook helpers ----------
function extractInput(html: string, name: string): string | null {
  // <input name="X" value="Y" />  (attribute order flexible)
  const re = new RegExp(
    `<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["']`,
    "i",
  );
  const m = html.match(re);
  if (m) return m[1];
  const re2 = new RegExp(
    `<input[^>]*value=["']([^"']*)["'][^>]*name=["']${name}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
}

async function gobookLogin(email: string, password: string): Promise<Jar> {
  const jar: Jar = new Map();

  // GET the login page to receive antiforgery token + initial cookies
  const getRes = await fetch(`${GOBOOK_BASE}/Home/Login`, {
    headers: { "User-Agent": "SquashHub/1.0 (+squashhub.co.za)" },
  });
  jarFromHeaders(getRes.headers, jar);
  const loginHtml = await getRes.text();
  const token = extractInput(loginHtml, "__RequestVerificationToken");

  // POST the form. ASP.NET MVC commonly uses "Email" + "Password"; we send both
  // common shapes so this works whether GoBook uses Email or UserName.
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

  // Verify by fetching Dashboard — if not logged in we get redirected to /Home/Login
  const check = await fetch(`${GOBOOK_BASE}/Dashboard`, {
    redirect: "manual",
    headers: {
      cookie: cookieHeader(jar),
      "User-Agent": "SquashHub/1.0 (+squashhub.co.za)",
    },
  });
  jarFromHeaders(check.headers, jar);
  const loc = check.headers.get("location") || "";
  if (check.status >= 300 && check.status < 400 && /Login/i.test(loc)) {
    throw new Error("GoBook login failed (credentials rejected)");
  }
  if (check.status === 200) {
    const dashHtml = await check.text();
    if (/<form[^>]*action=["'][^"']*\/Home\/Login/i.test(dashHtml)) {
      throw new Error("GoBook login failed (still on login page)");
    }
  }
  return jar;
}

function dateToGoBookKeyDate(yyyyMmDd: string): string {
  // "2026/05/28" -> "20260528"
  return yyyyMmDd.replaceAll("-", "").replaceAll("/", "");
}
function dateToGoBookBookingDate(yyyyMmDd: string): string {
  // "2026-05-28" -> "2026/05/28"
  return yyyyMmDd.replaceAll("-", "/");
}

type GridRow = {
  time: string;          // "15:00-16:00"
  startHour: number;     // 15
  courts: Array<{
    courtNumber: number;     // 1..4
    providerConsultantId: string | null;
    free: boolean;
    slotId: string | null;   // PSSTId from the checkbox value
    bookerName: string | null;
  }>;
};

function extractProviderConsultantId(cell: string, slotId: string | null): string | null {
  const keyMatch = cell.match(/key=\d+,\d+,(\d+),/i);
  if (keyMatch?.[1] && keyMatch[1] !== "0") return keyMatch[1];

  const consultantPatterns = [
    /ProviderConsultantId\s*[=:]\s*["']?(\d+)/i,
    /providerConsultantId\s*[=:]\s*["']?(\d+)/i,
    /consultantId\s*[=:]\s*["']?(\d+)/i,
  ];
  for (const pattern of consultantPatterns) {
    const match = cell.match(pattern);
    if (match?.[1] && match[1] !== "0") return match[1];
  }

  if (slotId) {
    const parts = String(slotId).split(/[,_|:-]/).filter(Boolean);
    const likelyConsultant = parts.find((part) => /^\d+$/.test(part) && part !== slotId);
    if (likelyConsultant && likelyConsultant !== "0") return likelyConsultant;
  }

  return null;
}

function extractAvailableSlotId(cell: string): string | null {
  const inputs = cell.match(/<input\b[^>]*>/gi) ?? [];
  for (const input of inputs) {
    if (!/\btype\s*=\s*(?:["']checkbox["']|checkbox)(?=\s|>|\/)/i.test(input)) continue;
    if (/\bdisabled\b/i.test(input)) continue;

    const quotedValue = input.match(/\bvalue\s*=\s*["']([^"']+)["']/i);
    if (quotedValue?.[1]) return quotedValue[1];

    const unquotedValue = input.match(/\bvalue\s*=\s*([^\s>]+)/i);
    if (unquotedValue?.[1]) return unquotedValue[1];
  }
  return null;
}

/**
 * Fetch the booking grid for a date and parse rows. We hit the "Any" court
 * view (court=0) so we see all 4 courts in one shot.
 */
async function fetchGrid(
  jar: Jar,
  yyyyMmDd: string,
): Promise<{ raw: string; rows: GridRow[]; courtCount: number }> {
  const dateKey = dateToGoBookKeyDate(yyyyMmDd);
  // key: ServiceId,ProviderId,court,slot,date
  const url =
    `${GOBOOK_BASE}/Bookings/New?key=${SQUASH_SERVICE_ID},${CSIR_PROVIDER_ID},0,0,${dateKey}&x=${Date.now()}`;
  const res = await fetch(url, {
    headers: {
      cookie: cookieHeader(jar),
      "User-Agent": "SquashHub/1.0 (+squashhub.co.za)",
    },
  });
  jarFromHeaders(res.headers, jar);
  const html = await res.text();

  // Parse rows from the grid table. Each row starts with a time cell like
  // "15:00-16:00", followed by N court cells each containing either a checkbox
  // (free) or text + envelope image (booked, with name).
  const rows: GridRow[] = [];
  // Match each <tr>...</tr> that contains a time pattern HH:MM-HH:MM.
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  let courtCount = 0;
  while ((trMatch = trRe.exec(html)) !== null) {
    const inner = trMatch[1];
    const timeMatch = inner.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!timeMatch) continue;
    const startHour = Number(timeMatch[1]);
    const time = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}-${
      timeMatch[3].padStart(2, "0")
    }:${timeMatch[4]}`;

    // Split into <td>...</td> cells
    const cells: string[] = [];
    const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRe.exec(inner)) !== null) cells.push(tdMatch[1]);
    if (cells.length < 2) continue;
    // First cell is the time; the rest are courts.
    const courtCells = cells.slice(1);
    if (courtCount === 0) courtCount = courtCells.length;

    const courts = courtCells.map((cell, idx) => {
      // Free slot: checkbox attributes may arrive in any order from GoBook.
      const availableSlotId = extractAvailableSlotId(cell);
      const providerConsultantId = extractProviderConsultantId(cell, availableSlotId);
      if (availableSlotId) {
        return {
          courtNumber: idx + 1,
          providerConsultantId,
          free: true,
          slotId: availableSlotId,
          bookerName: null,
        };
      }
      // Booked slot: plain text (booker name) optionally with <img>
      const text = cell
        .replace(/<img[^>]*>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return {
        courtNumber: idx + 1,
        providerConsultantId,
        free: false,
        slotId: null,
        bookerName: text || null,
      };
    });

    rows.push({ time, startHour, courts });
  }

  return { raw: html, rows, courtCount };
}

async function postBooking(
  jar: Jar,
  payload: {
    BookingDate: string;
    PSSTIds: string;
    ProviderConsultantId: string;
    Notes: string;
    ConfirmViaSMS: boolean;
    ConfirmViaEmail: boolean;
  },
): Promise<{ ok: boolean; status: number; bodyText: string }> {
  const body = {
    ServiceId: SQUASH_SERVICE_ID,
    ProviderId: CSIR_PROVIDER_ID,
    ProviderConsultantId: payload.ProviderConsultantId,
    BookingDate: payload.BookingDate,
    PSSTIds: payload.PSSTIds,
    ConfirmViaEmail: payload.ConfirmViaEmail,
    ConfirmViaSMS: payload.ConfirmViaSMS,
    Notes: payload.Notes,
  };
  const res = await fetch(`${GOBOOK_BASE}/Bookings/Insert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": `${GOBOOK_BASE}/Bookings/New`,
      "User-Agent": "SquashHub/1.0 (+squashhub.co.za)",
      cookie: cookieHeader(jar),
    },
    body: JSON.stringify(body),
  });
  jarFromHeaders(res.headers, jar);
  const text = await res.text();
  return { ok: res.ok, status: res.status, bodyText: text };
}

// ---------- Edge function ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(SUPABASE_URL, SERVICE);

    const { data: claimsData, error: claimsErr } = await userClient.auth
      .getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claimsData?.claims) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const clubMemberId = body.club_member_id as string | undefined;

    if (clubMemberId) {
      const { data: cm, error: cmErr } = await adminClient
        .from("club_members")
        .select("id, user_id")
        .eq("id", clubMemberId)
        .maybeSingle();
      if (cmErr) return json({ error: cmErr.message }, 500);
      if (!cm || cm.user_id !== userId) {
        return json({ error: "Not your member record" }, 403);
      }
    }

    switch (action) {
      case "save_credentials": {
        const username = String(body.gobook_username || "").trim();
        const password = String(body.gobook_password || "");
        if (!username || !password) {
          return json({ error: "Missing username/password" }, 400);
        }

        // Verify with GoBook before saving
        try {
          await gobookLogin(username, password);
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }

        const { ciphertext, iv } = await encryptPassword(password);
        const { error: upErr } = await adminClient
          .from("member_gobook_credentials")
          .upsert({
            club_member_id: clubMemberId,
            user_id: userId,
            gobook_username: username,
            gobook_password_ciphertext: ciphertext,
            gobook_password_iv: iv,
            last_verified_at: new Date().toISOString(),
            last_verification_status: "ok",
          }, { onConflict: "club_member_id" });
        if (upErr) return json({ error: upErr.message }, 500);
        return json({ ok: true, verified: true });
      }

      case "delete_credentials": {
        const { error } = await adminClient
          .from("member_gobook_credentials")
          .delete()
          .eq("club_member_id", clubMemberId);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "get_credentials_meta": {
        const { data, error } = await adminClient
          .from("member_gobook_credentials")
          .select(
            "gobook_username, last_verified_at, last_verification_status",
          )
          .eq("club_member_id", clubMemberId)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        return json({
          has_credentials: !!data,
          gobook_username: data?.gobook_username ?? null,
          last_verified_at: data?.last_verified_at ?? null,
          last_verification_status: data?.last_verification_status ?? null,
        });
      }

      case "verify_credentials":
      case "debug_grid":
      case "book": {
        const { data: row, error: rErr } = await adminClient
          .from("member_gobook_credentials")
          .select(
            "gobook_username, gobook_password_ciphertext, gobook_password_iv",
          )
          .eq("club_member_id", clubMemberId)
          .maybeSingle();
        if (rErr) return json({ error: rErr.message }, 500);
        if (!row) {
          return json(
            { error: "No GoBook credentials saved for this member" },
            400,
          );
        }

        const password = await decryptPassword(
          row.gobook_password_ciphertext,
          row.gobook_password_iv,
        );
        let jar: Jar;
        try {
          jar = await gobookLogin(row.gobook_username, password);
        } catch (e) {
          await adminClient
            .from("member_gobook_credentials")
            .update({
              last_verification_status: "invalid",
              last_verified_at: new Date().toISOString(),
            })
            .eq("club_member_id", clubMemberId);
          return json({ error: (e as Error).message }, 400);
        }
        await adminClient
          .from("member_gobook_credentials")
          .update({
            last_verification_status: "ok",
            last_verified_at: new Date().toISOString(),
          })
          .eq("club_member_id", clubMemberId);

        if (action === "verify_credentials") {
          return json({ ok: true, gobook_username: row.gobook_username });
        }

        if (action === "debug_grid") {
          const date = String(body.date || "").trim();
          if (!date) return json({ error: "date required (YYYY-MM-DD)" }, 400);
          const { rows, courtCount, raw } = await fetchGrid(jar, date);
          // For debugging include first 2000 chars of HTML so we can spot
          // structural issues without flooding the response.
          return json({
            ok: true,
            date,
            court_count: courtCount,
            rows,
            raw_html_preview: raw.slice(0, 2000),
          });
        }

        // book
        const date = String(body.date || "").trim();
        const startHour = Number(body.start_hour);
        const courtPref = body.court === "any" || body.court == null
          ? "any"
          : Number(body.court);
        const notes = String(body.notes || "");
        const sms = body.sms !== false; // default true
        const email = body.email === true; // default false
        if (!date || Number.isNaN(startHour)) {
          return json(
            { error: "date and start_hour required" },
            400,
          );
        }

        const { rows, courtCount } = await fetchGrid(jar, date);
        const targetRow = rows.find((r) => r.startHour === startHour);
        if (!targetRow) {
          return json(
            {
              error:
                `No grid row found for hour ${startHour}:00. GoBook returned ${rows.length} rows.`,
            },
            400,
          );
        }
        let chosen = null as
          | { courtNumber: number; slotId: string }
          | null;
        if (courtPref === "any") {
          const free = targetRow.courts.find((c) => c.free && c.slotId);
          if (free) {
            chosen = { courtNumber: free.courtNumber, slotId: free.slotId! };
          }
        } else {
          const c = targetRow.courts.find((c) =>
            c.courtNumber === courtPref && c.free && c.slotId
          );
          if (c) chosen = { courtNumber: c.courtNumber, slotId: c.slotId! };
        }
        if (!chosen) {
          return json({
            error: `No free slot at ${startHour}:00 ${
              courtPref === "any" ? "on any court" : `on Court #${courtPref}`
            }`,
            row: targetRow,
            court_count: courtCount,
          }, 409);
        }

        const result = await postBooking(jar, {
          BookingDate: dateToGoBookBookingDate(date),
          PSSTIds: chosen.slotId,
          ProviderConsultantId: ANY_COURT_CONSULTANT_ID,
          Notes: notes,
          ConfirmViaSMS: sms,
          ConfirmViaEmail: email,
        });
        if (!result.ok) {
          return json({
            error: `GoBook rejected the booking for ${startHour}:00 on Court #${chosen.courtNumber}`,
            status: result.status,
            court: chosen.courtNumber,
            slot_id: chosen.slotId,
            gobook_response: result.bodyText.slice(0, 1000),
          }, 409);
        }

        return json({
          ok: result.ok,
          status: result.status,
          court: chosen.courtNumber,
          slot_id: chosen.slotId,
          gobook_response: result.bodyText.slice(0, 1000),
        }, result.ok ? 200 : 502);
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("gobook-book uncaught error:", e);
    const err = e as Error;
    return json(
      { error: err?.message || String(e), stack: err?.stack?.split("\n").slice(0, 5) },
      500,
    );
  }
});
