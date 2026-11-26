import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

// This suite writes only to a disposable localhost database.
const port = process.env.CREDIT_TRANSFER_TEST_PORT;
(port ? describe : describe.skip)("Immediate member credit transfers", () => {
  const sql = postgres({ host: "127.0.0.1", port: Number(port), database: "postgres", username: "lovable", ssl: false, max: 1 });
  const club = "00000000-0000-0000-0000-000000000001";
  const sender = "00000000-0000-0000-0000-000000000002";
  const receiver = "00000000-0000-0000-0000-000000000003";
  const outsider = "00000000-0000-0000-0000-000000000004";
  beforeAll(async () => {
    await sql.unsafe(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE FUNCTION is_club_finance_writer(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE FUNCTION chairman_financial_write_allowed(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE TABLE club_members(id uuid PRIMARY KEY,club_id uuid,user_id uuid,name text,role text,status text);
      CREATE TABLE member_credit_transfers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid,from_member_id uuid,to_member_id uuid,amount numeric,note text,requested_by uuid,requested_as text,status text DEFAULT 'pending',journal_ref uuid,decided_by uuid,decided_at timestamptz,expires_at timestamptz DEFAULT now()+interval '14 days');
      CREATE TABLE club_journal_entries(club_id uuid,journal_ref uuid,account text,debit numeric DEFAULT 0,credit numeric DEFAULT 0,description text,club_member_id uuid);
      CREATE TABLE club_member_fee_payments(id uuid,club_member_id uuid,paid boolean,paid_at timestamptz,created_at timestamptz,amount numeric);
      CREATE TABLE ledger_audit_log(club_id uuid,journal_ref uuid,action text,actor_user_id uuid,after_json jsonb,note text);
      CREATE TABLE notifications(user_id uuid,club_member_id uuid,title text,message text,type text,url text,data jsonb,read boolean DEFAULT false);
      CREATE FUNCTION _member_net_credit(uuid,uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT coalesce(sum(credit-debit),0) FROM club_journal_entries WHERE club_id=$1 AND club_member_id=$2 AND account IN ('debtors','member_credits') $$;
    `);
    await sql.unsafe(readFileSync("drizzle/migrations/0518_immediate_member_credit_transfers.sql", "utf8"));
  });
  beforeEach(async () => {
    await sql.unsafe("TRUNCATE club_members,member_credit_transfers,club_journal_entries,club_member_fee_payments,ledger_audit_log,notifications");
    await sql`INSERT INTO club_members VALUES(${sender},${club},${sender},'Sender','member','active'),(${receiver},${club},NULL,'Child','member','active'),(${outsider},${outsider},${outsider},'Outside','member','active')`;
    await sql`INSERT INTO club_journal_entries(club_id,club_member_id,account,credit) VALUES(${club},${sender},'member_credits',742)`;
    await sql`SELECT set_config('test.uid',${sender},false)`;
  });
  afterAll(async () => { await sql.end(); });
  const transfer = (amount: number) => sql`SELECT request_member_credit_transfer(${club}::uuid,${sender}::uuid,${receiver}::uuid,${amount},NULL) id`;
  it("moves R150 immediately to a child without login or acceptance", async () => {
    await transfer(150);
    expect((await sql`SELECT _member_net_credit(${club}::uuid,${sender}::uuid) n`)[0].n).toBe("592");
    expect((await sql`SELECT _member_net_credit(${club}::uuid,${receiver}::uuid) n`)[0].n).toBe("150");
    expect((await sql`SELECT status,journal_ref FROM member_credit_transfers`)[0]).toMatchObject({ status: "accepted", journal_ref: expect.any(String) });
    expect((await sql`SELECT sum(debit-credit) n FROM club_journal_entries WHERE journal_ref IS NOT NULL`)[0].n).toBe("0");
    expect((await sql`SELECT count(*)::int n FROM ledger_audit_log`)[0].n).toBe(1);
  });
  it("rejects transfers exceeding available money without posting", async () => {
    await expect(transfer(743)).rejects.toThrow("Only 742.00 credit");
    expect((await sql`SELECT count(*)::int n FROM member_credit_transfers`)[0].n).toBe(0);
  });
  it("rejects another club's recipient", async () => {
    await expect(sql`SELECT request_member_credit_transfer(${club}::uuid,${sender}::uuid,${outsider}::uuid,150,NULL)`).rejects.toThrow("Both members must belong to this club");
  });
  it("never permits another member to transfer the sender's funds", async () => {
    await sql`SELECT set_config('test.uid',${outsider},false)`;
    await expect(transfer(150)).rejects.toThrow("You can only transfer your own credit");
  });
  it("settles receiver debt while preserving the full transferred value", async () => {
    await sql`INSERT INTO club_journal_entries(club_id,club_member_id,account,debit) VALUES(${club},${receiver},'debtors',50)`;
    await transfer(150);
    expect((await sql`SELECT _member_net_credit(${club}::uuid,${receiver}::uuid) n`)[0].n).toBe("100");
    expect((await sql`SELECT sum(debit-credit) n FROM club_journal_entries WHERE club_member_id=${receiver} AND account='debtors'`)[0].n).toBe("0");
  });
  it("does not post a completed transfer again when status is updated", async () => {
    const [{ id }] = await transfer(150);
    await sql`UPDATE member_credit_transfers SET status=status WHERE id=${id}`;
    expect((await sql`SELECT count(*)::int n FROM ledger_audit_log`)[0].n).toBe(1);
    expect((await sql`SELECT _member_net_credit(${club}::uuid,${receiver}::uuid) n`)[0].n).toBe("150");
  });
});