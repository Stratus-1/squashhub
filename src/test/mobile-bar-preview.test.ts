import { beforeAll, afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";
const port = process.env.BAR_PREVIEW_TEST_PORT;
const suite = port ? describe : describe.skip;
const member = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
suite("Bar preview migration authorization", () => {
  const db = postgres({ host: "127.0.0.1", port: Number(port), database: "postgres", username: "lovable", max: 1 });
  beforeAll(async () => {
    await db.unsafe(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      CREATE TABLE club_members(id uuid,club_id uuid,user_id uuid,status text);
      INSERT INTO club_members VALUES ('${member}','33333333-3333-4333-8333-333333333333','${user}','active');
      CREATE TABLE club_bar_settings(club_id uuid,bar_allow_member_debit boolean,shop_allow_member_debit boolean);
      INSERT INTO club_bar_settings VALUES ('33333333-3333-4333-8333-333333333333',false,true);
      CREATE FUNCTION is_club_admin_or_permitted(uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.admin',true)='true'$$;
      CREATE FUNCTION bar_staff_can_serve(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.staff',true)='true'$$;
      CREATE FUNCTION mobile_internal_secret_ok(text) RETURNS boolean LANGUAGE sql AS $$SELECT $1='local-test-secret-only'$$;
      CREATE FUNCTION member_account_gate(uuid,numeric) RETURNS TABLE(current_owing numeric,allowance numeric) LANGUAGE sql AS $$SELECT 750::numeric,1050::numeric$$;
    `);
    await db.unsafe(readFileSync("drizzle/migrations/0358_mobile_bar_account_charge_preview.sql", "utf8"));
  });
  afterAll(async () => { await db.end(); });
  const call = async (role: string, uid: string | null, secret?: string | null, flags: { admin?: boolean; staff?: boolean } = {}) => db.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE ${role}`);
    await tx`SELECT set_config('request.jwt.claim.sub',${uid ?? ""},true),set_config('test.admin',${String(flags.admin ?? false)},true),set_config('test.staff',${String(flags.staff ?? false)},true)`;
    return secret === undefined ? tx`SELECT * FROM bar_account_charge_preview(${member}::uuid)` : tx`SELECT * FROM bar_account_charge_preview(${member}::uuid,${secret}::text)`;
  });
  it("preserves the authenticated own-member one-argument call", async () => expect((await call("authenticated",user))[0]).toEqual({ bar_gated:true,shop_gated:false,current_owing:"750",allowance:"1050" }));
  it.each(["admin","staff"])("preserves web %s authorization", async (flag) => expect((await call("authenticated","44444444-4444-4444-8444-444444444444",undefined,{ [flag]:true })).length).toBe(1));
  it("denies unrelated web accounts", async () => expect(call("authenticated","44444444-4444-4444-8444-444444444444")).rejects.toMatchObject({code:"42501"}));
  it("denies null authenticated identity", async () => expect(call("authenticated",null)).rejects.toMatchObject({code:"42501"}));
  it("accepts service bridge only with valid internal secret", async () => expect((await call("service_role",null,"local-test-secret-only"))[0].allowance).toBe("1050"));
  it("denies invalid internal secret", async () => expect(call("service_role",null,"invalid")).rejects.toMatchObject({code:"42501"}));
  it.each(["anon","authenticated"])("denies %s access to secret overload", async (role) => expect(call(role,user,"local-test-secret-only")).rejects.toMatchObject({code:"42501"}));
  it("service role without secret does not bypass web ownership", async () => expect(call("service_role",null,null)).rejects.toMatchObject({code:"42501"}));
  it("rejects inactive mobile member", async () => {
    await db`UPDATE club_members SET status='suspended'`;
    try { await expect(call("service_role",null,"local-test-secret-only")).rejects.toMatchObject({code:"42501"}); }
    finally { await db`UPDATE club_members SET status='active'`; }
  });
  it("rejects unlinked mobile member", async () => {
    await db`UPDATE club_members SET user_id=NULL`;
    try { await expect(call("service_role",null,"local-test-secret-only")).rejects.toMatchObject({code:"42501"}); }
    finally { await db`UPDATE club_members SET user_id=${user}::uuid`; }
  });
});