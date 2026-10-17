// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

// Disposable local PostgreSQL only; never use a hosted connection here.
const port = process.env.FAMILY_BOOKING_TEST_PORT;
const suite = port ? describe : describe.skip;
const club = "11111111-1111-1111-1111-111111111111";
const otherClub = "22222222-2222-2222-2222-222222222222";
const parent = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const otherUser = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const own = "10000000-0000-0000-0000-000000000001";
const child = "10000000-0000-0000-0000-000000000002";
const linked = "10000000-0000-0000-0000-000000000003";
const unrelated = "10000000-0000-0000-0000-000000000004";
const crossClub = "10000000-0000-0000-0000-000000000005";

suite("family booking server authority", () => {
  const sql = postgres({ host: "127.0.0.1", port: Number(port), database: "postgres", username: "lovable", max: 1 });
  beforeAll(async () => {
    await sql.unsafe(`
      CREATE SCHEMA auth;
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
      CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
      CREATE TABLE clubs(id uuid PRIMARY KEY,min_booking_balance numeric);
      CREATE TABLE courts(id integer PRIMARY KEY,club_id uuid);
      CREATE TABLE club_members(id uuid PRIMARY KEY,club_id uuid,user_id uuid,email text,joined_at timestamptz DEFAULT now());
      CREATE TABLE club_member_credit_defaults(club_id uuid,amount numeric);
      CREATE TABLE member_credit_allowance_overrides(club_member_id uuid,club_id uuid,amount numeric);
      CREATE TABLE club_journal_entries(club_member_id uuid,club_id uuid,account text,debit numeric,credit numeric);
      CREATE TABLE stitch_mandates(club_member_id uuid,club_id uuid,status text,frequency text,suspended_at timestamptz);
      CREATE TABLE club_member_fee_payments(club_member_id uuid,paid_by_member_id uuid,club_id uuid,paid boolean,amount numeric);
      CREATE TABLE member_account_delegations(grantor_member_id uuid,delegate_member_id uuid,club_id uuid,status text,scope text);
      CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
      CREATE FUNCTION is_club_admin_or_permitted(uuid,uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
      CREATE TABLE bookings(id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,court_id integer,club_id uuid,club_member_id uuid,user_id uuid,date date DEFAULT '2026-11-01',start_time time DEFAULT '10:00',end_time time DEFAULT '10:45',status text DEFAULT 'active');
      INSERT INTO auth.users VALUES('${parent}','parent@example.invalid',now()),('${otherUser}','other@example.invalid',now());
      INSERT INTO clubs VALUES('${club}',20),('${otherClub}',20);
      INSERT INTO courts VALUES(1,'${club}'),(2,'${otherClub}');
      INSERT INTO club_members(id,club_id,user_id,email) VALUES
        ('${own}','${club}','${parent}','parent@example.invalid'),
        ('${child}','${club}',NULL,'parent@example.invalid'),
        ('${linked}','${club}','${otherUser}','parent@example.invalid'),
        ('${unrelated}','${club}','${otherUser}','other@example.invalid'),
        ('${crossClub}','${otherClub}',NULL,'parent@example.invalid');
      INSERT INTO club_member_credit_defaults VALUES('${club}',300),('${otherClub}',300);
      INSERT INTO club_journal_entries VALUES('${child}','${club}','debtors',280,0);
      INSERT INTO member_account_delegations VALUES('${unrelated}','${own}','${club}','active','fees');
    `);
    const original = readFileSync("drizzle/migrations/0163_member_credit_eligibility_allowances.sql", "utf8");
    const credit = original.slice(original.indexOf("CREATE OR REPLACE FUNCTION public.member_credit_allowed"), original.indexOf("CREATE OR REPLACE FUNCTION public.member_credit_settings"));
    const gate = original.slice(original.indexOf("CREATE OR REPLACE FUNCTION public.member_account_gate"), original.indexOf("CREATE OR REPLACE FUNCTION public.member_booking_eligibility"));
    await sql.unsafe(credit + gate);
    await sql.unsafe(readFileSync("drizzle/migrations/0171_family_booking_verified_login_authority.sql", "utf8"));
    await sql.unsafe(`CREATE TRIGGER zz_enforce_booking_credit_allowance BEFORE INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION enforce_booking_credit_allowance();
      GRANT USAGE ON SCHEMA public,auth TO authenticated;
      GRANT SELECT,INSERT,UPDATE ON bookings TO authenticated;
      GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
      ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_booker ON bookings FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub','${parent}',false);`);
  });
  afterAll(async () => { await sql.end(); });
  const eligibility = async (id: string, extra = 0) => {
    const [row] = await sql`SELECT member_booking_eligibility(${club}::uuid,${id}::uuid,${extra}) AS result`;
    return row.result;
  };
  it("authorizes the parent's own membership", async () => {
    expect((await sql`SELECT can_book_linked_member(${club}::uuid,${own}::uuid) AS allowed`)[0].allowed).toBe(true);
  });
  it("authorizes an unclaimed child using verified shared email", async () => {
    expect(await eligibility(child)).toMatchObject({allowed:true,currentOwing:280,approvedCredit:300,requiredBuffer:20,effectiveAvailableBalance:20});
  });
  it("authorizes a separately linked shared-email identity", async () => {
    expect((await eligibility(linked)).allowed).toBe(true);
  });
  it("persists parent ownership and child playing identity", async () => {
    const [row] = await sql`INSERT INTO bookings(court_id,club_id,club_member_id,user_id) VALUES(1,${club},${child},${parent}) RETURNING user_id,club_member_id`;
    expect(row).toEqual({user_id:parent,club_member_id:child});
  });
  it("rejects a caller-supplied alternative owner", async () => {
    await expect(sql`INSERT INTO bookings(court_id,club_id,club_member_id,user_id) VALUES(1,${club},${child},${otherUser})`).rejects.toMatchObject({code:"42501"});
  });
  it("fee-only delegation grants neither eligibility nor booking", async () => {
    await expect(eligibility(unrelated)).rejects.toMatchObject({code:"42501"});
    await expect(sql`INSERT INTO bookings(court_id,club_id,club_member_id,user_id) VALUES(1,${club},${unrelated},${parent})`).rejects.toMatchObject({code:"42501"});
  });
  it("rejects cross-club selections", async () => {
    await expect(eligibility(crossClub)).rejects.toMatchObject({code:"42501"});
    await expect(sql`INSERT INTO bookings(court_id,club_id,club_member_id,user_id) VALUES(1,${club},${crossClub},${parent})`).rejects.toMatchObject({code:"42501"});
  });
  it("R300 allowance and R20 minimum reject pending owing of R280.01", async () => {
    expect(await eligibility(child,0.01)).toMatchObject({allowed:false,shortfall:0.01});
  });
  it("rejects a missing session", async () => {
    await sql`SELECT set_config('request.jwt.claim.sub','',false)`;
    try { await expect(eligibility(child)).rejects.toMatchObject({code:"42501"}); }
    finally { await sql`SELECT set_config('request.jwt.claim.sub',${parent},false)`; }
  });
  it("requires verified email for shared-login access", async () => {
    await sql.unsafe("RESET ROLE");
    await sql`UPDATE auth.users SET email_confirmed_at=NULL WHERE id=${parent}`;
    await sql.unsafe("SET ROLE authenticated");
    try { await expect(eligibility(child)).rejects.toMatchObject({code:"42501"}); }
    finally {
      await sql.unsafe("RESET ROLE");
      await sql`UPDATE auth.users SET email_confirmed_at=now() WHERE id=${parent}`;
      await sql.unsafe("SET ROLE authenticated");
    }
  });
  it("enforces the child balance on real inserts above the credit boundary", async () => {
    await sql.unsafe("RESET ROLE");
    await sql`UPDATE club_journal_entries SET debit=280.01 WHERE club_member_id=${child}`;
    await sql.unsafe("SET ROLE authenticated");
    await expect(sql`INSERT INTO bookings(court_id,club_id,club_member_id,user_id) VALUES(1,${club},${child},${parent})`).rejects.toMatchObject({code:"P0001"});
  });
  it("preserves qualifying recurring coverage independently of credit", async () => {
    await sql.unsafe("RESET ROLE");
    await sql`UPDATE club_journal_entries SET debit=1880 WHERE club_member_id=${child}`;
    await sql`INSERT INTO stitch_mandates VALUES(${child},${club},'active','monthly',NULL)`;
    await sql`INSERT INTO club_member_fee_payments VALUES(${child},NULL,${club},false,1600)`;
    await sql.unsafe("SET ROLE authenticated");
    expect(await eligibility(child)).toMatchObject({allowed:true,currentOwing:1880,planAllowedDebt:1600,approvedCredit:300,shortfall:0});
  });
});