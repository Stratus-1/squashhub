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

  // Biographical block (same labels as the public compare view)
  const pick = (re: RegExp) => {
    const v = t.match(re)?.[1]?.trim() ?? null;
    if (!v || /^n\/?a$/i.test(v)) return null;
    return v;
  };
  const winsMatch = t.match(/([\d,]+)\s*\/\s*([\d,]+)\s*wins/i);
  const birthday = pick(/Birthday\s+(.*?)(?:\s*\(Age:|\s+Gender\b)/i);
  const age = num(t.match(/\(Age:\s*(\d+)\)/i)?.[1] ?? undefined);
  const gender = pick(/Gender\s+(Male|Female|Other)\b/i);
  const nationality = pick(/Nationality\s+(.*?)\s+(?:Left \/ Right Handed|Nickname|Occupation|Sporting Idol)/i);
  const handedness = pick(/Left \/ Right Handed\s+(Left|Right|Both|Ambidextrous)\b/i);
  const nickname = pick(/Nickname\(s\)\s+(.*?)\s+(?:Occupation|Sporting Idol|Common Ranking|Rankings)/i);
  const occupation = pick(/Occupation\s+(.*?)\s+(?:Sporting Idol|Common Ranking|Rankings|Nickname)/i);

  return {
    profile_path: path,
    name,
    rating,
    rating_confidence: confidence,
    matches_ytd: ytd,
    matches_all_time: allTime ?? num(winsMatch?.[1] ?? undefined),
    wins_all_time: num(winsMatch?.[2] ?? undefined),
    birthday,
    age,
    gender,
    nationality,
    handedness,
    nickname,
    occupation,
    rankings,
    governing_bodies: bodies,
    clubs: clubs ? [clubs] : [],
    fetched_at: new Date().toISOString(),
  };
}


function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

function clubScore(candidate: string | null, hints: string[]) {
  if (!candidate || !hints.length) return 0;
  const a = new Set(
    norm(candidate).split(" ").filter((w) => w.length > 2 && w !== "squash" && w !== "club"),
  );
  return hints.some((h) =>
    norm(h)
      .split(" ")
      .filter((w) => w.length > 2 && w !== "squash" && w !== "club")
      .some((w) => a.has(w)),
  )
    ? 1
    : 0;
}

function shallowScore(c: Candidate, hints: string[]) {
  return (
    clubScore(c.club_label, hints) * 2 +
    clubScore(c.location_label, hints) * 2 +
    // prefer real profiles over empty shells with no club/location at all
    (c.club_label || c.location_label ? 1 : 0)
  );
}

