import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

// Disposable local PostgreSQL only; never use a hosted connection here.
const port = process.env.INVOICE_DUE_TEST_PORT;
const suite = port ? describe : describe.skip;
const club = "11111111-1111-1111-1111-111111111111";
const member = "10000000-0000-0000-0000-000000000001";
const memberB = "10000000-0000-0000-0000-000000000002";

suite("issued invoices not yet due do not reduce spending", () => {
  const sql = postgres({ host: "127.0.0.1", port: Number(port), database: "postgres", username: "lovable", max: 1 });
  beforeAll(async () => {
    await sql.unsafe(`
      CREATE SCHEMA auth;
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
      CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE clubs(id uuid PRIMARY KEY);
      CREATE TABLE club_members(id uuid PRIMARY KEY,club_id uuid,user_id uuid,email text,joined_at timestamptz DEFAULT now());
      CREATE TABLE club_member_credit_defaults(club_id uuid,amount numeric);
      CREATE TABLE member_credit_allowance_overrides(club_member_id uuid,club_id uuid,amount numeric);
      CREATE TABLE club_journal_entries(club_member_id uuid,club_id uuid,account text,debit numeric,credit numeric);
      CREATE TABLE stitch_mandates(club_member_id uuid,club_id uuid,status text,frequency text,suspended_at timestamptz);
      CREATE TABLE club_member_fee_payments(id uuid DEFAULT gen_random_uuid(),club_member_id uuid,paid_by_member_id uuid,club_id uuid,paid boolean,amount numeric,invoice_issued_at timestamptz,invoice_due_date date);
      INSERT INTO clubs VALUES('${club}');
      INSERT INTO club_members(id,club_id) VALUES('${member}','${club}'),('${memberB}','${club}');
      INSERT INTO club_member_credit_defaults VALUES('${club}',300);
    `);
    const original = readFileSync("drizzle/migrations/0163_member_credit_eligibility_allowances.sql", "utf8");
    const credit = original.slice(original.indexOf("CREATE OR REPLACE FUNCTION public.member_credit_allowed"), original.indexOf("CREATE OR REPLACE FUNCTION public.member_credit_settings"));
    await sql.unsafe(credit);
    await sql.unsafe(readFileSync("drizzle/migrations/0346_gate_ignore_not_yet_due_invoices.sql", "utf8"));
  });
  afterAll(async () => { await sql.end(); });
  const gate = async (id: string, extra = 0) =>
    (await sql`SELECT * FROM member_account_gate(${id}::uuid,${extra}::numeric)`)[0];

  it("a not-yet-due issued invoice does not reduce the available amount (R300 credit + R750 invoice = R1,050)", async () => {
    await sql`INSERT INTO club_member_fee_payments(club_member_id,club_id,paid,amount,invoice_issued_at,invoice_due_date)
      VALUES(${member},${club},false,750,now(),(now() AT TIME ZONE 'Africa/Johannesburg')::date + 30)`;
    expect(await gate(member)).toMatchObject({ current_owing: 750, allowance: 1050, shortfall: 0 });
  });

  it("an issued invoice past its due date counts against spending again (allowance back to R300)", async () => {
    await sql`UPDATE club_member_fee_payments SET invoice_due_date=(now() AT TIME ZONE 'Africa/Johannesburg')::date - 1 WHERE club_member_id=${member}`;
    expect(await gate(member)).toMatchObject({ current_owing: 750, allowance: 300, shortfall: 450 });
  });

  it("an unsent draft fee (no issue date) never blocks spending", async () => {
    await sql`INSERT INTO club_member_fee_payments(club_member_id,club_id,paid,amount) VALUES(${memberB},${club},false,900)`;
    expect(await gate(memberB)).toMatchObject({ current_owing: 0, allowance: 300 });
  });

  it("a paid invoice does not count at all", async () => {
    await sql`UPDATE club_member_fee_payments SET paid=true, invoice_issued_at=now(), invoice_due_date=(now() AT TIME ZONE 'Africa/Johannesburg')::date - 5 WHERE club_member_id=${member}`;
    expect(await gate(member)).toMatchObject({ current_owing: 0, allowance: 300, shortfall: 0 });
  });
});
