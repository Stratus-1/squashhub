import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";
const port = process.env.MEMBER_TAB_TEST_PORT;
const suite = port ? describe : describe.skip;
const club = "11111111-1111-1111-1111-111111111111";
const member = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const user = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
suite("member tab authority in disposable PostgreSQL", () => {
  const sql = postgres({ host: "127.0.0.1", port: Number(port), database: "member_tab_test", username: "lovable", max: 1 });
  beforeAll(async () => {
    await sql.unsafe(`CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE clubs(id uuid PRIMARY KEY,honesty_bar_enabled boolean);
      CREATE TABLE club_members(id uuid PRIMARY KEY,club_id uuid,user_id uuid,status text,name text,phone text);
      CREATE TABLE qr_short_codes(club_id uuid,code text,active boolean,bar_item_id uuid,created_at timestamptz DEFAULT now());
      CREATE TABLE bar_guest_tabs(id uuid DEFAULT gen_random_uuid(),token uuid DEFAULT gen_random_uuid(),club_id uuid,club_member_id uuid,guest_name text,guest_phone text,status text DEFAULT 'open',opened_at timestamptz DEFAULT now());
      CREATE FUNCTION bar_counter_board(uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('operator', g.operator_name, 'settled_method', g.settled_method) FROM (SELECT NULL::text AS operator_name,NULL::text AS settled_method,NULL::text AS opened_source) g $$;`);
    await sql.unsafe(readFileSync("drizzle/migrations/0179_bar_member_self_opened_tabs.sql", "utf8"));
  });
  beforeEach(async () => {
    await sql.unsafe(`TRUNCATE bar_guest_tabs,club_members,clubs,qr_short_codes;
      INSERT INTO clubs VALUES('${club}',true);
      INSERT INTO club_members VALUES('${member}','${club}','${user}','active','Fictional member',NULL);
      INSERT INTO qr_short_codes(club_id,code,active) VALUES('${club}','test-menu',true);`);
    await sql`SELECT set_config('request.jwt.claim.sub',${user},false)`;
  });
  afterAll(async () => { await sql.end(); });
  const open = (clubId = club, memberId = member) => sql`SELECT open_my_bar_tab(${clubId}::uuid,${memberId}::uuid) AS result`;
  it("creates a counter-visible named in-app tab immediately with no sales", async () => {
    const [r] = await open();
    expect(r.result.guest_name).toBe("Fictional member");
    const [t] = await sql`SELECT club_id,club_member_id,opened_source,status FROM bar_guest_tabs`;
    expect(t).toEqual({ club_id: club, club_member_id: member, opened_source: "in_app", status: "open" });
  });
  it("reuses the same open tab on retry", async () => {
    const [a] = await open(); const [b] = await open();
    expect(b.result.tab_id).toBe(a.result.tab_id);
    expect((await sql`SELECT count(*)::int AS n FROM bar_guest_tabs`)[0].n).toBe(1);
  });
  it("does not replace a tab awaiting payment", async () => {
    const [a] = await open(); await sql`UPDATE bar_guest_tabs SET status='closing'`;
    expect((await open())[0].result.tab_id).toBe(a.result.tab_id);
  });
  it("opens a new tab only after the previous one is settled", async () => {
    const [a] = await open(); await sql`UPDATE bar_guest_tabs SET status='settled'`;
    expect((await open())[0].result.tab_id).not.toBe(a.result.tab_id);
  });
  it("rejects signed-out callers", async () => {
    await sql`SELECT set_config('request.jwt.claim.sub','',false)`;
    await expect(open()).rejects.toThrow("Sign in");
  });
  it("rejects another member's ownership", async () => {
    await sql`SELECT set_config('request.jwt.claim.sub',${member},false)`;
    await expect(open()).rejects.toThrow("not yours");
  });
  it("rejects a different club", async () => { await expect(open(user)).rejects.toThrow("not yours"); });
  it("rejects inactive membership", async () => {
    await sql`UPDATE club_members SET status='suspended'`;
    await expect(open()).rejects.toThrow("not active");
  });
});