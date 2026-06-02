// GoBook (gobook.co.za) credential storage + court-booking proxy for CSIR members.
//
// Actions (POST JSON, field "action"):
//   save_credentials     { club_member_id, gobook_username, gobook_password }
//   delete_credentials   { club_member_id }
//   get_credentials_meta { club_member_id }
//   verify_credentials   { club_member_id }
//   debug_grid           { club_member_id, date (YYYY-MM-DD), court? }     -> parsed grid for inspection
//   book                 { club_member_id, date (YYYY-MM-DD), start_hour (0-23), court? (1..4 or "any"), notes?, sms?, email? }
//   debug_my_bookings    { club_member_id }                                -> raw /MyBookings HTML preview (discovery)
//   cancel               { club_member_id, date (YYYY-MM-DD), start_hour (0-23), court (1..4) }
//
// Defaults: ServiceId=6 (Squash), ProviderId=234 (CSIR), ProviderConsultantId=0 ("Any" court).
// Time slots are hourly (00:00-01:00 ... 23:00-24:00) on a 4-court grid.
// GoBook restriction: bookings cannot be cancelled within ~1 hour of start time.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GOBOOK_BASE = "https://www.gobook.co.za";
const SQUASH_SERVICE_ID = "6";
const CSIR_PROVIDER_ID = "234";
const ANY_COURT_CONSULTANT_ID = "0";
const CSIR_COURT_CONSULTANT_IDS = new Map<number, string>([
  [1, "476"],
  [2, "477"],
  [3, "478"],
  [4, "479"],
]);

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

  // The login form lives on `/` (the old /Home/Login GET now returns 404).
  // GET it first so we pick up the ASP.NET session cookie before posting.
  const getRes = await fetch(`${GOBOOK_BASE}/`, {
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
      "Referer": `${GOBOOK_BASE}/`,
      cookie: cookieHeader(jar),
    },
    body: form.toString(),
  });
  jarFromHeaders(postRes.headers, jar);

  // A successful login returns a 302 + sets a non-empty GoBookSession (or
  // .ASPXAUTH) cookie. 200 means the form was re-rendered with errors. An
  // empty/cleared session cookie also means failure.
  const sessionVal = jar.get("GoBookSession") || jar.get(".ASPXAUTH") || "";
  if (postRes.status === 200 || !sessionVal) {
    // Echo back the exact username we sent so the user can spot browser
    // autofill mistakes (e.g. SquashHub email instead of their GoBook email).
    throw new Error(
      `GoBook rejected the login for "${email}". Double-check the email/username and password you use on gobook.co.za — your browser may have autofilled the wrong email.`,
    );
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

  return null;
}

