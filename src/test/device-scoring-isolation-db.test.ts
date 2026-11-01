import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const port = process.env.DEVICE_SCORING_TEST_PORT;
const suite = port ? describe : describe.skip;
const live = "11111111-1111-1111-1111-111111111111";
const device = "22222222-2222-2222-2222-222222222222";
const club = "33333333-3333-3333-3333-333333333333";
const owner = "44444444-4444-4444-4444-444444444444";
suite("device reservation is isolated to its explicit match", () => {
 const sql = postgres({ host: "127.0.0.1", port: Number(port), username: "lovable", database: "postgres", max: 1 });
 beforeAll(async () => {
  await sql.unsafe(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE clubs(id uuid PRIMARY KEY);
   CREATE TABLE club_champs_matches(id uuid PRIMARY KEY,score text,status text);
   CREATE TABLE matches(id uuid PRIMARY KEY);
   CREATE FUNCTION public.save_marker_match_result(_match_id uuid,_club_id uuid,_player_a_member_id uuid,_player_b_member_id uuid,_winner_member_id uuid,_score text,_game_scores text,_duration_s integer,_confirmed boolean,_notes text,_tournament_match_id uuid DEFAULT NULL)
   RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE _existing uuid; BEGIN
   SELECT id INTO _existing FROM public.matches WHERE id = _match_id;
   INSERT INTO matches VALUES(_match_id) ON CONFLICT DO NOTHING;
   UPDATE club_champs_matches SET score=_score,status='completed' WHERE id=_tournament_match_id;
   RETURN _match_id; END $$;
   INSERT INTO clubs VALUES('${club}');
   GRANT UPDATE,DELETE,SELECT ON club_champs_matches TO authenticated;`);
  await sql.unsafe(readFileSync("drizzle/migrations/0335_device_scoring_match_only_guard_foundation.sql", "utf8"));
 });
 beforeEach(async () => {
  await sql.unsafe(`TRUNCATE champ_device_reservations,champ_device_write_context,club_champs_matches,matches;
   INSERT INTO club_champs_matches VALUES('${live}','0-0','scheduled'),('${device}','0-0','scheduled');
   INSERT INTO champ_device_reservations(match_id,club_id,session_id,created_at) VALUES('${device}','${club}','${owner}',now()-interval '2 hours');`);
 });
 afterAll(async () => { await sql.end(); });
 it("Court 1 Live continues while Court 2 has an offline reservation", async () => {
  await sql`UPDATE club_champs_matches SET score='1-0',status='in_progress' WHERE id=${live}`;
  expect((await sql`SELECT score FROM club_champs_matches WHERE id=${live}`)[0].score).toBe("1-0");
 });
 it("another phone cannot score the reserved match even after two hours offline", async () => {
  await expect(sql`UPDATE club_champs_matches SET score='1-0' WHERE id=${device}`).rejects.toMatchObject({ code: "42501" });
  expect((await sql`SELECT score FROM club_champs_matches WHERE id=${device}`)[0].score).toBe("0-0");
 });
 it("cannot bypass protection by resetting or deleting the reserved match", async () => {
  await expect(sql`UPDATE club_champs_matches SET status='completed' WHERE id=${device}`).rejects.toMatchObject({ code: "42501" });
  await expect(sql`DELETE FROM club_champs_matches WHERE id=${device}`).rejects.toMatchObject({ code: "42501" });
 });
 it("a private transaction context authorises only its reserved match", async () => {
  await sql.begin(async tx => {
   await tx`INSERT INTO champ_device_write_context(match_id,session_id) VALUES(${device},${owner})`;
   await tx`UPDATE club_champs_matches SET score='2-0' WHERE id=${device}`;
  });
  expect((await sql`SELECT score FROM club_champs_matches WHERE id=${device}`)[0].score).toBe("2-0");
  await expect(sql`UPDATE club_champs_matches SET score='3-0' WHERE id=${device}`).rejects.toMatchObject({ code: "42501" });
 });
 it("an old or wrong device session cannot authorise a write", async () => {
  await expect(sql.begin(async tx => {
   await tx`INSERT INTO champ_device_write_context(match_id,session_id) VALUES(${device},${live})`;
   await tx`UPDATE club_champs_matches SET score='2-0' WHERE id=${device}`;
  })).rejects.toMatchObject({ code: "42501" });
 });
 it("ordinary completion cannot create a conflicting separate result", async () => {
  await expect(sql`SELECT save_marker_match_result(${owner},${club},null,null,null,'7-0',null,30,true,null,${device})`).rejects.toMatchObject({ code: "42501" });
  expect((await sql`SELECT count(*)::int AS n FROM matches`)[0].n).toBe(0);
 });
 it("ordinary Live completion still saves its result", async () => {
  await sql`SELECT save_marker_match_result(${owner},${club},null,null,null,'7-0',null,30,true,null,${live})`;
  expect((await sql`SELECT status FROM club_champs_matches WHERE id=${live}`)[0].status).toBe("completed");
  expect((await sql`SELECT count(*)::int AS n FROM matches`)[0].n).toBe(1);
 });
 it("clients cannot forge reservation authority", async () => {
  await sql.unsafe("SET ROLE authenticated");
  try {
   await expect(sql`INSERT INTO champ_device_write_context(match_id,session_id) VALUES(${device},${owner})`).rejects.toMatchObject({ code: "42501" });
   await expect(sql`UPDATE champ_device_reservations SET revoked_at=now() WHERE match_id=${device}`).rejects.toMatchObject({ code: "42501" });
  } finally { await sql.unsafe("RESET ROLE"); }
 });
});