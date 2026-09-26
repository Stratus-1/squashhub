// Duplicate-registration safeguard + phone-verified account recovery.
// Platform-wide (all clubs / associations / federation); called before any
// self-registration creates a person.
//
//   check       {name, phone}  -> { level: exact|phone|name|none }   (reveals no names/emails)
//   send_code   {phone}        -> SMS one-time code to the number on file
//   verify_code {phone, code}  -> only now: emails of accounts with that cell
//
// Never merges people. Codes are hashed, expire in 10 min, max 5 attempts,
// rate-limited per number and per IP.
import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyMatch, maskPhone, nameParts, phoneTail, revealableAccounts } from "../_shared/person-match.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function sha(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const URL_ = Deno.env.get("SUPABASE_URL")!;
    const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(URL_, KEY, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const name = String(body?.name || "").slice(0, 120);
    const phone = String(body?.phone || "").slice(0, 30);
    const tail = phoneTail(phone);
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    const pepper = KEY.slice(-24);

    const candidates = async (withName: boolean) => {
      const { first, last } = withName ? nameParts(name) : { first: "", last: "" };
      const { data, error } = await admin.rpc("person_match_candidates", { _phone_tail: tail ?? "", _first: first, _last: last });
      if (error) throw error;
      return (data ?? []) as Array<{ source: string; id: string; club_id: string | null; name: string | null; phone: string | null; email: string | null; user_id: string | null }>;
    };

    if (action === "check") {
      if (!tail && !nameParts(name).last) return json({ level: "none" });
      const level = classifyMatch({ name, phone }, await candidates(true));
      return json({ level });
    }

    if (action === "send_code") {
      if (!tail) return json({ error: "Please enter a valid cell number" }, 400);
      const since = new Date(Date.now() - 15 * 60_000).toISOString();
      const [{ count: perPhone }, { count: perIp }] = await Promise.all([
        admin.from("account_recovery_codes").select("id", { count: "exact", head: true }).eq("phone_tail", tail).gte("created_at", since),
        ip ? admin.from("account_recovery_codes").select("id", { count: "exact", head: true }).eq("requester_ip", ip).gte("created_at", new Date(Date.now() - 3600_000).toISOString())
           : Promise.resolve({ count: 0 } as any),
      ]);
      if ((perPhone ?? 0) >= 3 || (perIp ?? 0) >= 10) return json({ error: "Too many codes requested — please try again later." }, 429);

      const onFile = revealableAccounts(phone, await candidates(false)).filter((c) => c.phone);
      const target = onFile.find((c) => c.source === "club_member") ?? onFile[0];
      // Generic reply either way so this call cannot be used to probe numbers.
      if (!target) return json({ ok: true, sent_to: maskPhone(phone) });

      const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
      await admin.from("account_recovery_codes").update({ consumed_at: new Date().toISOString() }).eq("phone_tail", tail).is("consumed_at", null);
      await admin.from("account_recovery_codes").insert({
        phone_tail: tail, code_hash: await sha(`${tail}:${code}:${pepper}`), requester_ip: ip,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      const res = await fetch(`${URL_}/functions/v1/send-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}`, apikey: KEY },
        body: JSON.stringify({
          club_id: target.club_id, platform: !target.club_id,
          recipients: [{ member_id: target.source === "club_member" ? target.id : null, phone: target.phone }],
          body: `${code} is your SquashHub account recovery code. It expires in 10 minutes. Never share it.`,
          kind: "account_recovery", critical: true, system: true,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || (out?.sent ?? 0) < 1) {
        console.warn("account-recovery sms failed", res.status);
        return json({ error: "We couldn't send a code right now. Please contact your club or SquashHub support." }, 502);
      }
      return json({ ok: true, sent_to: maskPhone(target.phone) });
    }

    if (action === "verify_code") {
      const code = String(body?.code || "").replace(/\D/g, "");
      if (!tail || code.length !== 6) return json({ error: "Enter the 6-digit code" }, 400);
      const { data: row } = await admin.from("account_recovery_codes").select("id, code_hash, attempts, expires_at")
        .eq("phone_tail", tail).is("consumed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!row || new Date(row.expires_at).getTime() < Date.now()) return json({ error: "Code expired — request a new one." }, 400);
      if (row.attempts >= 5) return json({ error: "Too many attempts — request a new code." }, 429);
      if (row.code_hash !== await sha(`${tail}:${code}:${pepper}`)) {
        await admin.from("account_recovery_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
        return json({ error: "That code is not correct." }, 400);
      }
      await admin.from("account_recovery_codes").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

      const matches = revealableAccounts(phone, await candidates(false));
      const clubIds = [...new Set(matches.map((m) => m.club_id).filter(Boolean))] as string[];
      const { data: clubs } = clubIds.length ? await admin.from("clubs").select("id, name").in("id", clubIds) : { data: [] as any[] };
      const clubName = new Map((clubs ?? []).map((c: any) => [c.id, c.name]));
      const seen = new Map<string, { email: string; name: string | null; clubs: string[]; has_login: boolean }>();
      for (const m of matches) {
        let email = m.email;
        if (m.user_id) {
          const { data } = await admin.auth.admin.getUserById(m.user_id);
          email = data?.user?.email ?? email;
        }
        if (!email) continue;
        const k = email.toLowerCase();
        const e = seen.get(k) ?? { email, name: m.name, clubs: [], has_login: false };
        if (m.club_id && clubName.get(m.club_id) && !e.clubs.includes(clubName.get(m.club_id))) e.clubs.push(clubName.get(m.club_id));
        e.has_login ||= !!m.user_id;
        seen.set(k, e);
      }
      return json({ ok: true, accounts: [...seen.values()].slice(0, 10) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("account-recovery error", (e as Error)?.message);
    return json({ error: "Something went wrong — please try again." }, 500);
  }
});
