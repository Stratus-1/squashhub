import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const port = process.env.SCHEDULED_CHAMP_TEST_PORT;
const suite = port ? describe : describe.skip;
const champ = "11111111-1111-1111-1111-111111111111";
const match = "22222222-2222-2222-2222-222222222222";
suite("scheduled championship allocations protect court slots", () => {
  const sql = postgres({ host: "127.0.0.1", port: Number(port), username: "lovable", database: "postgres", max: 1 });
  beforeAll(async () => {
    await sql.unsafe(`CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE tournaments(id uuid,group_durations jsonb,beta_lifecycle jsonb,match_duration_minutes integer);
      CREATE TABLE club_champs_matches(id uuid,champ_id uuid,group_number integer,booking_id uuid,scheduled_date date,scheduled_time time,court_id integer,is_bye boolean,status text,player_a_member_id uuid,player_b_member_id uuid,partner_a_member_id uuid,partner_b_member_id uuid);
      CREATE TABLE bookings(id uuid DEFAULT gen_random_uuid(),court_id integer,date date,start_time time,end_time time,status text,source text,external_id text,external_booker_name text,user_id uuid,opponent_id uuid,club_member_id uuid,opponent_member_id uuid);
      INSERT INTO tournaments VALUES('${champ}','{}','{"format_plan":{"scheduling":{"singles":35}}}',30);`);
    await sql.unsafe(readFileSync("drizzle/migrations/0193_protect_scheduled_championship_slots.sql", "utf8"));
  });
  afterAll(async () => { await sql.end(); });
  beforeEach(async () => {
    await sql.unsafe(`TRUNCATE bookings,club_champs_matches;
      INSERT INTO club_champs_matches(id,champ_id,group_number,scheduled_date,scheduled_time,court_id,status)
      VALUES('${match}','${champ}',1,'2026-10-20','18:00',27,'scheduled');`);
  });
  const book = (start: string, end: string, court = 27, external: string | null = null) => sql`INSERT INTO bookings(court_id,date,start_time,end_time,status,source,external_id) VALUES(${court},'2026-10-20',${start}::time,${end}::time,'active','club_event',${external})`;
  it("rejects a player taking Court 1 at 18:00 even without a linked booking", async () => {
    await expect(book("18:00", "18:35")).rejects.toMatchObject({ code: "23505" });
    expect((await sql`SELECT count(*)::int AS n FROM bookings`)[0].n).toBe(0);
    expect((await sql`SELECT court_id,scheduled_time FROM club_champs_matches`)[0]).toEqual({ court_id: 27, scheduled_time: "18:00:00" });
  });
  it("protects the full configured 35 minutes rather than the legacy 30", async () => {
    await expect(book("18:30", "19:05")).rejects.toMatchObject({ code: "23505" });
    await book("18:35", "19:10");
    expect((await sql`SELECT count(*)::int AS n FROM bookings`)[0].n).toBe(1);
  });
  it("allows the scheduled fixture to acquire its own booking", async () => {
    await book("18:00", "18:35", 27, `champ:${champ}:match:${match}`);
    expect((await sql`SELECT count(*)::int AS n FROM bookings`)[0].n).toBe(1);
  });
  it("leaves other courts available", async () => {
    await book("18:00", "18:35", 35);
    expect((await sql`SELECT court_id FROM bookings`)[0].court_id).toBe(35);
  });
  it("rejects moving an existing booking into the scheduled slot", async () => {
    await book("19:10", "19:45");
    await expect(sql`UPDATE bookings SET start_time='18:00',end_time='18:35'`).rejects.toMatchObject({ code: "23505" });
    expect((await sql`SELECT start_time FROM bookings`)[0].start_time).toBe("19:10:00");
  });
});