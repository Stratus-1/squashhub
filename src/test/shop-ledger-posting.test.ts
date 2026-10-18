import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";
const port = process.env.SHOP_LEDGER_TEST_PORT;
const suite = port ? describe : describe.skip;
const club = "11111111-1111-1111-1111-111111111111", shop = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", bar = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
suite("division GL posting in disposable PostgreSQL", () => {
 const sql = postgres({ host: "127.0.0.1", port: Number(port), database: "shop_ledger_test", username: "lovable", max: 1 });
 beforeAll(async () => {
  await sql.unsafe(`CREATE TYPE gl_account AS ENUM('debtors','bank_current','cash','creditors','bar_income','bar_expense');
   CREATE TABLE bar_items(id uuid,club_id uuid,division text,name text);
   CREATE TABLE club_members(id uuid,name text);
   CREATE TABLE club_journal_entries(club_id uuid,journal_ref uuid,account gl_account,debit numeric,credit numeric,description text,club_member_id uuid,created_at timestamptz DEFAULT now());
   CREATE TABLE bar_tab_entries(id uuid DEFAULT gen_random_uuid(),club_id uuid,bar_item_id uuid,club_member_id uuid,total numeric,quantity int);
   CREATE TABLE bar_visitor_sales(id uuid DEFAULT gen_random_uuid(),club_id uuid,bar_item_id uuid,total numeric,quantity int,payment_method text,visitor_name text,payment_reference text,payment_status text,created_at timestamptz DEFAULT now());
   CREATE TABLE bar_stock_purchases(id uuid DEFAULT gen_random_uuid(),club_id uuid,bar_item_id uuid,total_cost numeric,unit_cost numeric,quantity int,payment_method text,invoice_number text,invoice_date date,created_at timestamptz DEFAULT now());
   CREATE FUNCTION post_gateway_fee(uuid,uuid,numeric,text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
   CREATE FUNCTION check_ledger_integrity(uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$;`);
  const memberSource=readFileSync("supabase/migrations/20260516073920_c62943b5-9a8d-4aeb-87c8-159b983a1340.sql","utf8");
  await sql.unsafe(memberSource.slice(memberSource.indexOf('CREATE OR REPLACE FUNCTION public.bar_tab_entry_journal()')));
  const visitorSource=readFileSync("drizzle/migrations/0085_bar_group_online_payment_journal.sql","utf8");
  await sql.unsafe(visitorSource.slice(0,visitorSource.indexOf('CREATE OR REPLACE FUNCTION public.bar_unpost_sale_journal')));
  await sql.unsafe(readFileSync("drizzle/migrations/0180_shop_gl_accounts.sql","utf8"));
  await sql.unsafe(readFileSync("drizzle/migrations/0181_route_shop_sales_and_purchases.sql","utf8"));
  await sql`INSERT INTO bar_items VALUES(${shop},${club},'shop','Racket'),(${bar},${club},'bar','Drink')`;
 });
 beforeEach(async()=>{ await sql.unsafe('TRUNCATE club_journal_entries,bar_tab_entries,bar_visitor_sales,bar_stock_purchases'); });
 afterAll(async()=>{await sql.end();});
 const balanced=async()=>expect((await sql`SELECT coalesce(sum(debit-credit),0)::float AS n FROM club_journal_entries`)[0].n).toBe(0);
 it('member shop sale credits only shop income',async()=>{
  await sql`INSERT INTO bar_tab_entries(club_id,bar_item_id,total,quantity) VALUES(${club},${shop},500,1)`;
  expect((await sql`SELECT credit::float AS amount FROM club_journal_entries WHERE account='shop_income'`)[0].amount).toBe(500); await balanced();
 });
 it('member bar sale retains bar income',async()=>{
  await sql`INSERT INTO bar_tab_entries(club_id,bar_item_id,total,quantity) VALUES(${club},${bar},100,1)`;
  expect((await sql`SELECT credit::float AS amount FROM club_journal_entries WHERE account='bar_income'`)[0].amount).toBe(100); await balanced();
 });
 it('mixed online payment splits item income with one receipt and safe retries',async()=>{
  await sql`INSERT INTO bar_visitor_sales(club_id,bar_item_id,total,quantity,payment_method,payment_reference,payment_status) VALUES(${club},${shop},500,1,'card','test-payment','paid'),(${club},${bar},100,1,'card','test-payment','paid')`;
  await sql.unsafe('SELECT bar_post_sale_journal(s) FROM bar_visitor_sales s');
  await sql.unsafe('SELECT bar_post_sale_journal(s) FROM bar_visitor_sales s');
  expect(await sql`SELECT account::text,credit::float AS amount FROM club_journal_entries WHERE credit>0 ORDER BY account::text`).toEqual([{account:'bar_income',amount:100},{account:'shop_income',amount:500}]);
  expect((await sql`SELECT count(*)::int AS n FROM club_journal_entries WHERE account='bank_current'`)[0].n).toBe(1); await balanced();
 });
 it('direct visitor shop sale uses shop income',async()=>{
  await sql`INSERT INTO bar_visitor_sales(club_id,bar_item_id,total,quantity,payment_method,payment_status) VALUES(${club},${shop},200,1,'cash','recorded')`;
  await sql.unsafe('SELECT bar_post_sale_journal(s) FROM bar_visitor_sales s');
  expect((await sql`SELECT credit::float AS n FROM club_journal_entries WHERE account='shop_income'`)[0].n).toBe(200); await balanced();
 });
 for(const [item,method,expense,offset] of [[shop,'cash','shop_expense','cash'],[shop,'account','shop_expense','creditors'],[bar,'eft','bar_expense','bank_current']]) {
  it(`${expense} purchase offsets ${offset}`,async()=>{
   await sql`INSERT INTO bar_stock_purchases(club_id,bar_item_id,total_cost,quantity,payment_method) VALUES(${club},${item},200,1,${method})`;
   expect((await sql`SELECT debit::float AS n FROM club_journal_entries WHERE account::text=${expense}`)[0].n).toBe(200);
   expect((await sql`SELECT credit::float AS n FROM club_journal_entries WHERE account::text=${offset}`)[0].n).toBe(200); await balanced();
  });
 }
 it('rejects cross-club purchase items',async()=>{
  await expect(sql`INSERT INTO bar_stock_purchases(club_id,bar_item_id,total_cost,quantity) VALUES(${bar},${shop},200,1)`).rejects.toThrow('Item does not belong');
 });
});
