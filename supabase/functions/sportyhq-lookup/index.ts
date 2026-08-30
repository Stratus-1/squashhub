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

    // auto_link — self-service: a signed-in member (or their club admin) triggers a
    // one-off SportyHQ lookup for a member who has no linked profile yet
    // (e.g. brand-new registrations that were never part of an NSA/association import).
    if (action === "auto_link") {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const authHeader = req.headers.get("Authorization") ?? "";
      const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "Not signed in" }, 401);

      const memberId = String(body.club_member_id ?? "");
      if (!memberId) throw new Error("club_member_id is required");

      const { data: member, error: memberErr } = await supabase
        .from("club_members")
        .select(
          "id, user_id, club_id, person_id, full_name, status, clubs!club_members_club_id_fkey(name), member_association_affiliations(league_associations(name))",
        )
        .eq("id", memberId)
        .maybeSingle();
      if (memberErr) throw memberErr;
      if (!member) return json({ error: "Member not found" }, 404);

      if (member.user_id !== uid) {
        const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
        let isClubAdmin = false;
        try {
          const { data } = await supabase.rpc("is_club_admin_or_permitted", {
            _club_id: (member as any).club_id,
            _user_id: uid,
            _permission: "manage_members",
          });
          isClubAdmin = data === true;
        } catch {
          isClubAdmin = false;
        }
        if (!isAdmin && !isClubAdmin) return json({ error: "Not allowed" }, 403);
      }

      // Already linked? Nothing to do.
      const orFilter = (member as any).person_id
        ? `person_id.eq.${(member as any).person_id},club_member_id.eq.${memberId}`
        : `club_member_id.eq.${memberId}`;
      const { data: existing } = await supabase
        .from("sportyhq_profiles")
        .select("id, sportyhq_user_id, rating")
        .or(orFilter)
        .limit(1)
        .maybeSingle();
      if (existing) return json({ status: "already_linked", profile: existing });

      // Throttle: max 3 automatic attempts, at most one per 7 days.
      const { data: attempt } = await supabase
        .from("sportyhq_lookup_attempts")
        .select("id, attempts, last_attempt_at")
        .eq("club_member_id", memberId)
        .maybeSingle();
      const force = body.force === true;
      if (!force && attempt) {
        const ageMs = attempt.last_attempt_at
          ? Date.now() - new Date(attempt.last_attempt_at).getTime()
          : Infinity;
        if (attempt.attempts >= 3 || ageMs < 7 * 24 * 60 * 60 * 1000) {
          return json({ status: "throttled", attempts: attempt.attempts });
        }
      }

      const clubHints: string[] = [
        (member as any).clubs?.name,
        ...(((member as any).member_association_affiliations ?? []) as any[]).map(
          (a) => a?.league_associations?.name,
        ),
      ].filter(Boolean);

      let status = "no_match";
      let message: string | null = null;
      let saved: unknown = null;

      try {
        const name = String((member as any).full_name ?? "").trim();
        if (name.length < 3) throw new Error("Member has no usable name");
        const cands = await search(name);
        const best = await deepPickBest(name, clubHints, cands);
        if (!best) {
          status = "no_match";
        } else if (!best.confident) {
          status = "ambiguous";
          message = `${cands.length} similar SportyHQ profiles`;
        } else {
          const prof = await fetchProfile(best.candidate.profile_path);
          const { data, error } = await supabase
            .from("sportyhq_profiles")
            .upsert(
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
                person_id: (member as any).person_id ?? null,
                club_member_id: memberId,
                fetched_at: new Date().toISOString(),
              },
              { onConflict: "sportyhq_user_id" },
            )
            .select()
            .single();
          if (error) throw error;
          saved = data;
          status = "saved";
        }
      } catch (err) {
        status = "error";
        message = (err as Error).message;
      }

      await supabase.from("sportyhq_lookup_attempts").upsert(
        {
          club_member_id: memberId,
          person_id: (member as any).person_id ?? null,
          attempts: (attempt?.attempts ?? 0) + 1,
          last_status: status,
          last_message: message,
          last_attempt_at: new Date().toISOString(),
        },
        { onConflict: "club_member_id" },
      );

      return json({ status, message, profile: saved });
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

    if (action === "debug_group_page") {
      const gid = Number(body.group_id);
      const html = await fetchHtml(`${BASE}/ranking/group/${gid}`);
      const hrefs = [...html.matchAll(/href="([^"]*(ranking\/user|club\/view)[^"]*)"/g)].map((m) => m[1]);
      const listHtml = await fetchHtml(`${BASE}/ranking/group/${gid}?iframe=true&list_only=true&show_all=true&show_title=true`);
      const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const listRows = [...listHtml.matchAll(rowRe)];
      let sampleRow = "";
      for (const r of listRows) {
        if (r[1].includes("/ranking/user/")) { sampleRow = r[1].slice(0, 800); break; }
      }
      return json({
        len: html.length,
        list_len: listHtml.length,
        tr_count: (html.match(/<tr/gi) ?? []).length,
        list_tr_count: listRows.length,
        sample_hrefs: [...new Set(hrefs)].slice(0, 8),
        list_user_links: [...new Set([...listHtml.matchAll(/href="([^"]*\/ranking\/user\/[^"]*)"/g)].map((m) => m[1]))].slice(0, 5),
        list_club_links: [...new Set([...listHtml.matchAll(/href="([^"]*\/club\/view\/[^"]*)"/g)].map((m) => m[1]))].slice(0, 5),
        sample_row: sampleRow,
      });
    }

    if (action === "scrape_national_tree") {
      // National tree discovery: the Squash South Africa facility registry
      // lists every SA club with its governing body. Stages SSA (national),
      // each association, and each club into sportyhq_orgs for review.
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

      const CANON = [
        "South African National Defence Force", "Mpumalanga West Junior Squash",
        "Mpumalanga Lowveld Squash Association", "Mpumalanga Highveld Squash Association",
        "Mpumalanga West Squash Association", "KZN Schools Squash Association",
        "Western Province Junior Squash", "Griqualand West Squash Association",
        "Eastern Gauteng Squash Association", "Northern Natal Squash Association",
        "Lower South Coast Squash Association", "Free State East Squash Association",
        "Vaal Triangle Squash Association", "Northerns Squash Association",
        "Border Squash Association", "Limpopo Squash Association",
        "Western Province Squash", "Midlands Squash Union", "Free State Northern Squash",
        "Transkei Squash Association", "Joburg Squash", "Boland Squash",
        "Eastern Cape Squash", "KZN Squash Union", "Free State Squash", "Eden Squash",
        "Zululand Squash", "North West Squash", "Dolphin Coast Squash",
        "Makana Districts", "SA Schools", "University Sport South Africa",
      ];
      const primaryAssoc = (raw: string): string => {
        let a = raw.replace(/\s+/g, " ").trim();
        a = a.replace(/(\w) n National Defence Force/g, "$1 South African National Defence Force");
        a = a.replace("South AfricaSouth African National Defence Force", "South African National Defence Force");
        const hits = CANON.filter((c) => a.includes(c));
        if (!hits.length) return "Squash South Africa";
        hits.sort((x, y) => a.indexOf(x) - a.indexOf(y));
        return hits[0];
      };
      const slugify = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

      const html = await fetchHtml(`${BASE}/organization/clubs/3`);
      const { data: liveClubs } = await supabase.from("clubs").select("id, name");
      const clubRows = liveClubs ?? [];

      const { data: run } = await supabase
        .from("sportyhq_tree_runs")
        .insert({ action: "scrape_national_tree", started_by: uid })
        .select("id")
        .single();

      const now = new Date().toISOString();
      await supabase.from("sportyhq_orgs").upsert(
        { sportyhq_org_key: "org:Squash-South-Africa", name: "Squash South Africa", kind: "national", parent_key: null, last_scraped_at: now },
        { onConflict: "sportyhq_org_key" },
      );

      const assocKeys = new Map<string, string>();
      let clubsStaged = 0, matched = 0;
      const errors: string[] = [];
      const seen = new Set<string>();

      const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      for (const row of rows) {
        const rowHtml = row[1];
        const clubM = rowHtml.match(/href="[^"]*\/club\/view\/([^"]+)"/);
        if (!clubM) continue;
        const clubSlug = clubM[1].replace(/\/+$/, "");
        if (seen.has(clubSlug)) continue;
        seen.add(clubSlug);

        const tds = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => textOf(m[1]));
        if (tds.length < 4) continue;
        const name = tds[0].replace(/ Club Page$/, "").trim();
        const location = tds[1] || null;
        const assoc = primaryAssoc((tds[tds.length - 1] ?? "").replace("Squash South Africa", "").trim());

        let parentKey = "org:Squash-South-Africa";
        if (assoc !== "Squash South Africa") {
          if (!assocKeys.has(assoc)) {
            const key = `org:${slugify(assoc)}`;
            assocKeys.set(assoc, key);
            const { error } = await supabase.from("sportyhq_orgs").upsert(
              { sportyhq_org_key: key, name: assoc, kind: "association", parent_key: "org:Squash-South-Africa", last_scraped_at: now },
              { onConflict: "sportyhq_org_key" },
            );
            if (error) errors.push(`assoc ${assoc}: ${error.message}`);
          }
          parentKey = assocKeys.get(assoc)!;
        }

        const match = matchLiveClub(name, clubSlug, clubRows);
        const { data: orgRow, error } = await supabase
          .from("sportyhq_orgs")
          .upsert(
            {
              sportyhq_org_key: `club:${clubSlug}`,
              name,
              kind: "club",
              parent_key: parentKey,
              location_label: location,
              matched_club_id: match?.id ?? null,
              last_scraped_at: now,
            },
            { onConflict: "sportyhq_org_key" },
          )
          .select("id, status")
          .single();
        if (error) { errors.push(`club ${clubSlug}: ${error.message}`); continue; }
        if (orgRow.status === "new" && match) {
          await supabase.from("sportyhq_orgs").update({ status: "matched" }).eq("id", orgRow.id);
          matched++;
        }
        clubsStaged++;
      }

      // Note: the upsert above already re-parents clubs discovered earlier via
      // ranking groups (parent group:<gid>) onto their canonical association,
      // because they share the same club:<slug> key.

      if (run?.id) {
        await supabase.from("sportyhq_tree_runs").update({
          finished_at: new Date().toISOString(),
          status: errors.length ? "completed_with_errors" : "completed",
          orgs_found: assocKeys.size + 1 + clubsStaged,
          players_found: 0,
          message: `clubs_staged=${clubsStaged} associations=${assocKeys.size} matched_live=${matched} errors=${errors.slice(0, 5).join(" | ")}`,
        }).eq("id", run.id);
      }

      return json({ status: "ok", clubs_staged: clubsStaged, associations: assocKeys.size, matched_live: matched, errors: errors.slice(0, 10) });
    }

    if (action === "scrape_ranking_group") {
      // Phase A+B discovery: one association ranking page yields both the club
      // list (unique /club/view links) and the player roster (rank, points,
      // club affiliation). Everything lands in staging tables for review.
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

      const associationOrgId = body.association_org_id ?? null;
      let groupIds: number[] = [];
      if (body.group_id) {
        groupIds = [Number(body.group_id)];
      } else if (body.organization_path) {
        const orgHtml = await fetchHtml(`${BASE}${body.organization_path}`);
        groupIds = [...orgHtml.matchAll(/href="\/ranking\/group\/(\d+)"/g)].map((m) => Number(m[1]));
        groupIds = [...new Set(groupIds)];
      } else {
        return json({ error: "Provide group_id or organization_path" }, 400);
      }
      const maxGroups = Math.min(Math.max(Number(body.max_groups ?? 60), 1), 60);
      groupIds = groupIds.slice(0, maxGroups);
      if (!groupIds.length) return json({ error: "No ranking groups found" }, 404);

      // Record the run
      const { data: run } = await supabase
        .from("sportyhq_tree_runs")
        .insert({ action: "scrape_ranking_group", association_org_id: associationOrgId, started_by: uid })
        .select("id")
        .single();

      // Existing SquashHub clubs for fuzzy matching
      const { data: liveClubs } = await supabase.from("clubs").select("id, name");
      const clubRows = liveClubs ?? [];
      const memberCache = new Map<string, any[]>();
      const orgIdCache = new Map<string, string | null>();

      let orgsFound = 0;
      let playersFound = 0;
      const errors: string[] = [];
      const summary: Array<Record<string, unknown>> = [];

      for (const gid of groupIds) {
        let html: string;
        try {
          // The ranking table is rendered by AJAX from the same URL with these
          // params; the base page itself contains only the filter shell.
          html = await fetchHtml(
            `${BASE}/ranking/group/${gid}?iframe=true&list_only=true&show_all=true&show_title=true`,
          );
        } catch (err) {
          errors.push(`group ${gid}: ${(err as Error).message}`);
          continue;
        }
        const groupTitle =
          textOf(html.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/)?.[1] ?? "") || `Group ${gid}`;

        // 1. Parse every row first — national groups run to 1000+ players, so
        // per-row round trips to the database are far too slow.
        type ParsedRow = {
          slug: string;
          playerName: string;
          clubSlug: string | null;
          clubLabel: string | null;
          rankPosition: number | null;
          rankPoints: number | null;
          rankConfidence: string | null;
        };
        const parsed: ParsedRow[] = [];
        const seenSlugs = new Set<string>();
        for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
          const rowHtml = row[1];
          const playerM = rowHtml.match(/href="\/ranking\/user\/([^/"]+)\/ranking_group_id,\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/);
          if (!playerM) continue;
          const slug = playerM[1];
          const playerName = textOf(playerM[2]);
          if (!playerName || seenSlugs.has(slug)) continue;
          seenSlugs.add(slug);
          const clubM = rowHtml.match(/href="\/club\/view\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
          const rowText = textOf(rowHtml);
          const nums = rowText.match(/^(\d+)\s+.*?([\d,]+)\s+(\d+)%\s*$/);
          parsed.push({
            slug,
            playerName,
            clubSlug: clubM?.[1] ?? null,
            clubLabel: clubM ? textOf(clubM[2]) : null,
            rankPosition: nums ? Number(nums[1]) : null,
            rankPoints: nums ? num(nums[2]) : null,
            rankConfidence: nums ? `${nums[3]}%` : null,
          });
        }

        // 2. Upsert every club in this group in one batch.
        const clubSlugs = [...new Set(parsed.map((p) => p.clubSlug).filter(Boolean) as string[])];
        const unknownSlugs = clubSlugs.filter((s) => !orgIdCache.has(s));
        if (unknownSlugs.length) {
          const payload = unknownSlugs.map((clubSlug) => {
            const label = parsed.find((p) => p.clubSlug === clubSlug)?.clubLabel ?? null;
            const prettyName = label && label.length > 3 ? label : deslugify(clubSlug);
            const match = matchLiveClub(prettyName, clubSlug, clubRows);
            return {
              sportyhq_org_key: `club:${clubSlug}`,
              name: prettyName,
              kind: "club",
              parent_key: `group:${gid}`,
              parent_org_id: associationOrgId,
              matched_club_id: match?.id ?? null,
              last_scraped_at: new Date().toISOString(),
            };
          });
          const { data: orgRows, error: orgErr } = await supabase
            .from("sportyhq_orgs")
            .upsert(payload, { onConflict: "sportyhq_org_key", ignoreDuplicates: false })
            .select("id, sportyhq_org_key, status, matched_club_id");
          if (orgErr) {
            errors.push(`group ${gid} clubs: ${orgErr.message}`);
          } else {
            const toMatch: string[] = [];
            for (const r of orgRows ?? []) {
              const slug = String(r.sportyhq_org_key).slice(5);
              orgIdCache.set(slug, r.id);
              orgsFound++;
              if (r.status === "new" && r.matched_club_id) toMatch.push(r.id);
            }
            if (toMatch.length) {
              await supabase.from("sportyhq_orgs").update({ status: "matched" }).in("id", toMatch);
            }
          }
        }

        // 3. Pre-load the member rosters of every live club we matched.
        const liveClubIdBySlug = new Map<string, string | null>();
        for (const clubSlug of clubSlugs) {
          const label = parsed.find((p) => p.clubSlug === clubSlug)?.clubLabel;
          liveClubIdBySlug.set(
            clubSlug,
            matchLiveClub(label ?? deslugify(clubSlug), clubSlug, clubRows)?.id ?? null,
          );
        }
        for (const liveClubId of new Set([...liveClubIdBySlug.values()].filter(Boolean) as string[])) {
          if (memberCache.has(liveClubId)) continue;
          const { data: members } = await supabase
            .from("club_members")
            .select("id, name, person_id")
            .eq("club_id", liveClubId)
            .neq("status", "resigned");
          memberCache.set(liveClubId, members ?? []);
        }

        // 4. Batch-upsert the players.
        const memberPayload: Record<string, unknown>[] = [];
        for (const p of parsed) {
          if (!p.clubSlug) continue;
          const orgId = orgIdCache.get(p.clubSlug);
          if (!orgId) continue;
          const liveClubId = liveClubIdBySlug.get(p.clubSlug) ?? null;
          let memberMatch: { id: string; confidence: string } | null = null;
          let personId: string | null = null;
          if (liveClubId) {
            const members = memberCache.get(liveClubId) ?? [];
            memberMatch = matchMember(p.playerName, members);
            personId = memberMatch
              ? members.find((m: any) => m.id === memberMatch!.id)?.person_id ?? null
              : null;
          }
          memberPayload.push({
            org_id: orgId,
            ranking_slug: p.slug,
            name: p.playerName,
            rank_position: p.rankPosition,
            rank_points: p.rankPoints,
            rank_confidence: p.rankConfidence,
            club_label: p.clubLabel,
            matched_club_member_id: memberMatch?.id ?? null,
            matched_person_id: personId,
            match_confidence: memberMatch?.confidence ?? null,
            last_seen_at: new Date().toISOString(),
          });
        }
        const CHUNK = 300;
        for (let i = 0; i < memberPayload.length; i += CHUNK) {
          const chunk = memberPayload.slice(i, i + CHUNK);
          const { data: memRows, error: memErr } = await supabase
            .from("sportyhq_org_members")
            .upsert(chunk, { onConflict: "org_id,ranking_slug" })
            .select("id, status, matched_club_member_id");
          if (memErr) {
            errors.push(`group ${gid} players @${i}: ${memErr.message}`);
            continue;
          }
          playersFound += chunk.length;
          const promote = (memRows ?? [])
            .filter((r: any) => r.status === "new" && r.matched_club_member_id)
            .map((r: any) => r.id);
          if (promote.length) {
            await supabase.from("sportyhq_org_members").update({ status: "matched" }).in("id", promote);
          }
        }

        summary.push({ group_id: gid, title: groupTitle, players: memberPayload.length });
        await new Promise((r) => setTimeout(r, 250)); // gentle pacing between groups
      }


      await supabase
        .from("sportyhq_tree_runs")
        .update({
          status: errors.length ? "done_with_errors" : "done",
          orgs_found: orgsFound,
          players_found: playersFound,
          message: errors.slice(0, 5).join(" | ") || null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", run?.id);

      return json({ status: "ok", groups: summary, orgs_found: orgsFound, players_found: playersFound, errors: errors.slice(0, 10) });
    }

    if (action === "scrape_club_members") {

      // Roster pull straight off the club pages we already staged in the tree.
      // No manual ranking-group ID needed: every staged club row carries its
      // SportyHQ slug in sportyhq_org_key ("club:<slug>").
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

      let q = supabase
        .from("sportyhq_orgs")
        .select("id, name, sportyhq_org_key, parent_key, matched_club_id")
        .eq("kind", "club")
        .neq("status", "ignored");
      if (body.org_id) q = q.eq("id", body.org_id);
      else if (body.parent_key) q = q.eq("parent_key", body.parent_key);
      else return json({ error: "Provide org_id or parent_key" }, 400);
      const limit = Math.min(Math.max(Number(body.limit ?? 15), 1), 40);
      const { data: orgs, error: orgErr } = await q.limit(limit);
      if (orgErr) return json({ error: orgErr.message }, 400);
      if (!orgs?.length) return json({ error: "No staged clubs to scrape" }, 404);

      const { data: liveClubs } = await supabase.from("clubs").select("id, name");
      const clubRows = liveClubs ?? [];
      const memberCache = new Map<string, any[]>();

      let playersFound = 0;
      let clubsScanned = 0;
      const errors: string[] = [];

      type Found = { slug: string; name: string; rank: number | null; points: number | null };
      const clubKey = (s: string) => norm(deslugify(String(s).replace(/\/+$/, "")));

      // SportyHQ club pages only show a top-2 teaser. The real rosters live in the
      // parent association's ranking groups, where every row carries its club link.
      // So: pull each parent's groups once, bucket players by club, then attribute.
      const rosterByClub = new Map<string, Map<string, Found>>();
      const scannedParents = new Set<string>();

      const parseGroupHtml = (html: string) => {
        for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
          const rowHtml = row[1];
          const clubM = rowHtml.match(/href="\/club\/view\/([^"?]+)"/);
          if (!clubM) continue;
          const pM = rowHtml.match(/href="\/(?:ranking\/user|user\/view)\/([^/"?#]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/);
          if (!pM) continue;
          const name = textOf(pM[2]);
          if (!name || name.length < 3) continue;
          const nums = textOf(rowHtml).match(/^(\d+)\s+.*?([\d,]+)\s+\d+%\s*$/);
          const key = clubKey(clubM[1]);
          if (!rosterByClub.has(key)) rosterByClub.set(key, new Map());
          rosterByClub.get(key)!.set(pM[1], {
            slug: pM[1],
            name,
            rank: nums ? Number(nums[1]) : null,
            points: nums ? num(nums[2]) : null,
          });
        }
      };

      const loadParentGroups = async (parentKey: string | null, orgName: string) => {
        if (!parentKey || scannedParents.has(parentKey)) return;
        scannedParents.add(parentKey);
        const pSlug = parentKey.replace(/^org:/, "");
        let orgHtml = "";
        try {
          orgHtml = await fetchHtml(
            /^\d+$/.test(pSlug) ? `${BASE}/organization/view/${pSlug}` : `${BASE}/organization/view/${pSlug}`,
          );
        } catch (err) {
          errors.push(`${orgName}: parent page — ${(err as Error).message}`);
          return;
        }
        // Associations publish one ranking group per division (Men A/B, Ladies,
        // Juniors, Masters...). Take them all — capping at 6 was why smaller
        // unions like Boland only ever produced a handful of players.
        const gids = [...new Set([...orgHtml.matchAll(/href="\/ranking\/group\/(\d+)/g)].map((m) => m[1]))].slice(0, 30);
        for (const gid of gids) {
          try {
            parseGroupHtml(await fetchHtml(`${BASE}/ranking/group/${gid}?iframe=true&list_only=true&show_all=true`));
          } catch { /* keep whatever we have */ }
          await new Promise((r) => setTimeout(r, 350));
        }
      };

      for (const org of orgs) {
        const slug = String(org.sportyhq_org_key ?? "").startsWith("club:")
          ? String(org.sportyhq_org_key).slice(5)
          : null;
        if (!slug) { errors.push(`${org.name}: no SportyHQ slug`); continue; }

        await loadParentGroups(org.parent_key, org.name);
        clubsScanned++;

        const found = new Map<string, Found>(rosterByClub.get(clubKey(slug)) ?? new Map());
        // Nothing in the group listings? Fall back to whatever the club page shows.
        if (found.size === 0) {
          try {
            const html = await fetchHtml(`${BASE}/club/view/${slug}`);
            for (const m of html.matchAll(/href="(?:https:\/\/www\.sportyhq\.com)?\/(?:ranking\/user|user\/view)\/([^/"?#]+)[^"]*"[^>]*>([\s\S]{0,120}?)<\/a>/g)) {
              const name = textOf(m[2]);
              if (name.length < 3) continue;
              if (!found.has(m[1])) found.set(m[1], { slug: m[1], name, rank: null, points: null });
            }
          } catch (err) {
            errors.push(`${org.name}: ${(err as Error).message}`);
          }
        }



        if (org.matched_club_id && !memberCache.has(org.matched_club_id)) {
          const { data: mem } = await supabase
            .from("club_members")
            .select("id, name, person_id")
            .eq("club_id", org.matched_club_id)
            .neq("status", "resigned");
          memberCache.set(org.matched_club_id, mem ?? []);
        }
        const liveMembers = org.matched_club_id ? memberCache.get(org.matched_club_id)! : [];

        for (const p of found.values()) {
          const memberMatch = liveMembers.length ? matchMember(p.name, liveMembers) : null;
          const personId = memberMatch
            ? liveMembers.find((m: any) => m.id === memberMatch.id)?.person_id ?? null
            : null;
          const { data: memRow, error: memErr } = await supabase
            .from("sportyhq_org_members")
            .upsert(
              {
                org_id: org.id,
                ranking_slug: p.slug,
                name: p.name,
                rank_position: p.rank,
                rank_points: p.points,
                club_label: org.name,
                matched_club_member_id: memberMatch?.id ?? null,
                matched_person_id: personId,
                match_confidence: memberMatch?.confidence ?? null,
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: "org_id,ranking_slug" },
            )
            .select("id, status")
            .single();
          if (memErr) { errors.push(`${p.name}: ${memErr.message}`); continue; }
          if (memRow.status === "new" && memberMatch) {
            await supabase.from("sportyhq_org_members").update({ status: "matched" }).eq("id", memRow.id);
          }
          playersFound++;
        }
        await new Promise((r) => setTimeout(r, 350)); // gentle pacing
      }

      return json({
        status: "ok",
        clubs_scanned: clubsScanned,
        players_found: playersFound,
        errors: errors.slice(0, 10),
      });
    }



    if (action === "enrich_org_members") {
      // Deep-enrich staged players: opens each player's public SportyHQ profile
      // and stores gender, DOB/age, nationality, handedness, rating and match stats.
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

      const limit = Math.min(Math.max(Number(body.limit ?? 25), 1), 60);
      const refresh = body.refresh === true;

      let q = supabase
        .from("sportyhq_org_members")
        .select("id, name, club_label, org_id")
        .neq("status", "ignored")
        .limit(limit);
      if (body.org_id) q = q.eq("org_id", body.org_id);
      if (!refresh) q = q.is("profile_fetched_at", null);
      const { data: targets, error: tErr } = await q;
      if (tErr) return json({ error: tErr.message }, 400);

      let enriched = 0;
      let missed = 0;
      const errors: string[] = [];

      for (const t of targets ?? []) {
        try {
          const hints = t.club_label ? [t.club_label] : [];
          const cands = await search(t.name);
          const best = await deepPickBest(t.name, hints, cands);
          if (!best) {
            missed++;
            await supabase
              .from("sportyhq_org_members")
              .update({ profile_fetched_at: new Date().toISOString() })
              .eq("id", t.id);
            continue;
          }
          const prof = await fetchProfile(best.candidate.profile_path);
          const dobMs = prof.birthday ? Date.parse(prof.birthday) : NaN;
          const { error: uErr } = await supabase
            .from("sportyhq_org_members")
            .update({
              gender: prof.gender,
              birthday: prof.birthday,
              date_of_birth: Number.isFinite(dobMs)
                ? new Date(dobMs).toISOString().slice(0, 10)
                : null,
              age: prof.age,
              nationality: prof.nationality,
              handedness: prof.handedness,
              nickname: prof.nickname,
              rating: prof.rating,
              rating_confidence: prof.rating_confidence,
              matches_ytd: prof.matches_ytd,
              matches_all_time: prof.matches_all_time,
              wins_all_time: prof.wins_all_time,
              rankings: prof.rankings ?? [],
              sportyhq_user_id: best.candidate.sportyhq_user_id,
              profile_path: best.candidate.profile_path,
              profile_fetched_at: new Date().toISOString(),
            })
            .eq("id", t.id);
          if (uErr) errors.push(`${t.name}: ${uErr.message}`);
          else enriched++;
        } catch (err) {
          errors.push(`${t.name}: ${(err as Error).message}`);
        }
        await new Promise((r) => setTimeout(r, 350)); // gentle pacing
      }

      return json({
        status: "ok",
        considered: (targets ?? []).length,
        enriched,
        not_found: missed,
        errors: errors.slice(0, 10),
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

// Fetch a SportyHQ page, retrying through intermittent Cloudflare challenges.
async function fetchHtml(url: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`SportyHQ fetch failed [${res.status}]`);
    const html = await res.text();
    if (!/Just a moment/i.test(html)) return html;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error("SportyHQ blocked the request (Cloudflare challenge)");
}

function deslugify(slug: string): string {
  return slug
    .replace(/-\d+$/, "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function matchLiveClub(label: string, slug: string, clubs: Array<{ id: string; name: string; suburb?: string | null; city?: string | null }>) {
  const target = norm(label);
  const slugName = norm(deslugify(slug));
  let best: { id: string; score: number } | null = null;
  for (const c of clubs) {
    const cn = norm(c.name);
    let score = 0;
    if (cn === target || cn === slugName) score = 100;
    else if (cn.includes(slugName) || slugName.includes(cn)) score = 80;
    else score = clubScore(cn, [target, slugName]) * 10;
    if (score > (best?.score ?? 0)) best = { id: c.id, score };
  }
  return best && best.score >= 20 ? { id: best.id } : null;
}

function matchMember(
  playerName: string,
  members: Array<{ id: string; name: string | null }>,
): { id: string; confidence: string } | null {
  const target = norm(playerName);
  for (const m of members) {
    const full = norm(m.name ?? "");
    if (full && full === target) return { id: m.id, confidence: "confident" };
  }
  // Probable: same surname and same first initial
  const parts = target.split(" ");
  const surname = parts[parts.length - 1];
  const initial = parts[0]?.[0];
  const probable = members.filter((m) => {
    const mparts = norm(m.name ?? "").split(" ");
    const ln = mparts[mparts.length - 1] ?? "";
    const fn = mparts[0] ?? "";
    return ln === surname && fn.startsWith(initial ?? " ");
  });
  if (probable.length === 1) return { id: probable[0].id, confidence: "probable" };
  return null;
}
