// NSA captain credential + result submission service.
//
// Actions (POST JSON body, field "action"):
//   save_credentials     { club_member_id, nsa_username, nsa_password }
//   delete_credentials   { club_member_id }
//   get_credentials_meta { club_member_id }                      -> { has_credentials, nsa_username, last_verified_at, last_verification_status }
//   verify_credentials   { club_member_id }                      -> logs into NSA to confirm creds work
//   list_editable        { club_member_id }                      -> array of fixtures captain can edit
//   submit_result        { club_member_id, fixture_id, matches, mode: "check" | "commit" }
//
// matches is an array of exactly 4 entries:
//   { home_nsf: "NSF1234", away_nsf: "NSF5678", games: [[h,a],[h,a],[h,a],[h,a],[h,a]] }
// (Empty/unplayed games -> [null,null] or omit; max 5 games, best of 5.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NSA_BASE = "https://admin.northerns.co.za";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- AES-GCM helpers (key = base64-encoded 32 bytes) ----------
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("NSA_CRED_KEY");
  if (!raw) throw new Error("NSA_CRED_KEY not configured");
  const keyBytes = b64ToBytes(raw);
  if (keyBytes.length !== 32) throw new Error("NSA_CRED_KEY must be 32 bytes (base64)");
  return await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
async function encryptPassword(plain: string) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
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

// ---------- NSA HTTP helpers ----------
function parseSetCookie(headers: Headers): string | null {
  // Deno exposes set-cookie via getSetCookie() in newer runtimes, fallback to raw header.
  // deno-lint-ignore no-explicit-any
  const anyH = headers as any;
  let cookies: string[] = [];
  if (typeof anyH.getSetCookie === "function") cookies = anyH.getSetCookie();
  else {
    const raw = headers.get("set-cookie");
    if (raw) cookies = [raw];
  }
  for (const c of cookies) {
    const m = c.match(/NSFSESSION=([^;]+)/);
    if (m) return `NSFSESSION=${m[1]}`;
  }
  return null;
}