// Deep verification: SportyHQ search only shows a player's *primary* club, which is
// often stale (e.g. Samuel Van Sittert shows "Mossel Bay" but is affiliated to CSIR).
// When the shallow pass can't decide, open the top candidates' profiles and match on
// their full affiliated-club list and governing bodies (association names, e.g. NSA).
async function deepPickBest(name: string, hints: string[], cands: Candidate[]) {
  const target = norm(name);
  const pool = cands.filter((c) => norm(c.name) === target);
  if (!pool.length) return null;
  if (pool.length === 1) return { candidate: pool[0], confident: true };

  const scored = pool
    .map((c) => ({ c, s: shallowScore(c, hints) }))
    .sort((x, y) => y.s - x.s);
  if (scored[0].s > 0 && scored[0].s > (scored[1]?.s ?? -1)) {
    return { candidate: scored[0].c, confident: true };
  }

  if (!hints.length) return { candidate: scored[0].c, confident: false };

  const deep: Array<{ c: Candidate; s: number }> = [];
  for (const { c, s } of scored.slice(0, 4)) {
    try {
      const prof = await fetchProfile(c.profile_path);
      const blob = [...(prof.clubs ?? []), ...(prof.governing_bodies ?? [])].join(" ");
      const hit = clubScore(blob, hints);
      deep.push({ c, s: s + hit * 5 + (prof.rating ? 1 : 0) });
    } catch {
      deep.push({ c, s });
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  deep.sort((x, y) => y.s - x.s);
  if (deep[0].s > (deep[1]?.s ?? -1)) return { candidate: deep[0].c, confident: true };
  return { candidate: deep[0].c, confident: false };
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
        wins_all_time: p.wins_all_time ?? null,
        birthday: p.birthday ?? null,
        age: p.age ?? null,
        gender: p.gender ?? null,
        nationality: p.nationality ?? null,
        handedness: p.handedness ?? null,
        nickname: p.nickname ?? null,
        occupation: p.occupation ?? null,
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

    if (action === "bulk_match") {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const authHeader = req.headers.get("Authorization") ?? "";
      const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "Not signed in" }, 401);
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) return json({ error: "Platform admin only" }, 403);

      const limit = Math.min(Math.max(Number(body.limit ?? 20), 1), 40);
      const offset = Math.max(Number(body.offset ?? 0), 0);
      const mode = String(body.mode ?? "new"); // "new" = unlinked people, "refresh" = weak/empty existing links

      // Existing links (person_id -> profile row)
      const { data: linked } = await supabase
        .from("sportyhq_profiles")
        .select("id, person_id, sportyhq_user_id, rating, club_label, location_label")
        .not("person_id", "is", null);
      const linkedIds = new Set((linked ?? []).map((r: any) => r.person_id));
      const weak = new Map<string, any>();
      for (const r of linked ?? []) {
        const isWeak = r.rating == null && !r.club_label && !r.location_label;
        if (isWeak) weak.set(r.person_id, r);
      }

      let queue: any[] = [];
      let scanned = 0;

      if (mode === "refresh") {
        const ids = [...weak.keys()].slice(offset, offset + limit);
        scanned = ids.length;
        if (ids.length) {
          const { data: people, error: peopleErr } = await supabase
            .from("people")
            .select(
              "id, full_name, club_members(clubs!club_members_club_id_fkey(name), member_association_affiliations(league_associations(name)))",
            )
            .in("id", ids);
          if (peopleErr) throw peopleErr;
          queue = people ?? [];
        }
      } else {
        const { data: people, error: peopleErr } = await supabase
          .from("people")
          .select(
            "id, full_name, club_members(clubs!club_members_club_id_fkey(name), member_association_affiliations(league_associations(name)))",
          )
          .eq("status", "active")
          .order("full_name")
          .range(offset, offset + limit * 3);
        if (peopleErr) throw peopleErr;
        scanned = (people ?? []).length;
        queue = (people ?? []).filter((p: any) => !linkedIds.has(p.id)).slice(0, limit);
      }

      const results: Array<Record<string, unknown>> = [];


      for (const p of queue) {
        const memberships: any[] = p.club_members ?? [];
        const clubHints: string[] = [
          ...memberships.map((a: any) => a?.clubs?.name),
          ...memberships.flatMap((a: any) =>
            (a?.member_association_affiliations ?? []).map((x: any) => x?.league_associations?.name),
          ),
        ].filter(Boolean);
        try {
          const cands = await search(String(p.full_name));
          const best = await deepPickBest(String(p.full_name), clubHints, cands);

          if (!best) {
            results.push({ person_id: p.id, name: p.full_name, status: "no_match" });
          } else if (!best.confident) {
            results.push({ person_id: p.id, name: p.full_name, status: "ambiguous", candidates: cands.length });
          } else {
            const prof = await fetchProfile(best.candidate.profile_path);
            // In refresh mode, drop the stale/empty link if it pointed at another SportyHQ profile
            const previous = weak.get(p.id);
            if (previous && previous.sportyhq_user_id !== best.candidate.sportyhq_user_id) {
              await supabase.from("sportyhq_profiles").delete().eq("id", previous.id);
            }
            const { error } = await supabase.from("sportyhq_profiles").upsert(
              {
                sportyhq_user_id: best.candidate.sportyhq_user_id,
                name: best.candidate.name,
                profile_path: best.candidate.profile_path,
                club_label: best.candidate.club_label,
                location_label: best.candidate.location_label,
                rating: prof.rating,
                rating_confidence: prof.rating_confidence,
                matches_ytd: prof.matches_ytd,
                matches_all_time: prof.matches_all_time,
                wins_all_time: prof.wins_all_time,
                birthday: prof.birthday,
                age: prof.age,
                gender: prof.gender,
                nationality: prof.nationality,
                handedness: prof.handedness,
                nickname: prof.nickname,
                occupation: prof.occupation,
                rankings: prof.rankings,
                governing_bodies: prof.governing_bodies,
                clubs: prof.clubs,
                person_id: p.id,
                verified_by: uid,
                verified_at: new Date().toISOString(),
                fetched_at: new Date().toISOString(),
              },
              { onConflict: "sportyhq_user_id" },
            );
            if (error) throw error;
            results.push({ person_id: p.id, name: p.full_name, status: "saved", rating: prof.rating });
          }
        } catch (err) {
          results.push({ person_id: p.id, name: p.full_name, status: "error", message: (err as Error).message });
        }
        await new Promise((r) => setTimeout(r, 350)); // be gentle on SportyHQ
      }

      return json({
        processed: results.length,
        next_offset: mode === "refresh" ? offset + scanned : offset + scanned,
        done: mode === "refresh" ? scanned < limit : scanned <= limit * 3 && queue.length < limit,
        results,
      });

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
