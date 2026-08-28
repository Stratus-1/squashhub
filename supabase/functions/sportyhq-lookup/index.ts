// SportyHQ public lookup — no SportyHQ login required.
// Actions:
//   search  { q }                        -> candidate players (name, club, location)
//   fetch   { path | sportyhq_user_id }  -> parsed public profile (rating, rankings, clubs)
//   save    { profile, person_id?, club_member_id? } -> upsert into sportyhq_profiles
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const BASE = "https://www.sportyhq.com";

interface Candidate {
  sportyhq_user_id: number;
  name: string;
  club_label: string | null;
  location_label: string | null;
  profile_path: string;
  photo: string | null;
}

async function search(q: string): Promise<Candidate[]> {
  const res = await fetch(`${BASE}/search2/user`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${BASE}/user/compare`,
    },
    body: new URLSearchParams({ q, ignore_discipline: "true", exclude_self: "false" }),
  });
  if (!res.ok) throw new Error(`SportyHQ search failed [${res.status}]: ${await res.text()}`);
  const json = await res.json();
  return (json.results ?? [])
    .filter((r: any) => r.id && r.link)
    .map((r: any) => ({
      sportyhq_user_id: Number(r.id),
      name: String(r.name ?? "").replace(/\s+/g, " ").trim(),
      club_label: r.sub ?? null,
      location_label: r.sub_2 ?? null,
      profile_path: String(r.link),
      photo: r.photo ?? null,
    }));
}

function textOf(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return stripped
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function fetchProfile(path: string) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`SportyHQ profile failed [${res.status}]`);
  const html = await res.text();
  const t = textOf(html);
  if (/This user profile no longer exists/i.test(t)) throw new Error("Profile not found on SportyHQ");

  const rating = num(t.match(/([\d,]+)\s*SportyHQ Rating/i)?.[1] ?? undefined);
  const confidence = num(t.match(/(\d+)%\s*Rating Confidence/i)?.[1] ?? undefined);
  const ytd = num(t.match(/(\d+)\s*Matches YTD/i)?.[1] ?? undefined);
  const allTime = num(t.match(/(\d+)\s*Matches All Time/i)?.[1] ?? undefined);

  // Rankings table rows: "<Ranking name> <Owner> <System> <Position> <People> <Points>"
  const rankings: Array<Record<string, unknown>> = [];
  const rankBlock = t.match(/Rankings Name Owner Rating System Position People Points (.*?)(?:More about|Affiliated|Tournament History|$)/i)?.[1];
  if (rankBlock) {
    const rowRe = /([A-Za-z][A-Za-z'&\-\s]+?)\s+(Custom|SportyHQ)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/g;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(rankBlock))) {
      rankings.push({
        label: m[1].trim(),
        system: m[2],
        position: num(m[3]),
        people: num(m[4]),
        points: num(m[5]),
      });
    }
  }

  const bodiesRaw = (t.match(/Affiliated Governing Bodies (.*?)(?:Affiliated Clubs|Tournament History|$)/i)?.[1] ?? "").trim();
  const bodies = bodiesRaw ? [bodiesRaw] : [];
  const clubs = (t.match(/Affiliated Clubs (.*?)(?:Tournament History|\d+ people have viewed|$)/i)?.[1] ?? "")
    .trim();

  const name = t.match(/Create account (.*?) (?:Add Friend|Following|Fans|Overview)/i)?.[1]?.trim() ?? null;

  return {
    profile_path: path,
    name,
    rating,
    rating_confidence: confidence,
    matches_ytd: ytd,
    matches_all_time: allTime,
    rankings,
    governing_bodies: bodies,
    clubs: clubs ? [clubs] : [],
    fetched_at: new Date().toISOString(),
  };
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

function clubScore(candidate: string | null, hint: string | null) {
  if (!candidate || !hint) return 0;
  const a = new Set(norm(candidate).split(" ").filter((w) => w.length > 3 && w !== "squash" && w !== "club"));
  const b = norm(hint).split(" ").filter((w) => w.length > 3 && w !== "squash" && w !== "club");
  return b.some((w) => a.has(w)) ? 1 : 0;
}

function pickBest(name: string, clubHint: string | null, cands: Candidate[]) {
  const target = norm(name);
  const exact = cands.filter((c) => norm(c.name) === target);
  const pool = exact.length ? exact : [];
  if (!pool.length) return null;
  if (pool.length === 1) return { candidate: pool[0], confident: true };
  const scored = pool
    .map((c) => ({ c, s: clubScore(c.club_label, clubHint) + clubScore(c.location_label, clubHint) }))
    .sort((x, y) => y.s - x.s);
  if (scored[0].s > 0 && (scored.length === 1 || scored[0].s > scored[1].s)) {
    return { candidate: scored[0].c, confident: true };
  }
  return { candidate: scored[0].c, confident: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "search");


    if (action === "search") {
      const q = String(body.q ?? "").trim();
      if (q.length < 3) throw new Error("Enter at least 3 characters");
      return json({ results: await search(q) });
    }

    if (action === "fetch") {
      const path = String(body.path ?? "");
      if (!path) throw new Error("path is required");
      return json({ profile: await fetchProfile(path) });
    }

    if (action === "save") {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      // Only platform admins may persist links
      const authHeader = req.headers.get("Authorization") ?? "";
      const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "Not signed in" }, 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) return json({ error: "Platform admin only" }, 403);

      const p = body.profile ?? {};
      const row = {
        sportyhq_user_id: Number(body.sportyhq_user_id ?? p.sportyhq_user_id),
        name: String(body.name ?? p.name ?? "").trim(),
        profile_path: String(p.profile_path ?? body.path ?? ""),
        club_label: body.club_label ?? null,
        location_label: body.location_label ?? null,
        rating: p.rating ?? null,
        rating_confidence: p.rating_confidence ?? null,
        matches_ytd: p.matches_ytd ?? null,
        matches_all_time: p.matches_all_time ?? null,
        rankings: p.rankings ?? [],
        governing_bodies: p.governing_bodies ?? [],
        clubs: p.clubs ?? [],
        person_id: body.person_id ?? null,
        club_member_id: body.club_member_id ?? null,
        verified_by: uid,
        verified_at: new Date().toISOString(),
        fetched_at: new Date().toISOString(),
      };
      if (!row.sportyhq_user_id || !row.name) throw new Error("sportyhq_user_id and name are required");

      const { data, error } = await supabase
        .from("sportyhq_profiles")
        .upsert(row, { onConflict: "sportyhq_user_id" })
        .select()
        .single();
      if (error) throw error;
      return json({ profile: data });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    console.error("sportyhq-lookup error:", e);
    return json({ error: (e as Error).message }, 400);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
