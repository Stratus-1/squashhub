import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const port = process.env.LEAGUE_STAFF_TEST_PORT;
(port ? describe : describe.skip)("League staff roster and pair policies", () => {
  const sql = postgres({ host: "127.0.0.1", port: Number(port), database: "postgres", username: "lovable", ssl: false, max: 1 });
  const club = "11111111-1111-1111-1111-111111111111";
  const other = "22222222-2222-2222-2222-222222222222";
  const staff = "33333333-3333-3333-3333-333333333333";
  const member = "44444444-4444-4444-4444-444444444444";
  const second = "55555555-5555-5555-5555-555555555555";
  const outsider = "66666666-6666-6666-6666-666666666666";
  beforeAll(async () => {
    await sql.unsafe(`CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE TABLE permissions(user_id uuid,club_id uuid,slug text);
      INSERT INTO permissions VALUES('${staff}','${club}','leagues');
      CREATE FUNCTION has_club_permission(uuid,uuid,text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM permissions WHERE user_id=$1 AND club_id=$2 AND slug=$3) $$;
      CREATE TABLE club_members(id uuid PRIMARY KEY,club_id uuid);
      INSERT INTO club_members VALUES('${member}','${club}'),('${second}','${club}'),('${outsider}','${other}');
      CREATE TABLE leagues(id uuid PRIMARY KEY,club_id uuid,season_id uuid);
      INSERT INTO leagues VALUES('${club}','${club}',NULL),('${other}','${other}',NULL);
      CREATE TABLE member_league_registrations(id uuid DEFAULT gen_random_uuid(),club_member_id uuid,league_id uuid,player_rank int);
      CREATE TABLE league_team_pairs(id uuid DEFAULT gen_random_uuid(),club_id uuid,league_id uuid,season_id uuid,player_one_member_id uuid,player_two_member_id uuid,pair_order int);
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT SELECT ON club_members,leagues TO authenticated;
      GRANT SELECT,INSERT,UPDATE,DELETE ON member_league_registrations,league_team_pairs TO authenticated;
      ALTER TABLE member_league_registrations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE league_team_pairs ENABLE ROW LEVEL SECURITY;
      CREATE POLICY read_roster ON member_league_registrations FOR SELECT TO authenticated USING(true);
      CREATE POLICY read_pairs ON league_team_pairs FOR SELECT TO authenticated USING(true);`);
    const scope = readFileSync("supabase/migrations/20260823164049_e84675f3-48e8-435e-bd2d-cf24b41971ad.sql", "utf8");
    await sql.unsafe(scope.slice(scope.indexOf("CREATE OR REPLACE FUNCTION"), scope.indexOf("CREATE UNIQUE INDEX")));
    await sql.unsafe(readFileSync("drizzle/migrations/0339_league_registrations_leagues_permission.sql", "utf8"));
    await sql.unsafe(readFileSync("drizzle/migrations/0340_league_pairs_leagues_permission.sql", "utf8"));
    await sql.unsafe("SET ROLE authenticated");
    await sql`SELECT set_config('test.uid',${staff},false)`;
  });
  afterAll(async () => { await sql.end(); });
  it("League-only staff save players and doubles pairs and read them back", async () => {
    await sql`INSERT INTO member_league_registrations(club_member_id,league_id,player_rank) VALUES(${member},${club},1),(${second},${club},2)`;
    await sql`INSERT INTO league_team_pairs(club_id,league_id,player_one_member_id,player_two_member_id,pair_order) VALUES(${club},${club},${member},${second},1)`;
    expect((await sql`SELECT count(*)::int n FROM member_league_registrations`)[0].n).toBe(2);
    expect((await sql`SELECT player_one_member_id,player_two_member_id,pair_order FROM league_team_pairs`)[0]).toEqual({player_one_member_id:member,player_two_member_id:second,pair_order:1});
  });
  it("League-only staff can edit their pair", async () => {
    expect((await sql`UPDATE league_team_pairs SET pair_order=2 RETURNING pair_order`)[0].pair_order).toBe(2);
  });
  it("rejects pair members from a different club", async () => {
    await expect(sql`INSERT INTO league_team_pairs(club_id,league_id,player_one_member_id,player_two_member_id) VALUES(${club},${club},${member},${outsider})`).rejects.toThrow("Both players");
  });
  it("cannot spoof club ownership to write another club's league", async () => {
    await expect(sql`INSERT INTO league_team_pairs(club_id,league_id,player_one_member_id,player_two_member_id) VALUES(${club},${other},${outsider},${outsider})`).rejects.toThrow("row-level security");
    await expect(sql`UPDATE league_team_pairs SET league_id=${other},player_one_member_id=${outsider},player_two_member_id=${outsider}`).rejects.toThrow("row-level security");
    expect((await sql`SELECT club_id FROM league_team_pairs`)[0].club_id).toBe(club);
  });
  it("ordinary members cannot insert, update or delete staff pairs", async () => {
    await sql`SELECT set_config('test.uid',${member},false)`;
    await expect(sql`INSERT INTO league_team_pairs(club_id,league_id,player_one_member_id,player_two_member_id) VALUES(${club},${club},${member},${second})`).rejects.toThrow("row-level security");
    expect((await sql`UPDATE league_team_pairs SET pair_order=9 RETURNING id`).length).toBe(0);
    expect((await sql`DELETE FROM league_team_pairs RETURNING id`).length).toBe(0);
    await sql`SELECT set_config('test.uid',${staff},false)`;
  });
  it("League-only staff can remove their own roster and pairs", async () => {
    expect((await sql`DELETE FROM league_team_pairs RETURNING id`).length).toBe(1);
    expect((await sql`DELETE FROM member_league_registrations RETURNING id`).length).toBe(2);
  });
});