function extractAvailableSlotId(cell: string): string | null {
  const inputs = cell.match(/<input\b[^>]*>/gi) ?? [];
  for (const input of inputs) {
    if (!/\btype\s*=\s*(?:["']checkbox["']|checkbox)(?=\s|>|\/)/i.test(input)) continue;
    if (/\bdisabled\b/i.test(input)) continue;

    const quotedValue = input.match(/\bvalue\s*=\s*["']([^"']+)["']/i);
    if (quotedValue?.[1]) return quotedValue[1].replace(/^PSST/i, "");

    const unquotedValue = input.match(/\bvalue\s*=\s*([^\s>]+)/i);
    if (unquotedValue?.[1]) return unquotedValue[1].replace(/^PSST/i, "");

    // GoBook's current grid exposes bookable slots as id='PSST087309'
    // without a value attribute. Its submit script strips the PSST prefix.
    const quotedId = input.match(/\bid\s*=\s*["']PSST([^"']+)["']/i);
    if (quotedId?.[1]) return quotedId[1];

    const unquotedId = input.match(/\bid\s*=\s*PSST([^\s>]+)/i);
    if (unquotedId?.[1]) return unquotedId[1];
  }
  return null;
}

/**
 * Fetch the booking grid for a date and parse rows. By default we hit the
 * "Any" court view (court=0) so we see all 4 courts in one shot. For a final
 * booking attempt we can fetch a court-specific view, which is more reliable
 * when GoBook's combined grid omits or shifts court cells.
 */
async function fetchGrid(
  jar: Jar,
  yyyyMmDd: string,
  courtNumber: number | "any" = "any",
  courtKeyOverride?: string,
): Promise<{ raw: string; rows: GridRow[]; courtCount: number; urlKey: string }> {
  const dateKey = dateToGoBookKeyDate(yyyyMmDd);
  // GoBook has used both 1-4 and ProviderConsultantId-style keys for court tabs
  // in different contexts, so callers can pass an explicit key to probe both.
  const courtKey = courtKeyOverride ?? (courtNumber === "any"
    ? "0"
    : String(courtNumber));
  // key: ServiceId,ProviderId,court,slot,date
  const url =
    `${GOBOOK_BASE}/Bookings/New?key=${SQUASH_SERVICE_ID},${CSIR_PROVIDER_ID},${courtKey},0,${dateKey}&x=${Date.now()}`;
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
      const parsedCourtNumber = courtNumber !== "any" && courtCells.length === 1
        ? courtNumber
        : idx + 1;
      if (availableSlotId) {
        return {
          courtNumber: parsedCourtNumber,
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
        courtNumber: parsedCourtNumber,
        providerConsultantId,
        free: false,
        slotId: null,
        bookerName: text || null,
      };
    });

    rows.push({ time, startHour, courts });
  }

  return { raw: html, rows, courtCount, urlKey: courtKey };
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
    Pin: string;
    MembershipNumber: string;
  },
): Promise<{ ok: boolean; status: number; bodyText: string }> {
  // Field names confirmed from GoBook's own /Accounts/ClientRegister HTML +
  // inline JS: name="PIN", name="PINConfirm", name="MembershipNumber". GoBook
  // stores these on the linked-provider profile on registration; the booking
  // insert may either re-read them from the JSON body or look them up
  // server-side. Sending them with the correct names covers both cases.
  const body: Record<string, unknown> = {
    ServiceId: SQUASH_SERVICE_ID,
    ProviderId: CSIR_PROVIDER_ID,
    ProviderConsultantId: payload.ProviderConsultantId,
    BookingDate: payload.BookingDate,
    PSSTIds: payload.PSSTIds,
    ConfirmViaEmail: payload.ConfirmViaEmail,
    ConfirmViaSMS: payload.ConfirmViaSMS,
    Notes: payload.Notes,
    PIN: payload.Pin,
    PINConfirm: payload.Pin,
    MembershipNumber: payload.MembershipNumber,
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
      case "save_extras": {
        const pinRaw = body.gobook_pin;
        const pin = pinRaw == null ? null : String(pinRaw).trim();
        const membershipRaw = body.court_manager_membership_number;
        const membership = membershipRaw == null
          ? null
          : String(membershipRaw).trim();
        if (pin !== null && pin !== "" && !/^\d{4,8}$/.test(pin)) {
          return json({ error: "PIN must be 4-8 digits" }, 400);
        }
        if (membership !== null && membership !== "" && membership.length > 32) {
          return json({ error: "Membership number too long" }, 400);
        }
        const updateRow: Record<string, unknown> = {};
        if (pin !== null) updateRow.gobook_pin = pin === "" ? null : pin;
        if (membership !== null) {
          updateRow.court_manager_membership_number = membership === ""
            ? null
            : membership;
        }
        if (Object.keys(updateRow).length === 0) {
          return json({ ok: true });
        }
        const { error: upErr } = await adminClient
          .from("member_gobook_credentials")
          .update(updateRow)
          .eq("club_member_id", clubMemberId);
        if (upErr) return json({ error: upErr.message }, 500);
        return json({ ok: true });
      }


      case "save_credentials": {
        const username = String(body.gobook_username || "").trim();
        const password = String(body.gobook_password || "");
        const pinRaw = body.gobook_pin;
        const pin = pinRaw == null ? null : String(pinRaw).trim();
        const membershipRaw = body.court_manager_membership_number;
        const membership = membershipRaw == null
          ? null
          : String(membershipRaw).trim();
        if (!username || !password) {
          return json({ error: "Missing username/password" }, 400);
        }
        if (pin !== null && pin !== "" && !/^\d{4,8}$/.test(pin)) {
          return json({ error: "PIN must be 4-8 digits" }, 400);
        }
        if (membership !== null && membership !== "" && membership.length > 32) {
          return json({ error: "Membership number too long" }, 400);
        }

        // Verify with GoBook before saving
        try {
          await gobookLogin(username, password);
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }

        const { ciphertext, iv } = await encryptPassword(password);
        const upsertRow: Record<string, unknown> = {
          club_member_id: clubMemberId,
          user_id: userId,
          gobook_username: username,
          gobook_password_ciphertext: ciphertext,
          gobook_password_iv: iv,
          last_verified_at: new Date().toISOString(),
          last_verification_status: "ok",
        };
        // Only write fields when caller provided them (null = leave existing,
        // "" = clear).
        if (pin !== null) upsertRow.gobook_pin = pin === "" ? null : pin;
        if (membership !== null) {
          upsertRow.court_manager_membership_number = membership === ""
            ? null
            : membership;
        }
        const { error: upErr } = await adminClient
          .from("member_gobook_credentials")
          .upsert(upsertRow, { onConflict: "club_member_id" });
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
            "gobook_username, last_verified_at, last_verification_status, gobook_pin, court_manager_membership_number",
          )
          .eq("club_member_id", clubMemberId)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        return json({
          has_credentials: !!data,
          gobook_username: data?.gobook_username ?? null,
          last_verified_at: data?.last_verified_at ?? null,
          last_verification_status: data?.last_verification_status ?? null,
          has_pin: !!data?.gobook_pin,
          has_membership_number: !!data?.court_manager_membership_number,
          court_manager_membership_number:
            data?.court_manager_membership_number ?? null,
        });
      }


      case "verify_credentials":
      case "debug_grid":
      case "debug_my_bookings":
      case "cancel":
      case "book": {
        const { data: row, error: rErr } = await adminClient
          .from("member_gobook_credentials")
          .select(
            "gobook_username, gobook_password_ciphertext, gobook_password_iv, gobook_pin, court_manager_membership_number",
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

        if (action === "debug_my_bookings") {
          const paths = [
            "/MyBookings",
            "/Bookings/MyBookings",
            "/Bookings",
            "/Bookings/Index",
            "/Home/MyBookings",
          ];
          const probes: Array<{ path: string; status: number; finalUrl: string; preview: string }> = [];
          for (const p of paths) {
            const r = await fetch(`${GOBOOK_BASE}${p}`, {
              headers: {
                cookie: cookieHeader(jar),
                "User-Agent": "SquashHub/1.0 (+squashhub.co.za)",
              },
              redirect: "follow",
            });
            jarFromHeaders(r.headers, jar);
            const txt = await r.text();
            probes.push({
              path: p,
              status: r.status,
              finalUrl: r.url,
              preview: txt.slice(0, 4000),
            });
          }
          return json({ ok: true, probes });
        }

        if (action === "cancel") {
          const date = String(body.date || "").trim();
          const startHour = Number(body.start_hour);
          const court = Number(body.court);
          if (!date || Number.isNaN(startHour) || Number.isNaN(court)) {
            return json({ error: "date, start_hour and court are required" }, 400);
          }

          // Refuse anything within 1 hour of start (GoBook also blocks this server-side).
          const startMs = new Date(`${date.replaceAll("/", "-")}T${String(startHour).padStart(2, "0")}:00:00+02:00`).getTime();
          if (!Number.isNaN(startMs) && startMs - Date.now() < 60 * 60 * 1000) {
            return json({
              error: "GoBook does not allow cancellation within 1 hour of the booking start time. Please cancel directly on gobook.co.za if it's an emergency.",
            }, 400);
          }

          // STEP 1 — find the BookingId (bid) for this booking by scraping
          // MyBookings. GoBook's real cancel endpoint is POST /Bookings/Maintain
          // with JSON { BookingId, ClientNotes, FocusedControl: "Cancel" } and
          // BookingId is the numeric id surfaced in MyBookings rows as
          // Details?bid=NNNNNNN (also used by Maintain links).
          // Parse each "block" of MyBookings as the HTML chunk surrounding a
          // booking id link/field and look for date + hour + court match.
          // GoBook changes this markup often, so normalise punctuation/entities
          // before matching dates like "Wed, 03 Jun 2026" or "2026/06/03".
          const normalizedDate = date.replaceAll("/", "-");
          const [y, m, d] = normalizedDate.split("-");
          const shortMonth = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m)-1];
          const longMonth = ["January","February","March","April","May","June","July","August","September","October","November","December"][Number(m)-1];
          const compact = (value: string) => value
            .toLowerCase()
            .replace(/&nbsp;|&#160;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/<[^>]*>/g, " ")
            .replace(/[^a-z0-9]+/g, "");
          const plain = (value: string) => value
            .toLowerCase()
            .replace(/&nbsp;|&#160;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const datePatterns = [
            `${y}/${m}/${d}`,
            `${d}/${m}/${y}`,
            `${y}-${m}-${d}`,
            `${d}-${m}-${y}`,
            `${Number(d)} ${shortMonth} ${y}`,
            `${Number(d)} ${longMonth} ${y}`,
            `${String(d).padStart(2,"0")} ${shortMonth} ${y}`,
            `${String(d).padStart(2,"0")} ${longMonth} ${y}`,
            `${shortMonth} ${Number(d)}, ${y}`,
            `${longMonth} ${Number(d)}, ${y}`,
            `${shortMonth} ${Number(d)} ${y}`,
            `${longMonth} ${Number(d)} ${y}`,
            `${Number(d)}/${Number(m)}/${y}`,
            `${Number(d)}-${Number(m)}-${y}`,
          ].map(compact);
          const hourStr = String(startHour).padStart(2, "0");
          const hasTimeMatch = (text: string) => new RegExp(`(^|\\D)0?${startHour}\\s*(?::|h)\\s*00(\\D|$)`, "i").test(text);
          const hasCourtMatch = (text: string) => {
            const escapedCourt = String(court).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return new RegExp(`\\bcourt\\s*(?:no\\.?|number|#)?\\s*${escapedCourt}\\b`, "i").test(text)
              || new RegExp(`\\bcrt\\s*${escapedCourt}\\b`, "i").test(text)
              || new RegExp(`\\bsquash(?:\\s+court)?\\s*${escapedCourt}\\b`, "i").test(text)
              || new RegExp(`(^|\\s)#\\s*${escapedCourt}(\\s|$)`, "i").test(text);
          };

          // GoBook's /Bookings/Client page is mostly an accordion shell; the
          // bookings table is loaded by its inline scripts. Start with the shell
          // and discover the real AJAX URLs from its own script instead of only
          // relying on hard-coded guesses.
          const bookingPagePaths = [
            "/Bookings/Client",
            "/Bookings/ClientUpcoming",
            "/Bookings/ClientPast",
            "/Bookings/GetClientBookings",
            "/Bookings/GetBookings",
            "/Bookings/List",
            "/Bookings/UpcomingBookings",
            "/Bookings/Upcoming",
            "/Bookings/PastBookings",
            "/Bookings/Past",
            "/Bookings",
            "/Bookings/Index",
            "/MyBookings",
            "/Bookings/MyBookings",
            "/Home/MyBookings",
            "/Accounts/Bookings",
          ];
          let myHtml = "";
          const pageProbes: Array<{ path: string; status: number; finalUrl: string; hasAccepted: boolean; hasCourt: boolean; hasDate: boolean; htmlLen: number; hasBid: boolean }> = [];
          const combinedParts: string[] = [];
          const addBookingPath = (raw: string | null | undefined) => {
            if (!raw) return;
            let path = raw.replace(/&amp;/g, "&").trim();
            if (!path || /^(?:javascript:|#|mailto:)/i.test(path)) return;
            if (/^https?:\/\//i.test(path)) {
              try {
                const u = new URL(path);
                if (u.origin !== GOBOOK_BASE) return;
                path = `${u.pathname}${u.search}`;
              } catch {
                return;
              }
            }
            if (!path.startsWith("/")) path = `/${path}`;
            if (!/book/i.test(path) || /\.(?:css|js|png|jpg|jpeg|gif|ico)(?:\?|$)/i.test(path)) return;
            if (!bookingPagePaths.includes(path)) bookingPagePaths.push(path);
          };
          const discoverBookingPaths = (html: string) => {
            for (const re of [
              /\b(?:url|href|action)\s*[:=]\s*["']([^"']*book[^"']*)["']/gi,
              /\.(?:load|get|post)\s*\(\s*["']([^"']*book[^"']*)["']/gi,
              /["'](\/[^"']*book[^"']*)["']/gi,
            ]) {
              let match: RegExpExecArray | null;
              while ((match = re.exec(html)) !== null) addBookingPath(match[1]);
            }
          };
          for (let i = 0; i < bookingPagePaths.length; i++) {
            const path = bookingPagePaths[i];
            const myRes = await fetch(`${GOBOOK_BASE}${path}`, {
              headers: {
                cookie: cookieHeader(jar),
                "User-Agent": "SquashHub/1.0 (+squashhub.co.za)",
                "Referer": `${GOBOOK_BASE}/Bookings/Client`,
                "X-Requested-With": "XMLHttpRequest",
                "Accept": "text/html, */*; q=0.01",
              },
              redirect: "follow",
            });
            jarFromHeaders(myRes.headers, jar);
            const html = await myRes.text();
            discoverBookingPaths(html);
            const probeCompact = compact(html);
            const probePlain = plain(html);
            const hasAccepted = /accepted/i.test(probePlain);
            const hasCourt = hasCourtMatch(probePlain);
            const hasDate = datePatterns.some((p) => probeCompact.includes(p));
            const hasBid = /(bid=|bookingid|\/Bookings\/Details)/i.test(html);
            pageProbes.push({ path, status: myRes.status, finalUrl: myRes.url, hasAccepted, hasCourt, hasDate, htmlLen: html.length, hasBid });
            if (myRes.status === 200 && hasBid) {
              combinedParts.push(html);
            }
          }
          const decodeBookingMarkup = (html: string) => {
            const entityDecoded = html
              .replace(/&quot;|&#34;|&#x22;/gi, '"')
              .replace(/&#39;|&#x27;/gi, "'")
              .replace(/&amp;/gi, "&");
            try {
              return `${entityDecoded}\n${decodeURIComponent(entityDecoded)}`;
            } catch {
              return entityDecoded;
            }
          };
          myHtml = combinedParts.map(decodeBookingMarkup).join("\n<!--gobook-split-->\n");


          // Pull every bid candidate with a window of surrounding HTML to match against.
          const bidRegex = /(?:bid\s*[=:?&]\s*|bookingid["'\s:=,]+|bookingid\s*[=:]\s*|booking(?:id)?[,(:\s'"]+|\/Bookings\/Details\/?(?:\?bid=|\?BookingId=)?)(\d+)/gi;
          const candidates: Array<{ bid: string; score: number; snippet: string; hasDate: boolean; hasTime: boolean; hasCourt: boolean }> = [];
          const seen = new Set<string>();
          let mm: RegExpExecArray | null;
          while ((mm = bidRegex.exec(myHtml)) !== null) {
            const bid = mm[1];
            if (seen.has(bid)) continue;
            seen.add(bid);
            const start = Math.max(0, mm.index - 2000);
            const end = Math.min(myHtml.length, mm.index + 2000);
            const snippet = myHtml.slice(start, end);
            const lower = plain(snippet);
            const compactSnippet = compact(snippet);
            const hasDate = datePatterns.some((p) => compactSnippet.includes(p));
            const hasTime = hasTimeMatch(lower);
            const hasCourt = hasCourtMatch(lower);
            // Only penalize when the row shows the past-tense status "Cancelled"
            // (double-L). Plain "Cancel" appears on every active row as the
            // action button and must not disqualify a real booking.
            const cancelled = /\bcancelled\b/i.test(plain(snippet));
            const score = (hasDate ? 4 : 0) + (hasTime ? 3 : 0) + (hasCourt ? 2 : 0) - (cancelled ? 8 : 0);
            candidates.push({ bid, score, snippet: snippet.slice(0, 400), hasDate, hasTime, hasCourt });
          }

          // GoBook's Upcoming Bookings table sometimes places the booking id in
          // a far-right action cell, so also score whole <tr> rows rather than
          // only a small window around the id.
          const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
          const rowSeen = new Set<string>();
          let rowMatch: RegExpExecArray | null;
          while ((rowMatch = rowRegex.exec(myHtml)) !== null) {
            const rowHtml = rowMatch[1];
            const bidMatch = rowHtml.match(/(?:bid\s*[=:?&]\s*|bookingid["'\s:=,]+|bookingid\s*[=:]\s*|booking(?:id)?[,(:\s'"]+|\/Bookings\/Details\/?(?:\?bid=|\?BookingId=)?)(\d+)/i);
            if (!bidMatch?.[1] || rowSeen.has(bidMatch[1])) continue;
            const lower = plain(rowHtml);
            if (/\bcancelled\b/i.test(lower)) continue;
            const compactRow = compact(rowHtml);
            const hasDate = datePatterns.some((p) => compactRow.includes(p));
            const hasTime = hasTimeMatch(lower);
            const hasCourt = hasCourtMatch(lower);
            const accepted = /accepted/i.test(lower);
            const score = (hasDate ? 4 : 0) + (hasTime ? 3 : 0) + (hasCourt ? 3 : 0) + (accepted ? 2 : 0);
            candidates.push({ bid: bidMatch[1], score, snippet: lower.slice(0, 400), hasDate, hasTime, hasCourt });
            rowSeen.add(bidMatch[1]);
          }
          candidates.sort((a, b) => b.score - a.score);

          // Accept a candidate if it matches time + (court OR date) — GoBook's
          // MyBookings rows always include all three, but the date label
          // wording sometimes drifts (locale, "Tomorrow", etc.).
          const best = candidates[0];
          const acceptable = !!best && best.hasTime && (best.hasCourt || best.hasDate) && best.score >= 5;
          if (!acceptable) {
            console.log("gobook cancel: no match", JSON.stringify({
              date, startHour, court,
              pageProbes,
              top_candidates: candidates.slice(0, 8),
              preview: myHtml.slice(0, 8000),
            }));
            return json({
              error: `Couldn't find a matching GoBook booking for ${date} ${hourStr}:00 on Court #${court}. The booking may already be cancelled on GoBook, or the GoBook page format may have changed — please cancel directly on gobook.co.za and let us know.`,
              candidates: candidates.slice(0, 5),
              checked_pages: pageProbes,
              my_bookings_preview: myHtml.slice(0, 4000),
            }, 404);
          }

          const bookingId = best.bid;

          // GoBook's real cancel request (captured from the browser) posts
          // directly to /Bookings/Maintain from /Bookings/Client with
          // BookingId as a STRING, ClientNotes set to the booker's name, and
          // no anti-forgery token.
          const payload: Record<string, string> = {
            BookingId: String(bookingId),
            ClientNotes: String(body.client_notes || "Cancelled via SquashHub"),
            FocusedControl: "Cancel",
          };
          const cancelRes = await fetch(`${GOBOOK_BASE}/Bookings/Maintain`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=UTF-8",
              "Accept": "*/*",
              "X-Requested-With": "XMLHttpRequest",
              "Referer": `${GOBOOK_BASE}/Bookings/Client`,
              "User-Agent": "SquashHub/1.0 (+squashhub.co.za)",
              cookie: cookieHeader(jar),
            },
            body: JSON.stringify(payload),
          });
          jarFromHeaders(cancelRes.headers, jar);
          const cancelBody = await cancelRes.text();

          if (!cancelRes.ok) {
            return json({
              error: "GoBook rejected the cancellation.",
              status: cancelRes.status,
              response: cancelBody.slice(0, 1000),
              booking_id: bookingId,
            }, 502);
          }

          // STEP 3 — verify by re-fetching MyBookings; the same bid should now
          // be marked Cancelled (or the row removed).
          let verified = false;
          let verifyPreview = "";
          for (let attempt = 0; attempt < 3 && !verified; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 700));
            const vRes = await fetch(`${GOBOOK_BASE}/MyBookings`, {
              headers: {
                cookie: cookieHeader(jar),
                "User-Agent": "SquashHub/1.0 (+squashhub.co.za)",
                "Referer": `${GOBOOK_BASE}/`,
              },
              redirect: "follow",
            });
            jarFromHeaders(vRes.headers, jar);
            const vHtml = await vRes.text();
            const idx = vHtml.indexOf(`bid=${bookingId}`);
            if (idx === -1) {
              verified = true; // row gone entirely
              break;
            }
            const window2 = vHtml.slice(Math.max(0, idx - 800), Math.min(vHtml.length, idx + 800));
            verifyPreview = window2.slice(0, 600);
            if (/\bcancelled\b/i.test(plain(window2))) {
              verified = true;
              break;
            }
          }

          if (!verified) {
            return json({
              error: "GoBook accepted the cancel request but the booking still appears active when we re-checked. Please refresh gobook.co.za to confirm.",
              booking_id: bookingId,
              response: cancelBody.slice(0, 500),
              verify_preview: verifyPreview,
            }, 502);
          }

          // Mirror the cancellation locally.
          await adminClient
            .from("bookings")
            .delete()
            .eq("source", "gobook")
            .eq("date", date)
            .eq("start_time", `${String(startHour).padStart(2, "0")}:00:00`)
            .eq("external_id", `${dateToGoBookKeyDate(date)}-${court}-${String(startHour).padStart(2, "0")}`);

          return json({ ok: true, verified: true, booking_id: bookingId, match_score: best.score });
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

        const gridAttempts: Array<{ label: string; grid: Awaited<ReturnType<typeof fetchGrid>> }> = [];
        const tryGrid = async (label: string, gridCourt: number | "any", key?: string) => {
          const grid = await fetchGrid(jar, date, gridCourt, key);
          gridAttempts.push({ label: `${label}:${grid.urlKey}`, grid });
          return grid;
        };

        // Probe the live GoBook grids that can expose a bookable checkbox. The
        // local SquashHub grid may be stale, so only a real GoBook checkbox wins.
        let firstGrid = courtPref === "any"
          ? await tryGrid("any", "any")
          : await tryGrid("court-tab", courtPref, String(courtPref));
        let rows = firstGrid.rows;
        let courtCount = firstGrid.courtCount;
        let targetRow = rows.find((r) => r.startHour === startHour);
        let chosen = null as
          | { courtNumber: number; slotId: string; providerConsultantId: string | null }
          | null;
        if (targetRow) {
          if (courtPref === "any") {
            const free = targetRow.courts.find((c) => c.free && c.slotId);
            if (free) {
              chosen = { courtNumber: free.courtNumber, slotId: free.slotId!, providerConsultantId: free.providerConsultantId };
            }
          } else {
            const free = targetRow.courts.length === 1
              ? targetRow.courts.find((c) => c.free && c.slotId)
              : targetRow.courts.find((c) => c.courtNumber === courtPref && c.free && c.slotId);
            if (free) chosen = { courtNumber: courtPref as number, slotId: free.slotId!, providerConsultantId: free.providerConsultantId };
          }
        }
        // Fallbacks: GoBook sometimes exposes availability only on the combined
        // grid, and some installations use ProviderConsultantId keys for tabs.
        if (!chosen && courtPref !== "any") {
          const providerKey = CSIR_COURT_CONSULTANT_IDS.get(courtPref);
          if (providerKey) {
            const providerGrid = await tryGrid("provider-tab", courtPref, providerKey);
            const providerRow = providerGrid.rows.find((r) => r.startHour === startHour);
            const free = providerRow?.courts.length === 1
              ? providerRow.courts.find((c) => c.free && c.slotId)
              : providerRow?.courts.find((c) => c.courtNumber === courtPref && c.free && c.slotId);
            if (free) {
              rows = providerGrid.rows;
              courtCount = providerGrid.courtCount;
              targetRow = providerRow;
              chosen = { courtNumber: courtPref, slotId: free.slotId!, providerConsultantId: free.providerConsultantId };
            } else if (!targetRow && providerRow) {
              targetRow = providerRow;
            }
          }
        }
        if (!chosen && courtPref !== "any") {
          const combined = await tryGrid("combined", "any");
          const combinedRow = combined.rows.find((r) => r.startHour === startHour);
          const free = combinedRow?.courts.find((c) => c.courtNumber === courtPref && c.free && c.slotId);
          if (free) {
            rows = combined.rows;
            courtCount = combined.courtCount;
            targetRow = combinedRow;
            chosen = { courtNumber: courtPref, slotId: free.slotId!, providerConsultantId: free.providerConsultantId };
          } else if (!targetRow) {
            targetRow = combinedRow;
          }
        }
        if (!targetRow) {
          return json(
            {
              error:
                `No grid row found for hour ${startHour}:00. GoBook returned ${rows.length} rows.`,
              available_hours: rows.map((r) => r.startHour),
              checked_grids: gridAttempts.map((a) => ({ label: a.label, rows: a.grid.rows.length, court_count: a.grid.courtCount })),
            },
            400,
          );
        }
        if (!chosen) {
          console.warn("gobook-book no live checkbox", JSON.stringify({
            date,
            startHour,
            courtPref,
            checked_grids: gridAttempts.map((a) => ({ label: a.label, rows: a.grid.rows.length, court_count: a.grid.courtCount })),
            row: targetRow,
          }).slice(0, 3000));
          return json({
            error: `No free slot at ${startHour}:00 ${
              courtPref === "any" ? "on any court" : `on Court #${courtPref}`
            }`,
            row: targetRow,
            court_count: courtCount,
            checked_grids: gridAttempts.map((a) => ({ label: a.label, rows: a.grid.rows.length, court_count: a.grid.courtCount })),
            hint: "GoBook's grid did not expose a bookable checkbox for this slot. The slot may be locked/closed at this hour, already booked, or too close to the current time for online booking.",
          }, 409);
        }

        const memberPin = String((row as { gobook_pin?: string | null }).gobook_pin || "").trim();
        const membershipNumber = String(
          (row as { court_manager_membership_number?: string | null })
            .court_manager_membership_number || "",
        ).trim();
        if (!memberPin) {
          return json({
            error: "GoBook requires a PIN to confirm bookings. Save your GoBook PIN in your account settings and try again.",
            hint: "Open My Account → GoBook Login → enter the PIN you set on gobook.co.za.",
          }, 400);
        }
        if (!membershipNumber) {
          return json({
            error: "GoBook requires your CSIR Court Manager membership number. Save it in your account settings and try again.",
            hint: "Open My Account → GoBook Login → enter your Court Manager membership number.",
          }, 400);
        }
        const result = await postBooking(jar, {
          BookingDate: dateToGoBookBookingDate(date),
          PSSTIds: chosen.slotId,
          ProviderConsultantId: chosen.providerConsultantId || CSIR_COURT_CONSULTANT_IDS.get(chosen.courtNumber) || ANY_COURT_CONSULTANT_ID,
          Notes: notes,
          ConfirmViaSMS: sms,
          ConfirmViaEmail: email,
          Pin: memberPin,
          MembershipNumber: membershipNumber,
        });
        if (!result.ok) {
          console.warn("gobook-book insert rejected", JSON.stringify({
            date,
            startHour,
            court: chosen.courtNumber,
            slot_id: chosen.slotId,
            provider: chosen.providerConsultantId || CSIR_COURT_CONSULTANT_IDS.get(chosen.courtNumber) || ANY_COURT_CONSULTANT_ID,
            status: result.status,
            response: result.bodyText.slice(0, 1000),
          }).slice(0, 3000));
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
