import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
const port = process.env.CHAMP_FEE_TEST_PORT;
const suite = port ? describe : describe.skip;
const member = '11111111-1111-1111-1111-111111111111';
const fee = '22222222-2222-2222-2222-222222222222';
// Explicit disposable localhost only; no hosted credentials or real payments.
suite('tournament fee payments survive recalculation', () => {
  const sql = postgres({ host: '127.0.0.1', port: Number(port), database: 'postgres', username: 'lovable', max: 1 });
  beforeAll(async () => {
    await sql.unsafe(`CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE TABLE club_members(id uuid PRIMARY KEY,club_id uuid);
      CREATE TABLE club_member_fee_payments(id uuid PRIMARY KEY,club_member_id uuid,amount numeric,paid boolean DEFAULT false,invoice_issued_at timestamptz,fee_label text);
      CREATE TABLE club_champs_registrations(fee_payment_id uuid);
      CREATE TABLE club_journal_entries(club_id uuid,club_member_id uuid,fee_payment_id uuid,account text,debit numeric,credit numeric,description text,journal_ref uuid);
      CREATE TABLE ledger_audit_log(club_id uuid,journal_ref uuid,action text,actor_user_id uuid,after_json jsonb,note text);
      INSERT INTO club_members VALUES('${member}','${member}');`);
    await sql.unsafe(readFileSync('drizzle/migrations/0206_champ_fee_adjust_preserve_payments.sql', 'utf8'));
  });
  beforeEach(async () => {
    await sql.unsafe(`TRUNCATE club_member_fee_payments,club_journal_entries,ledger_audit_log;
      INSERT INTO club_member_fee_payments(id,club_member_id,amount,fee_label) VALUES('${fee}','${member}',40,'Entry fee');
      INSERT INTO club_journal_entries(club_id,fee_payment_id,account,debit,credit) VALUES('${member}','${fee}','tournament_income',0,100);`);
  });
  afterAll(async () => { await sql.end(); });
  const adjust = (amount: number) => sql`SELECT _champ_fee_adjust(${fee}::uuid,${amount},'Test refresh')`;
  it('does not re-raise R60 paid against an existing R100 fee', async () => {
    await adjust(100); await adjust(100);
    expect((await sql`SELECT amount::float AS n FROM club_member_fee_payments`)[0].n).toBe(40);
    expect((await sql`SELECT count(*)::int AS n FROM club_journal_entries`)[0].n).toBe(1);
  });
  it('a fully settled R100 top-up fee is not charged again', async () => {
    await sql`UPDATE club_member_fee_payments SET amount=100,paid=true`;
    await adjust(100);
    expect((await sql`SELECT count(*)::int AS n FROM club_journal_entries`)[0].n).toBe(1);
    expect((await sql`SELECT paid FROM club_member_fee_payments`)[0].paid).toBe(true);
  });
  it('a genuine extra R100 event keeps the prior R60 payment', async () => {
    await adjust(200); await adjust(200);
    expect((await sql`SELECT amount::float AS n FROM club_member_fee_payments`)[0].n).toBe(140);
    expect((await sql`SELECT sum(debit)::float AS n FROM club_journal_entries WHERE account='debtors'`)[0].n).toBe(100);
  });
  it('a genuine fee reduction retains the payment', async () => {
    await adjust(80);
    expect((await sql`SELECT amount::float AS n FROM club_member_fee_payments`)[0].n).toBe(20);
    expect((await sql`SELECT sum(credit)::float AS n FROM club_journal_entries WHERE account='debtors'`)[0].n).toBe(20);
  });
  it('retains invoice immutability', async () => {
    await sql`UPDATE club_member_fee_payments SET invoice_issued_at=now()`;
    await adjust(200);
    expect((await sql`SELECT amount::float AS n FROM club_member_fee_payments`)[0].n).toBe(40);
  });
  it('does not read another clubs assessment', async () => {
    await sql`UPDATE club_journal_entries SET club_id='33333333-3333-3333-3333-333333333333'`;
    await adjust(100);
    expect((await sql`SELECT amount::float AS n FROM club_member_fee_payments`)[0].n).toBe(100);
  });
});