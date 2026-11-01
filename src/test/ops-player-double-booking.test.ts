import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const port = process.env.OPS_BOOKING_TEST_PORT;
const suite = port ? describe : describe.skip;
const admin = "11111111-1111-1111-1111-111111111111";
suite("maintenance blocks are not player participation", () => {
  const sql = postgres({ host: "127.0.0.1", port: Number(port), username: "lovable", database: "postgres", max: 1 });
  beforeAll(async () => {
    await sql.unsafe(`CREATE TABLE club_members(id uuid PRIMARY KEY,name text);
      CREATE TABLE bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),court_id integer,date date,start_time time,end_time time,status text,source text,booking_type text,club_member_id uuid,opponent_member_id uuid);
      INSERT INTO club_members VALUES('${admin}','Test administrator');`);
    await sql.unsafe(readFileSync("drizzle/migrations/0318_prevent_player_double_booking.sql", "utf8"));
    await sql.unsafe(readFileSync("drizzle/migrations/0334_exclude_ops_from_player_double_booking.sql", "utf8"));
  });
  beforeEach(async () => { await sql`TRUNCATE bookings`; });
  afterAll(async () => { await sql.end(); });
  const book = (court: number, type: string | null, opponent = false) => sql`
    INSERT INTO bookings(court_id,date,start_time,end_time,status,source,booking_type,club_member_id,opponent_member_id)
    VALUES(${court},'2026-11-01','13:00','14:00','active','squashhub',${type},${opponent ? null : admin},${opponent ? admin : null}) RETURNING id`;
  it("allows the same admin to block Court 1 and Court 2 for the same hour", async () => {
    await book(1, "ops"); await book(2, "ops");
    expect((await sql`SELECT count(*)::int AS n FROM bookings`)[0].n).toBe(2);
  });
  it("allows an ops block while its creator plays on another court", async () => {
    await book(1, "normal"); await book(2, "ops");
    expect((await sql`SELECT count(*)::int AS n FROM bookings`)[0].n).toBe(2);
  });
  it("does not count an existing ops creator against a personal booking", async () => {
    await book(1, "ops"); await book(2, null);
    expect((await sql`SELECT count(*)::int AS n FROM bookings`)[0].n).toBe(2);
  });
  it("still rejects overlapping personal games", async () => {
    await book(1, null);
    await expect(book(2, "normal")).rejects.toMatchObject({ code: "P0001" });
  });
  it("still rejects overlapping opponent participation", async () => {
    await book(1, "normal", true);
    await expect(book(2, "normal")).rejects.toMatchObject({ code: "P0001" });
  });
  it("rechecks clashes when an ops booking becomes a personal game", async () => {
    await book(1, "normal"); const [ops] = await book(2, "ops");
    await expect(sql`UPDATE bookings SET booking_type='normal' WHERE id=${ops.id}`).rejects.toMatchObject({ code: "P0001" });
    expect((await sql`SELECT booking_type FROM bookings WHERE id=${ops.id}`)[0].booking_type).toBe("ops");
  });
});