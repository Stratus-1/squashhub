import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postgres from "postgres";

// Synthetic database only (rolled back). Never point this suite at hosted member data.
// Run against an EMPTY throwaway database: MOBILE_PLAYER_TEST_SOCKET=/path/to/socket [MOBILE_PLAYER_TEST_PORT=55432] [MOBILE_PLAYER_TEST_DB=postgres] bunx vitest run src/test/mobile-player-events-leagues-db.test.ts
const SOCKET = process.env.MOBILE_PLAYER_TEST_SOCKET;
const PORT = Number(process.env.MOBILE_PLAYER_TEST_PORT || 55432);
const MIGRATION = "supabase/migrations/20261110203000_mobile_player_events_leagues.sql";
const SECRET = "SYNTHETIC_TEST_SECRET_0123456789abcdefghij";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CLUB = id(1), OTHER_CLUB = id(2);
const M = id(10), PENDING = id(11), RESIGNED = id(12), OTHER = id(13), FOREIGN = id(14);
const U1 = id(20), U2 = id(21);
const E_INVITED = id(30), E_OPEN = id(31), E_INV_ONLY = id(32), E_PAUSED = id(33), E_ENDED = id(34),
  E_CANCELLED = id(35), E_DECLINED_ONCE = id(36), E_LEFT = id(37), E_FRESH_WEEK = id(38), E_FOREIGN = id(39);
const OCC_NEXT = id(40), OCC_LATER = id(41), OCC_PAST = id(42), OCC_OPEN = id(43), OCC_FRESH = id(44), OCC_LEFT = id(45);
const LA = id(50), LB = id(51), PA = id(52), PX = id(53), SEASON = id(54);
const T1 = id(60), T_ARCHIVED = id(61), T_OTHER = id(62), T_FOREIGN = id(63);
const F_UP = id(70), F_PAST = id(71), F_NOT_MINE = id(72), F_FOREIGN_CLUB = id(73), F_LEGACY = id(74),
  F_LEGACY_OTHER_DIV = id(75), F_OTHER_ASSOC = id(76), F_LEGACY_DUP = id(77), ROUND = id(78);

const SCHEMA = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE TABLE app_settings(key text PRIMARY KEY, value text);
CREATE FUNCTION mobile_internal_secret_ok(p_sync_secret text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_settings s WHERE s.key IN ('squashhub_mobile_internal_secret','mobile_private_internal_secret','lights_private_internal_secret')
    AND s.value = p_sync_secret AND p_sync_secret IS NOT NULL AND length(p_sync_secret) >= 32) $$;
CREATE TABLE clubs(id uuid PRIMARY KEY, name text, tenant_type text);
CREATE TABLE club_members(id uuid PRIMARY KEY, club_id uuid, user_id uuid, email text, name text, status text, is_pending_approval boolean DEFAULT false,
  person_id uuid, ladder_position int, cross_gender_ladder_position int, ranking_points numeric, club_member_number text);
CREATE TABLE profiles(id uuid PRIMARY KEY, email text);
CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_member_id uuid, user_id uuid, type text, title text, message text, read boolean, created_at timestamptz DEFAULT now(), url text);
CREATE TABLE club_capabilities(club_id uuid, capability text, enabled boolean);
CREATE TABLE club_events(id uuid PRIMARY KEY, club_id uuid, title text, description text, event_type text DEFAULT 'social', day_of_week int DEFAULT 4,
  start_time time, end_time time, start_date date, status text DEFAULT 'active', recurrence text DEFAULT 'once', num_instances int DEFAULT 12,
  allow_self_join boolean DEFAULT false, created_by uuid, booked_by_member_id uuid, invite_scope text DEFAULT 'selected', light_fee_split text DEFAULT 'creator');
