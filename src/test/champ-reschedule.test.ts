import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

// Explicit disposable localhost database only. No hosted bookings or notifications.
const port = process.env.CHAMP_RESCHEDULE_TEST_PORT;
const suite = port ? describe : describe.skip;
const club = "11111111-1111-1111-1111-111111111111";
const player = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const opponent = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const match = "10000000-0000-0000-0000-000000000001";
const booking = "20000000-0000-0000-0000-000000000001";
const hold = "20000000-0000-0000-0000-000000000002";
suite("tournament linked booking reschedule", () => {
  const sql = postgres({host:"127.0.0.1", port:Number(port), database:"postgres", username:"lovable", max:1});
  const schedule = (date="2026-10-20", time="20:20", court=35) => sql`SELECT self_schedule_champ_match(${match}::uuid,${court},${date}::date,${time}::time,40) AS result`;
  beforeAll(async () => {
    await sql.unsafe(`
      CREATE SCHEMA auth; CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION is_member_owner(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1=auth.uid() $$;
      CREATE FUNCTION is_club_admin_or_permitted(uuid,uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
      CREATE FUNCTION tournament_bookable_court_ids(uuid,text,text) RETURNS integer[] LANGUAGE sql AS $$ SELECT ARRAY[35,36] $$;
      CREATE FUNCTION tournament_event_kind(uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'club'::text $$;
      CREATE FUNCTION tournament_host_club_ids(uuid) RETURNS uuid[] LANGUAGE sql AS $$ SELECT ARRAY['${club}'::uuid] $$;
      CREATE TABLE club_champs(id uuid PRIMARY KEY,club_id uuid,name text);
      CREATE TABLE courts(id integer PRIMARY KEY,club_id uuid);
      CREATE TABLE club_members(id uuid PRIMARY KEY,user_id uuid);
      CREATE TABLE club_champs_rounds(id uuid,label text);
      CREATE TABLE club_champs_matches(id uuid PRIMARY KEY,champ_id uuid,player_a_member_id uuid,player_b_member_id uuid,partner_a_member_id uuid,partner_b_member_id uuid,is_bye boolean DEFAULT false,status text,stage text,round_id uuid,booking_id uuid,court_id integer,scheduled_date date,scheduled_time time,updated_at timestamptz,play_by date,score text);
      CREATE TABLE bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid,court_id integer,user_id uuid,club_member_id uuid,opponent_id uuid,opponent_member_id uuid,date date,start_time time,end_time time,status text,is_friendly boolean,source text,external_id text,booking_type text,guest_name text,external_booker_name text,ops_note text,UNIQUE(club_id,source,external_id));
      CREATE TABLE notifications(user_id uuid,club_member_id uuid,title text,message text,type text,url text);
      INSERT INTO club_champs VALUES('${club}','${club}','Synthetic Champs');
      INSERT INTO courts VALUES(35,'${club}'),(36,'${club}');
      INSERT INTO club_members VALUES('${player}','${player}'),('${opponent}','${opponent}');
      GRANT USAGE ON SCHEMA public,auth TO authenticated;
      GRANT SELECT ON bookings,club_champs_matches TO authenticated;
      SELECT set_config('request.jwt.claim.sub','${player}',false);
    `);
    const original = readFileSync("drizzle/migrations/0149_self_schedule_fill_hold_option.sql","utf8");
    await sql.unsafe(original.slice(original.indexOf("CREATE OR REPLACE FUNCTION")));
    await sql.unsafe(readFileSync("supabase/migrations/20260907212743_1f3d1be8-895f-4a8f-a87b-3dc3505356db.sql","utf8"));
  });
  afterAll(async () => { await sql.end(); });
  beforeEach(async () => {
    await sql.unsafe(`RESET ROLE; TRUNCATE bookings,club_champs_matches,notifications;
      INSERT INTO club_champs_matches(id,champ_id,player_a_member_id,player_b_member_id,status,booking_id,court_id,scheduled_date,scheduled_time,play_by)
      VALUES('${match}','${club}','${player}','${opponent}','scheduled','${booking}',35,'2026-10-20','20:20','2026-10-22');
      INSERT INTO bookings(id,club_id,court_id,club_member_id,opponent_member_id,date,start_time,end_time,status,source,external_id)
      VALUES('${booking}','${club}',35,'${player}','${opponent}','2026-10-20','20:20','21:00','active','club_event','champ:${club}:match:${match}');
      SELECT set_config('request.jwt.claim.sub','${player}',false); SET ROLE authenticated;`);
  });
  it("reproduces the reported own-booking conflict before the fix", async () => {
    await expect(schedule()).rejects.toMatchObject({code:"23P01"});
    await sql.unsafe("RESET ROLE");
    await sql.unsafe(readFileSync("supabase/tests/champ-reschedule-fix.sql","utf8"));
    // Forward migration is idempotent.
    await sql.unsafe(readFileSync("supabase/tests/champ-reschedule-fix.sql","utf8"));
  });
  it("retries the same 20 Oct 20:20 slot without a duplicate or self-conflict", async () => {
    expect((await schedule())[0].result.booking_id).toBe(booking);
    expect((await sql`SELECT count(*)::int AS n FROM bookings WHERE status='active'`)[0].n).toBe(1);
  });
  it("moves to 19 Oct 19:30 and reads back the same booking identity and deadline", async () => {
    expect((await schedule("2026-10-19","19:30",36))[0].result.booking_id).toBe(booking);
    const [row] = await sql`SELECT court_id,start_time,date::text AS date FROM bookings WHERE id=${booking}`;
    expect(row).toEqual({court_id:36,start_time:"19:30:00",date:"2026-10-19"});
    expect((await sql`SELECT booking_id,play_by::text AS play_by FROM club_champs_matches WHERE id=${match}`)[0]).toEqual({booking_id:booking,play_by:"2026-10-22"});
  });
  it("restores the old reserved slot only after the original match booking moves", async () => {
    await sql.unsafe(`RESET ROLE; INSERT INTO bookings(id,club_id,court_id,date,start_time,end_time,status,external_booker_name,ops_note)
      VALUES('${hold}','${club}',35,'2026-10-20','20:15','21:00','cancelled','Club Championships','Released for tournament match ${match}'); SET ROLE authenticated;`);
    await schedule("2026-10-19","19:30",36);
    expect((await sql`SELECT status FROM bookings WHERE id=${hold}`)[0].status).toBe("active");
  });
  it("rejects another court booking and leaves the existing match slot unchanged", async () => {
    await sql.unsafe(`RESET ROLE; INSERT INTO bookings(club_id,court_id,date,start_time,end_time,status) VALUES('${club}',36,'2026-10-19','19:30','20:15','active'); SET ROLE authenticated;`);
    await expect(schedule("2026-10-19","19:30",36)).rejects.toMatchObject({code:"23505"});
    expect((await sql`SELECT date::text AS date,start_time FROM bookings WHERE id=${booking}`)[0]).toEqual({date:"2026-10-20",start_time:"20:20:00"});
  });
  it("rejects a player clash on another court", async () => {
    await sql.unsafe(`RESET ROLE; INSERT INTO bookings(club_id,court_id,club_member_id,date,start_time,end_time,status) VALUES('${club}',35,'${player}','2026-10-19','19:30','20:15','active'); SET ROLE authenticated;`);
    await expect(schedule("2026-10-19","19:30",36)).rejects.toMatchObject({code:"23505"});
  });
  it("rejects unrelated callers and signed-out requests", async () => {
    await sql`SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-cccc-cccc-cccccccccccc',false)`;
    await expect(schedule()).rejects.toMatchObject({code:"42501"});
    await sql`SELECT set_config('request.jwt.claim.sub','',false)`;
    await expect(schedule()).rejects.toMatchObject({code:"42501"});
  });
});