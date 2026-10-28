import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const port = process.env.CHAMP_PAID_TEST_PORT;
const club = "11111111-1111-1111-1111-111111111111";
const champ = "22222222-2222-2222-2222-222222222222";
const reg = "33333333-3333-3333-3333-333333333333";
const fee = "44444444-4444-4444-4444-444444444444";
const other = "55555555-5555-5555-5555-555555555555";
// Disposable localhost only: never run a payment action on a real registration.
(port ? describe : describe.skip)("atomic tournament Paid authority", () => {
  const sql = postgres({ host: "127.0.0.1", port: Number(port), database: "postgres", username: "lovable", max: 1 });
  beforeAll(async () => {
    await sql.unsafe(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${other}'::uuid $$;
      CREATE TABLE test_permissions(club_id uuid, permission text);
      CREATE FUNCTION is_club_admin_or_permitted(u uuid,c uuid,p text) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM test_permissions WHERE club_id=c AND permission=p) $$;
      CREATE TABLE tournaments(id uuid PRIMARY KEY, club_id uuid);
      CREATE TABLE club_members(id uuid PRIMARY KEY, club_id uuid);
      CREATE TABLE club_member_fee_payments(id uuid PRIMARY KEY,club_member_id uuid,paid boolean,paid_at timestamptz);
      CREATE TABLE club_champs_registrations(id uuid PRIMARY KEY,champ_id uuid,status text,registration_status text,fee_status text,fee_payment_id uuid,fee_paid_cents integer,paid_at timestamptz,payment_ref text);
      CREATE TABLE audit_events(club_id uuid,actor_user_id uuid,entity_type text,entity_id uuid,action text,before_data jsonb,after_data jsonb);
      CREATE FUNCTION champ_reg_own_due_cents(r uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 10000 $$;
      CREATE FUNCTION test_paid_status() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='paid' THEN NEW.fee_status:='paid'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER derive_paid BEFORE UPDATE ON club_champs_registrations FOR EACH ROW EXECUTE FUNCTION test_paid_status();`);
    await sql.unsafe(readFileSync("drizzle/migrations/0287_champ_admin_confirm_paid.sql", "utf8"));
  });
  beforeEach(async () => {
    await sql.unsafe(`TRUNCATE tournaments,club_members,club_member_fee_payments,club_champs_registrations,audit_events,test_permissions;
      INSERT INTO tournaments VALUES('${champ}','${club}');
      INSERT INTO club_members VALUES('${other}','${club}');
      INSERT INTO club_member_fee_payments VALUES('${fee}','${other}',false,NULL);
      INSERT INTO club_champs_registrations(id,champ_id,status,registration_status,fee_status,fee_payment_id) VALUES('${reg}','${champ}','invited','registered','on_account','${fee}');
      INSERT INTO test_permissions VALUES('${club}','finance');`);
  });
  afterAll(async () => { await sql.end(); });
  const confirm = (c = club, t = champ) => sql`SELECT champ_admin_confirm_paid(${c}::uuid,${t}::uuid,${reg}::uuid) AS result`;
  it("allows a Treasurer with finance but no champs permission to settle R100", async () => {
    await confirm();
    expect((await sql`SELECT paid FROM club_member_fee_payments`)[0].paid).toBe(true);
    expect((await sql`SELECT status,fee_paid_cents FROM club_champs_registrations`)[0]).toMatchObject({ status: "paid", fee_paid_cents: 10000 });
    expect((await sql`SELECT count(*)::int AS n FROM audit_events`)[0].n).toBe(1);
  });
  it("does not create replacement fees on repeated Paid confirmation", async () => {
    await confirm(); await confirm();
    expect((await sql`SELECT count(*)::int AS n FROM club_member_fee_payments`)[0].n).toBe(1);
    expect((await sql`SELECT count(*)::int AS n FROM audit_events`)[0].n).toBe(1);
  });
  it("denies ordinary members", async () => {
    await sql`TRUNCATE test_permissions`;
    await expect(confirm()).rejects.toThrow("Only club tournament or finance");
    expect((await sql`SELECT paid FROM club_member_fee_payments`)[0].paid).toBe(false);
  });
  it("rejects a different club", async () => { await expect(confirm(other)).rejects.toThrow("Tournament not found"); });
  it("rejects a registration from another tournament", async () => {
    await sql`INSERT INTO tournaments VALUES(${other},${club})`;
    await expect(confirm(club,other)).rejects.toThrow("Registration not found");
  });
  it("rejects linked fees from another club", async () => {
    await sql`UPDATE club_members SET club_id=${other}`;
    await expect(confirm()).rejects.toThrow("belongs to another club");
  });
  it("rolls back fee settlement if registration confirmation fails", async () => {
    await sql.unsafe(`ALTER TABLE club_champs_registrations ADD CONSTRAINT test_fail CHECK(status <> 'paid')`);
    try {
      await expect(confirm()).rejects.toThrow("test_fail");
      expect((await sql`SELECT paid FROM club_member_fee_payments`)[0].paid).toBe(false);
      expect((await sql`SELECT count(*)::int AS n FROM audit_events`)[0].n).toBe(0);
    } finally { await sql.unsafe("ALTER TABLE club_champs_registrations DROP CONSTRAINT test_fail"); }
  });
});