async function nsaLogin(uname: string, passwd: string): Promise<string> {
  const body = new URLSearchParams({ uname, passwd }).toString();
  const res = await fetch(`${NSA_BASE}/login.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
  });
  const cookie = parseSetCookie(res.headers);
  if (!cookie) throw new Error("NSA login failed (no session cookie returned)");
  // Verify by fetching a page that requires auth
  const check = await fetch(`${NSA_BASE}/index.php`, { headers: { cookie } });
  const html = await check.text();
  if (!/now logged in|Log Out|logout/i.test(html)) {
    throw new Error("NSA login failed (credentials rejected)");
  }
  return cookie;
}

async function nsaLogout(cookie: string) {
  try {
    await fetch(`${NSA_BASE}/logout.php`, { headers: { cookie } });
  } catch (_) { /* ignore */ }
}

async function nsaListEditable(cookie: string): Promise<number[]> {
  const res = await fetch(`${NSA_BASE}/nsa/fixtures.php`, { headers: { cookie } });
  const html = await res.text();
  const ids = new Set<number>();
  const re = /fixtureinput\.php\?fixture=(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) ids.add(Number(m[1]));
  return [...ids];
}

function buildScorecardBody(matches: Array<{
  home_nsf: string;
  away_nsf: string;
  games: Array<[number | null, number | null] | null>;
}>, mode: "check" | "commit"): string {
  const params = new URLSearchParams();
  for (let i = 0; i < 4; i++) {
    const m = matches[i] ?? { home_nsf: "", away_nsf: "", games: [] };
    const mi = i + 1;
    params.set(`m${mi}p1`, m.home_nsf || "");
    params.set(`m${mi}p2`, m.away_nsf || "");
    for (let g = 0; g < 5; g++) {
      const game = m.games?.[g];
      const h = game && game[0] != null ? String(game[0]) : "";
      const a = game && game[1] != null ? String(game[1]) : "";
      params.set(`m${mi}p1s${g + 1}`, h);
      params.set(`m${mi}p2s${g + 1}`, a);
    }
  }
  params.set("upl_type", mode === "commit" ? "Commit" : "Check Only");
  return params.toString();
}

function summariseResponse(html: string): {
  ok: boolean;
  errors: string[];
  notes: string[];
  title: string | null;
} {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;
  // Strip tags for crude scan
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const errors: string[] = [];
  const notes: string[] = [];
  // Heuristics — NSA returns the form again on errors with messages, or a confirmation page on commit.
  const errPatterns = [
    /not\s+a\s+valid/i,
    /invalid/i,
    /error/i,
    /must\s+be/i,
    /not\s+permitted/i,
    /not\s+allowed/i,
    /no\s+such/i,
  ];
  for (const re of errPatterns) {
    const m = text.match(new RegExp(`[^.]{0,80}${re.source}[^.]{0,80}`, "i"));
    if (m) errors.push(m[0].trim());
  }
  if (/successfully|saved|committed|uploaded/i.test(text)) {
    const m = text.match(/[^.]{0,80}(successfully|saved|committed|uploaded)[^.]{0,80}/i);
    if (m) notes.push(m[0].trim());
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)].slice(0, 5), notes, title };
}

// ---------- Edge function ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(SUPABASE_URL, SERVICE);

    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const clubMemberId = body.club_member_id as string | undefined;

    // Validate the user owns the club_member_id for any action that needs it
    if (clubMemberId) {
      const { data: cm, error: cmErr } = await adminClient
        .from("club_members")
        .select("id, user_id")
        .eq("id", clubMemberId)
        .maybeSingle();
      if (cmErr) return json({ error: cmErr.message }, 500);
      if (!cm || cm.user_id !== userId) return json({ error: "Not your member record" }, 403);
    }

    switch (action) {
      case "save_credentials": {
        const username = String(body.nsa_username || "").trim();
        const password = String(body.nsa_password || "");
        if (!username || !password) return json({ error: "Missing username/password" }, 400);
        if (!/^NSF\d+$/i.test(username)) return json({ error: "NSA username must look like NSF1234" }, 400);

        // Verify with NSA before saving
        let cookie: string;
        try {
          cookie = await nsaLogin(username.toUpperCase(), password);
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
        await nsaLogout(cookie);

        const { ciphertext, iv } = await encryptPassword(password);
        const { error: upErr } = await adminClient
          .from("member_nsa_credentials")
          .upsert({
            club_member_id: clubMemberId,
            user_id: userId,
            nsa_username: username.toUpperCase(),
            nsa_password_ciphertext: ciphertext,
            nsa_password_iv: iv,
            last_verified_at: new Date().toISOString(),
            last_verification_status: "ok",
          }, { onConflict: "club_member_id" });
        if (upErr) return json({ error: upErr.message }, 500);
        return json({ ok: true, verified: true });
      }

      case "delete_credentials": {
        const { error } = await adminClient
          .from("member_nsa_credentials")
          .delete()
          .eq("club_member_id", clubMemberId);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "get_credentials_meta": {
        const { data, error } = await adminClient
          .from("member_nsa_credentials")
          .select("nsa_username, last_verified_at, last_verification_status")
          .eq("club_member_id", clubMemberId)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        return json({
          has_credentials: !!data,
          nsa_username: data?.nsa_username ?? null,
          last_verified_at: data?.last_verified_at ?? null,
          last_verification_status: data?.last_verification_status ?? null,
        });
      }

      case "verify_committed": {
        // Re-fetch a single fixture from NSA's public feed and confirm status === "completed".
        // body: { fixture_id, league? (defaults s79) }
        const fixtureId = Number(body.fixture_id);
        const leagueParam = String(body.league || "s79");
        if (!fixtureId) return json({ error: "fixture_id required" }, 400);
        try {
          const url = `${NSA_BASE}/fixtures.php?league=${encodeURIComponent(leagueParam)}&status=completed&json`;
          const res = await fetch(url, { headers: { Accept: "application/json" } });
          const text = await res.text();
          let parsed: any = null;
          try { parsed = JSON.parse(text); } catch (_) { /* ignore */ }
          const list: any[] = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];
          const match = list.find((f) => Number(f.id) === fixtureId);
          if (!match) {
            return json({ ok: false, found: false, message: "Fixture not found in NSA completed feed yet" });
          }
          return json({
            ok: String(match.status || "").toLowerCase() === "completed",
            found: true,
            status: match.status,
            fixture_id: fixtureId,
          });
        } catch (e) {
          return json({ error: (e as Error).message }, 500);
        }
      }

      case "verify_credentials":
      case "list_editable":
      case "submit_result": {
        const { data: row, error: rErr } = await adminClient
          .from("member_nsa_credentials")
          .select("nsa_username, nsa_password_ciphertext, nsa_password_iv")
          .eq("club_member_id", clubMemberId)
          .maybeSingle();
        if (rErr) return json({ error: rErr.message }, 500);
        if (!row) return json({ error: "No NSA credentials saved for this captain" }, 400);

        const password = await decryptPassword(row.nsa_password_ciphertext, row.nsa_password_iv);
        let cookie: string;
        try {
          cookie = await nsaLogin(row.nsa_username, password);
        } catch (e) {
          await adminClient
            .from("member_nsa_credentials")
            .update({ last_verification_status: "invalid", last_verified_at: new Date().toISOString() })
            .eq("club_member_id", clubMemberId);
          return json({ error: (e as Error).message }, 400);
        }
        await adminClient
          .from("member_nsa_credentials")
          .update({ last_verification_status: "ok", last_verified_at: new Date().toISOString() })
          .eq("club_member_id", clubMemberId);

        try {
          if (action === "verify_credentials") {
            return json({ ok: true, nsa_username: row.nsa_username });
          }
          if (action === "list_editable") {
            const ids = await nsaListEditable(cookie);
            return json({ ok: true, editable_fixture_ids: ids });
          }
          // submit_result
          const fixtureId = Number(body.fixture_id);
          const mode = body.mode === "commit" ? "commit" : "check";
          const matches = Array.isArray(body.matches) ? body.matches : [];
          if (!fixtureId) return json({ error: "fixture_id required" }, 400);

          const editable = await nsaListEditable(cookie);
          if (!editable.includes(fixtureId)) {
            return json({ error: `Captain cannot edit fixture ${fixtureId}` }, 403);
          }

          const formBody = buildScorecardBody(matches, mode);
          const submit = await fetch(
            `${NSA_BASE}/nsa/fixtureinput.php?fixture=${fixtureId}`,
            {
              method: "POST",
              headers: {
                cookie,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: formBody,
            },
          );
          const html = await submit.text();
          const summary = summariseResponse(html);
          return json({
            ok: summary.ok,
            mode,
            fixture_id: fixtureId,
            errors: summary.errors,
            notes: summary.notes,
            title: summary.title,
          });
        } finally {
          await nsaLogout(cookie);
        }
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("nsa-submit-result error:", e);
    return json({ error: (e as Error).message ?? "Internal error" }, 500);
  }
});