CREATE TABLE club_event_instances(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid, instance_date date, status text DEFAULT 'scheduled');
CREATE TABLE club_event_rsvps(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid, club_member_id uuid, status text DEFAULT 'invited', updated_at timestamptz DEFAULT now(), UNIQUE(event_id, club_member_id));
CREATE TABLE club_event_instance_rsvps(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id uuid, club_member_id uuid, status text DEFAULT 'invited', updated_at timestamptz DEFAULT now(), UNIQUE(instance_id, club_member_id));
-- Stand-in for the unchanged base payload: same secret + membership guard, minimal body.
CREATE FUNCTION mobile_player_home_payload_base(p_sync_secret text, p_club_id uuid, p_member_id uuid, p_from date DEFAULT CURRENT_DATE, p_to date DEFAULT (CURRENT_DATE + 7))
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.club_members WHERE id = p_member_id AND club_id = p_club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member does not belong to selected club' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('club', jsonb_build_object('id', p_club_id), 'bookings', '[]'::jsonb);
END $$;
CREATE FUNCTION join_club_event(_event_id uuid, _club_member_id uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION leave_club_event(_event_id uuid, _club_member_id uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
-- Competition sources.
CREATE TABLE club_ranking_snapshots(id uuid PRIMARY KEY, club_id uuid, period_start date);
CREATE TABLE club_ranking_snapshot_entries(snapshot_id uuid, club_id uuid, club_member_id uuid, rank int, ranking_points numeric);
CREATE TABLE ranking_snapshots(id uuid PRIMARY KEY, association_id uuid, computed_at timestamptz);
CREATE TABLE ranking_snapshot_entries(snapshot_id uuid, association_id uuid, category text, person_id uuid, player_code text, rank int, previous_rank int, score numeric);
CREATE TABLE member_association_affiliations(club_member_id uuid, association_id uuid, league_association_number text, active boolean);
CREATE TABLE people(id uuid PRIMARY KEY, national_player_number text, ssa_membership_number text);
CREATE TABLE league_associations(id uuid PRIMARY KEY, club_id uuid, name text, abbreviation text, scope text, platform_association_id uuid);
CREATE TABLE leagues(id uuid PRIMARY KEY, club_id uuid, association_id uuid, name text, code text, division text, category text, season_year int, season_id uuid, archived_at timestamptz);
CREATE TABLE member_league_registrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_member_id uuid, league_id uuid, league_association_number text, player_rank int, is_captain boolean DEFAULT false, is_reserve boolean DEFAULT false);
CREATE TABLE club_champs(id uuid PRIMARY KEY, club_id uuid, name text, status text, start_date date, end_date date);
CREATE TABLE club_champs_registrations(champ_id uuid, club_member_id uuid, registration_status text, fee_status text);
CREATE TABLE club_champs_matches(id uuid PRIMARY KEY, champ_id uuid, division_id uuid, stage_id uuid, stage_label text, stage text, round_number int, pool_number int, group_number int,
  scheduled_date date, scheduled_time time, court_id uuid, play_by date, status text, is_bye boolean, player_a_member_id uuid, player_b_member_id uuid,
  partner_a_member_id uuid, partner_b_member_id uuid, bye_member_id uuid, placeholder_a text, placeholder_b text, winner_member_id uuid, score text, game_scores jsonb);
CREATE TABLE tournament_stages(id uuid PRIMARY KEY, label text);
CREATE TABLE tournament_divisions(id uuid PRIMARY KEY, label text);
CREATE TABLE platform_league_fixtures(id uuid PRIMARY KEY, association_id uuid, fixture_date date, start_time time, end_time time, venue_name text,
  home_team_code text, away_team_code text, division text, status text, score text, winner_team_code text, round_id uuid, season_id uuid,
  home_team_id uuid, away_team_id uuid, home_team_name_snapshot text, away_team_name_snapshot text, created_at timestamptz DEFAULT now());
CREATE TABLE league_fixture_results(fixture_id uuid, status text, winner text, home_total_points int, away_total_points int, home_total_games int, away_total_games int, updated_at timestamptz DEFAULT now());
CREATE TABLE league_fixture_lineups(fixture_id uuid, league_id uuid, club_id uuid, position int, club_member_id uuid, rubber_type text);
CREATE TABLE league_match_results(fixture_id uuid, position int, rubber_type text, home_player_code text, away_player_code text, home_player_name text, away_player_name text,
  home_player2_code text, away_player2_code text, home_player2_name text, away_player2_name text, home_player_member_id uuid, away_player_member_id uuid,
  home_player2_member_id uuid, away_player2_member_id uuid, home_games_won int, away_games_won int, winner text, is_forfeit boolean, game_scores jsonb);
`;

async function withDb(fn: (tx: postgres.TransactionSql) => Promise<void>) {
  const sql = postgres({ host: SOCKET, port: PORT, username: "postgres", database: process.env.MOBILE_PLAYER_TEST_DB || "postgres", max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(SCHEMA);
      await tx.unsafe(readFileSync(MIGRATION, "utf8"));
      await tx`insert into app_settings values ('squashhub_mobile_internal_secret', ${SECRET})`;
      await tx`insert into clubs values (${CLUB},'Synthetic Club',null),(${OTHER_CLUB},'Other Club',null)`;
      await tx`insert into club_members(id,club_id,user_id,email,name,status,is_pending_approval,club_member_number) values
        (${M},${CLUB},${U1},'me@example.test','Me Player','active',false,'C100'),
        (${PENDING},${CLUB},null,null,'Pending Person','active',true,null),
        (${RESIGNED},${CLUB},null,null,'Resigned Person','resigned',false,null),
        (${OTHER},${CLUB},${U2},'other@example.test','Secret Otherplayer','active',false,'C200'),
        (${FOREIGN},${OTHER_CLUB},null,null,'Foreign Member','active',false,'C100')`;
      await fn(tx);
      throw new Error("ROLLBACK_SYNTHETIC_TEST");
    }).catch((e) => { if (e.message !== "ROLLBACK_SYNTHETIC_TEST") throw e; });
  } finally { await sql.end(); }
}

async function err(tx: postgres.TransactionSql, q: string, params: any[] = []) {
  try {
    await tx.unsafe(`SAVEPOINT s`);
    await tx.unsafe(q, params);
    await tx.unsafe(`RELEASE SAVEPOINT s`);
    return "OK";
  } catch (e: any) {
    await tx.unsafe(`ROLLBACK TO SAVEPOINT s`);
    return String(e.message);
  }
}
const asUser = (tx: postgres.TransactionSql, u: string | null) => tx`select set_config('request.jwt.claim.sub', ${u ?? ""}, true)`;

async function seedEvents(tx: postgres.TransactionSql) {
  await tx`insert into club_capabilities values (${CLUB},'events',true),(${CLUB},'bar',true)`;
  const ev = (eid: string, club: string, title: string, o: Record<string, any> = {}) => tx`insert into club_events
    (id,club_id,title,description,start_time,end_time,start_date,status,recurrence,num_instances,allow_self_join)
    values (${eid},${club},${title},'Synthetic',${o.start ?? "18:00"},${o.end ?? "20:00"},(current_date + ${o.startOffset ?? 1}::int),
            ${o.status ?? "active"},${o.recurrence ?? "weekly"},${o.n ?? 12},${o.selfJoin ?? false})`;
  await ev(E_INVITED, CLUB, "Invited weekly");
  await ev(E_OPEN, CLUB, "Open weekly", { selfJoin: true });
  await ev(E_INV_ONLY, CLUB, "Invitation only once", { recurrence: "once" });
  await ev(E_PAUSED, CLUB, "Paused", { status: "paused" });
  await ev(E_ENDED, CLUB, "Ended series", { startOffset: -140, n: 3 });
  await ev(E_CANCELLED, CLUB, "Cancelled", { status: "cancelled" });
  await ev(E_DECLINED_ONCE, CLUB, "Declined once", { recurrence: "once" });
  await ev(E_LEFT, CLUB, "Left weekly", { selfJoin: true });
  await ev(E_FRESH_WEEK, CLUB, "Fresh each week");
  await ev(E_FOREIGN, OTHER_CLUB, "Other club event", { selfJoin: true });
  await tx`insert into club_event_instances(id,event_id,instance_date,status) values
    (${OCC_PAST},${E_INVITED},current_date-6,'scheduled'),
    (${OCC_NEXT},${E_INVITED},current_date+1,'scheduled'),
    (${OCC_LATER},${E_INVITED},current_date+8,'scheduled'),
    (${OCC_OPEN},${E_OPEN},current_date+1,'scheduled'),
    (${OCC_FRESH},${E_FRESH_WEEK},current_date+1,'scheduled'),
    (${OCC_LEFT},${E_LEFT},current_date+1,'scheduled')`;
  await tx`insert into club_event_rsvps(event_id,club_member_id,status) values
    (${E_INVITED},${M},'invited'),(${E_INVITED},${OTHER},'confirmed'),
    (${E_DECLINED_ONCE},${M},'declined'),(${E_LEFT},${M},'left'),(${E_FRESH_WEEK},${M},'confirmed'),
    (${E_INV_ONLY},${OTHER},'confirmed'),(${E_OPEN},${OTHER},'confirmed')`;
  await tx`insert into club_event_instance_rsvps(instance_id,club_member_id,status) values
    (${OCC_PAST},${M},'declined'),(${OCC_NEXT},${M},'confirmed'),(${OCC_LATER},${M},'invited'),(${OCC_NEXT},${OTHER},'declined')`;
  await tx`insert into notifications(club_member_id,type,title,message,read) values (${M},'info','Hello','Synthetic',false)`;
}

const home = async (tx: postgres.TransactionSql, member = M, club = CLUB, secret = SECRET) =>
  (await tx`select mobile_player_home_payload(${secret}, ${club}, ${member}) as p`)[0].p;

(SOCKET ? describe : describe.skip)("Player app events, event join/leave and league games (synthetic DB)", () => {
  it("home payload lists only active upcoming club events with the member's own occurrence-scoped status", async () => {
    await withDb(async (tx) => {
      await seedEvents(tx);
      const p = await home(tx);
      expect(p.notifications).toHaveLength(1);
      expect(p.club).toEqual({ id: CLUB });
      const byId = Object.fromEntries(p.events.map((e: any) => [e.id, e]));
      expect(Object.keys(byId).sort()).toEqual([E_INVITED, E_OPEN, E_INV_ONLY, E_DECLINED_ONCE, E_LEFT, E_FRESH_WEEK].sort());
      // Repeating event: status is the reply for the NEXT scheduled occurrence.
      expect(byId[E_INVITED]).toMatchObject({ invited: true, myStatus: "confirmed", occurrence: { id: OCC_NEXT }, occurrenceRsvpId: expect.any(String),
        actions: { canJoin: false, canLeave: true, canRespond: false, respondTarget: null } });
      // Confirmed on the series but no reply for this week's occurrence: asked afresh.
      expect(byId[E_FRESH_WEEK]).toMatchObject({ myStatus: "invited", actions: { canRespond: true, respondTarget: "series" } });
      // Self-join event the member is not on.
      expect(byId[E_OPEN]).toMatchObject({ invited: false, myStatus: "not_invited", allowSelfJoin: true, invitationOnly: false, rsvpId: null,
        actions: { canJoin: true, canLeave: false, canRespond: false } });
      // Invitation-only event the member is not on: visible, never joinable.
      expect(byId[E_INV_ONLY]).toMatchObject({ invited: false, invitationOnly: true, actions: { canJoin: false, canLeave: false } });
      expect(byId[E_DECLINED_ONCE]).toMatchObject({ myStatus: "declined", actions: { canRespond: false, canLeave: true } });
      expect(byId[E_LEFT]).toMatchObject({ myStatus: "left", occurrenceRsvpId: null, actions: { canJoin: false, canLeave: false } });
      // No other players' records, names or admin fields.
      const text = JSON.stringify(p.events);
      expect(text).not.toContain(OTHER);
      expect(text).not.toContain("Otherplayer");
      for (const e of p.events) for (const k of ["created_by", "booked_by_member_id", "invite_scope", "light_fee_split", "confirmedNames", "counts"]) expect(e).not.toHaveProperty(k);
    });
  });

  it("applies membership scope, the events switch and the secret check", async () => {
    await withDb(async (tx) => {
      await seedEvents(tx);
      expect((await home(tx, PENDING)).events).toEqual([]);
      expect((await home(tx, RESIGNED)).events).toEqual([]);
      expect(await err(tx, `select mobile_player_home_payload($1,$2,$3)`, [SECRET, CLUB, FOREIGN])).toContain("Member does not belong");
      expect(await err(tx, `select mobile_player_home_payload($1,$2,$3)`, ["x".repeat(40), CLUB, M])).toContain("Unauthorized");
      expect((await home(tx, FOREIGN, OTHER_CLUB)).events.map((e: any) => e.id)).toEqual([E_FOREIGN]);
      await tx`update club_capabilities set enabled=false where club_id=${CLUB} and capability='events'`;
      expect((await home(tx)).events).toEqual([]);
      await tx`delete from club_capabilities where club_id=${CLUB}`; // no rows at all: fails open like the web
      expect((await home(tx)).events.length).toBe(6);
    });
  });

  it("join/leave keep the two-argument web path and accept the Player secret only with exact scope", async () => {
    await withDb(async (tx) => {
      await seedEvents(tx);
      const [sig] = await tx`select to_regprocedure('join_club_event(uuid,uuid)') as old_join, to_regprocedure('leave_club_event(uuid,uuid)') as old_leave,
        has_function_privilege('authenticated','join_club_event(uuid,uuid,text,uuid)','EXECUTE') as auth_join,
        has_function_privilege('anon','leave_club_event(uuid,uuid,text,uuid)','EXECUTE') as anon_leave`;
      expect(sig).toEqual({ old_join: null, old_leave: null, auth_join: true, anon_leave: true });

      // Web: two named arguments, owner session.
      await asUser(tx, U1);
      const [{ j }] = await tx`select join_club_event(_event_id => ${E_OPEN}, _club_member_id => ${M}) as j`;
      expect(j).toBeTruthy();
      const [{ status: occStatus }] = await tx`select status from club_event_instance_rsvps where instance_id=${OCC_OPEN} and club_member_id=${M}`;
      expect(occStatus).toBe("confirmed");
      expect((await tx`select leave_club_event(_event_id => ${E_OPEN}, _club_member_id => ${M}) as n`)[0].n).toBe(1);
      expect(await err(tx, `select join_club_event($1,$2)`, [E_INV_ONLY, M])).toContain("invitation only");
      // Web: a signed-out caller, or a session without a profile row, cannot act for anyone
      // (the previous check evaluated to NULL and let these through).
      await asUser(tx, null);
      expect(await err(tx, `select leave_club_event($1,$2)`, [E_INVITED, M])).toContain("Not allowed");
      expect(await err(tx, `select join_club_event($1,$2)`, [E_LEFT, M])).toContain("Not allowed");
      // Web: another user's session cannot act for this member.
      await asUser(tx, U2);
      expect(await err(tx, `select join_club_event($1,$2)`, [E_LEFT, M])).toContain("Not allowed");
      expect(await err(tx, `select leave_club_event($1,$2)`, [E_INVITED, M])).toContain("Not allowed");
      // Web: shared-email family login still works.
      await tx`insert into profiles values (${U2}, 'me@example.test')`;
      expect(await err(tx, `select join_club_event($1,$2)`, [E_LEFT, M])).toBe("OK");

      // Secret path: an invalid secret never falls back to the session.
      await asUser(tx, U1);
      expect(await err(tx, `select join_club_event($1,$2,$3,$4)`, [E_OPEN, M, "x".repeat(40), CLUB])).toContain("Not allowed");
      expect(await err(tx, `select join_club_event($1,$2,$3,$4)`, [E_OPEN, M, "", CLUB])).toContain("Not allowed");
      expect(await err(tx, `select leave_club_event($1,$2,$3,$4)`, [E_INVITED, M, "short", CLUB])).toContain("Not allowed");
      await asUser(tx, null);
      expect(await err(tx, `select join_club_event($1,$2,$3)`, [E_OPEN, OTHER, SECRET])).toContain("Club is required");
      expect(await err(tx, `select join_club_event($1,$2,$3,$4)`, [E_OPEN, OTHER, SECRET, OTHER_CLUB])).toContain("Event is not in this club");
      expect(await err(tx, `select join_club_event($1,$2,$3,$4)`, [E_FOREIGN, M, SECRET, CLUB])).toContain("Event is not in this club");
      expect(await err(tx, `select join_club_event($1,$2,$3,$4)`, [E_OPEN, FOREIGN, SECRET, CLUB])).toContain("Member is not in this club");
      expect(await err(tx, `select join_club_event($1,$2,$3,$4)`, [E_INV_ONLY, M, SECRET, CLUB])).toContain("invitation only");
      expect(await err(tx, `select join_club_event($1,$2,$3,$4)`, [E_OPEN, PENDING, SECRET, CLUB])).toContain("Membership is not active");
      expect(await err(tx, `select join_club_event($1,$2,$3,$4)`, [E_OPEN, RESIGNED, SECRET, CLUB])).toContain("Membership is not active");
      expect(await err(tx, `select leave_club_event($1,$2,$3,$4)`, [E_INVITED, M, SECRET, OTHER_CLUB])).toContain("Event is not in this club");
      // Valid secret + exact scope acts on exactly the supplied member.
      const before = await tx`select event_id, status from club_event_rsvps where club_member_id=${OTHER} order by event_id`;
      expect(await err(tx, `select join_club_event($1,$2,$3,$4)`, [E_LEFT, M, SECRET, CLUB])).toBe("OK");
      expect(await tx`select event_id, status from club_event_rsvps where club_member_id=${OTHER} order by event_id`).toEqual(before);
      expect((await tx`select status from club_event_rsvps where event_id=${E_LEFT} and club_member_id=${M}`)[0].status).toBe("confirmed");
      expect((await tx`select leave_club_event(${E_INVITED}, ${M}, ${SECRET}, ${CLUB}) as n`)[0].n).toBe(1);
      expect((await tx`select status from club_event_instance_rsvps where instance_id=${OCC_PAST} and club_member_id=${M}`)[0].status).toBe("declined");
      expect((await tx`select status from club_event_instance_rsvps where instance_id=${OCC_NEXT} and club_member_id=${OTHER}`)[0].status).toBe("declined");
    });
  });

  it("competition payload adds the member's own association league games, scoped to club, association and team", async () => {
    await withDb(async (tx) => {
      await tx`insert into league_associations values (${LA},${CLUB},'Northern League','NSA','region',${PA}),(${LB},${OTHER_CLUB},'Northern League','NSA','region',${PA})`;
      await tx`insert into leagues values
        (${T1},${CLUB},${LA},'Men''s 2nd League 2026','CSI001','Mens 2nd','men',2026,${SEASON},null),
        (${T_ARCHIVED},${CLUB},${LA},'Men''s 2nd League 2025','CSI001','Mens 2nd','men',2025,null,now()),
        (${T_OTHER},${CLUB},${LA},'Ladies 1st League 2026','CSIL01','Ladies 1st','ladies',2026,${SEASON},null),
        (${T_FOREIGN},${OTHER_CLUB},${LB},'Other Men 2nd','OTH001','Mens 2nd','men',2026,${SEASON},null)`;
      await tx`insert into member_league_registrations(club_member_id,league_id,league_association_number,player_rank,is_captain) values
        (${M},${T1},'NSA777',2,true),(${M},${T_ARCHIVED},'NSA777',1,false),(${OTHER},${T_OTHER},'NSA888',1,false),(${FOREIGN},${T_FOREIGN},'NSA999',1,false)`;
      const fx = (fid: string, assoc: string, d: number, home: string | null, away: string | null, hc: string, ac: string, div: string, o: Record<string, any> = {}) =>
        tx`insert into platform_league_fixtures(id,association_id,fixture_date,start_time,home_team_id,away_team_id,home_team_code,away_team_code,division,status,season_id,round_id,created_at)
           values (${fid},${assoc},current_date + ${d}::int,'18:30',${home},${away},${hc},${ac},${div},'scheduled',${o.season ?? SEASON},${o.round ?? null},${o.created ?? new Date().toISOString()})`;
      await fx(F_UP, PA, 3, T1, null, "CSI001", "PTA001", "Mens 2nd");
      await fx(F_PAST, PA, -4, null, T1, "PTA002", "CSI001", "Mens 2nd");
      await fx(F_NOT_MINE, PA, 5, T_OTHER, null, "CSIL01", "PTA009", "Ladies 1st");
      await fx(F_FOREIGN_CLUB, PA, 6, T_FOREIGN, null, "OTH001", "PTA003", "Mens 2nd");
      await fx(F_LEGACY, PA, 10, null, null, "PTA004", "CSI001", "Mens 2nd", { round: ROUND });
      await fx(F_LEGACY_DUP, PA, 10, null, null, "PTA004", "CSI001", "Mens 2nd", { created: "2020-01-01T00:00:00Z" });
      await fx(F_LEGACY_OTHER_DIV, PA, 11, null, null, "CSI001", "PTA005", "Ladies 1st");
      await fx(F_OTHER_ASSOC, PX, 4, T1, null, "CSI001", "PTA006", "Mens 2nd");
      await tx`insert into league_fixture_lineups values (${F_UP},${T1},${CLUB},2,${M},'singles'),(${F_UP},${T1},${CLUB},1,${OTHER},'singles')`;
      await tx`insert into league_fixture_results values (${F_PAST},'final','away',14,9,7,4,now())`;
      await tx`insert into league_match_results(fixture_id,position,rubber_type,home_player_code,away_player_code,home_player_name,away_player_name,home_player_member_id,away_player_member_id,home_games_won,away_games_won,winner,is_forfeit) values
        (${F_PAST},2,'singles','PTA-X','NSA777','Opp Two','Me Player',null,${M},1,3,'away',false),
        (${F_PAST},1,'singles','PTA-Y','C200','Opp One','Secret Otherplayer',null,${OTHER},3,0,'home',false),
        (${F_PAST},3,'singles','C100','ZZZ','Home Same Code','Teammate',null,null,3,1,'home',false)`;

      const [{ p }] = await tx`select mobile_player_competition_payload(${SECRET}, ${CLUB}, ${M}) as p`;
      expect(p).toMatchObject({ readOnly: true, clubId: CLUB, memberId: M });
      expect(p).toHaveProperty("rankings.club");
      expect(p.tournaments).toEqual([]);
      const lg = p.leagues;
      expect(lg).toMatchObject({ readOnly: true, standingsAvailable: false });
      expect(lg.registrations.map((r: any) => r.leagueId)).toEqual([T1]);
      expect(lg.registrations[0]).toMatchObject({ teamCode: "CSI001", isCaptain: true, officialRank: 2, association: { id: LA, hasFixtureFeed: true } });
      expect(lg.upcomingFixtures.map((f: any) => f.id)).toEqual([F_UP, F_LEGACY]);
      expect(lg.upcomingFixtures[0]).toMatchObject({ mySide: "home", inMyLineup: true, myLineup: { position: 2 }, result: null, myRubbers: [] });
      expect(lg.upcomingFixtures[1]).toMatchObject({ mySide: "away", inMyLineup: false });
      expect(lg.results.map((f: any) => f.id)).toEqual([F_PAST]);
      expect(lg.results[0]).toMatchObject({ mySide: "away", result: { status: "final", winner: "away", awayTotalPoints: 9 } });
      expect(lg.results[0].myRubbers).toEqual([expect.objectContaining({ position: 2, opponentName: "Opp Two", gamesWon: 3, gamesLost: 1, won: true })]);
      const text = JSON.stringify(lg);
      expect(text).not.toContain("Secret Otherplayer");
      for (const bad of [F_NOT_MINE, F_FOREIGN_CLUB, F_LEGACY_DUP, F_LEGACY_OTHER_DIV, F_OTHER_ASSOC, T_ARCHIVED]) expect(text).not.toContain(bad);

      // Same association in another club: only that club's member's team.
      const [{ p: fp }] = await tx`select mobile_player_competition_payload(${SECRET}, ${OTHER_CLUB}, ${FOREIGN}) as p`;
      expect(fp.leagues.upcomingFixtures.map((f: any) => f.id)).toEqual([F_FOREIGN_CLUB]);
      expect(await err(tx, `select mobile_player_competition_payload($1,$2,$3)`, [SECRET, CLUB, FOREIGN])).toContain("does not belong");
      expect(await err(tx, `select mobile_player_competition_payload($1,$2,$3)`, ["x".repeat(40), CLUB, M])).toContain("Unauthorized");
    });
  });
});
