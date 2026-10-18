import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const port = process.env.INCOME_COST_TEST_PORT;
const suite = port ? describe : describe.skip;
const club = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const item = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const sale = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
suite("income statement historical sale costs in disposable PostgreSQL", () => {
  const sql = postgres({ host: "127.0.0.1", port: Number(port), database: "income_cost_test", username: "lovable", max: 1 });
  beforeAll(async () => {
    await sql.unsafe(`CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE FUNCTION is_club_admin_or_permitted(uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $2='${club}'::uuid AND $3='finance' $$;
      CREATE TYPE gl_account AS ENUM('bar_expense','shop_expense');
      CREATE TABLE bar_items(id uuid,club_id uuid,division text,avg_unit_cost numeric);
      CREATE TABLE bar_tab_entries(id uuid,club_id uuid,bar_item_id uuid,created_at timestamptz);
      CREATE TABLE bar_visitor_sales(id uuid,club_id uuid,bar_item_id uuid,created_at timestamptz,payment_status text);
      CREATE TABLE bar_stock_movements(club_id uuid,source_table text,source_id uuid,reason text,cost_value numeric);
      CREATE TABLE club_journal_entries(account gl_account,debit numeric,credit numeric);`);
    await sql.unsafe(readFileSync("drizzle/migrations/0183_income_statement_division_cost_basis.sql", "utf8"));
  });
  beforeEach(async () => {
    await sql.unsafe("TRUNCATE bar_items,bar_tab_entries,bar_visitor_sales,bar_stock_movements,club_journal_entries");
    await sql`SELECT set_config('test.uid',${club},false)`;
    await sql`INSERT INTO bar_items VALUES(${item},${club},'bar',99)`;
    await sql`INSERT INTO bar_tab_entries VALUES(${sale},${club},${item},'2026-10-18 10:00:00+02')`;
    await sql`INSERT INTO bar_stock_movements VALUES(${club},'bar_tab_entries',${sale},'sale',-30)`;
  });
  afterAll(async () => { await sql.end(); });
  const report = () => sql`SELECT division,cogs::float,uncosted_lines::int FROM income_statement_sale_costs(${club},'2026-10-18 00:00:00+02','2026-10-19 00:00:00+02')`;
  it("uses historical snapshot, not current item average", async () => {
    await sql`UPDATE bar_items SET avg_unit_cost=1000`;
    expect(await report()).toEqual([{division:"bar",cogs:30,uncosted_lines:0}]);
  });
  it("combines special component snapshots once per sale", async () => {
    await sql`INSERT INTO bar_stock_movements VALUES(${club},'bar_tab_entries',${sale},'special_sale',-12)`;
    expect((await report())[0].cogs).toBe(42);
  });
  it("reports missing cost rather than pricing from today's average", async () => {
    await sql`UPDATE bar_stock_movements SET cost_value=NULL`;
    expect(await report()).toEqual([{division:"bar",cogs:0,uncosted_lines:1}]);
  });
  it("includes untracked sold items as missing costs", async () => {
    await sql`TRUNCATE bar_stock_movements`;
    expect((await report())[0].uncosted_lines).toBe(1);
  });
  it("excludes failed visitor payments", async () => {
    await sql`TRUNCATE bar_tab_entries`;
    await sql`INSERT INTO bar_visitor_sales VALUES(${sale},${club},${item},'2026-10-18 10:00:00+02','failed')`;
    expect(await report()).toEqual([]);
  });
  it("uses Johannesburg sale date boundaries", async () => {
    await sql`UPDATE bar_tab_entries SET created_at='2026-10-18 23:59:59+02'`;
    expect((await report())[0].cogs).toBe(30);
    await sql`UPDATE bar_tab_entries SET created_at='2026-10-19 00:00:00+02'`;
    expect(await report()).toEqual([]);
  });
  it("rejects signed-out and cross-club requests", async () => {
    await expect(sql`SELECT * FROM income_statement_sale_costs(${other},'2026-10-18','2026-10-19')`).rejects.toThrow("finance permission");
    await sql`SELECT set_config('test.uid','',false)`;
    await expect(report()).rejects.toThrow("finance permission");
  });
  it("new division direct-cost accounts support balanced salary entries", async () => {
    await sql`INSERT INTO club_journal_entries VALUES('bar_cost_of_sales',100,0),('shop_cost_of_sales',0,100)`;
    expect((await sql`SELECT sum(debit-credit)::float AS balance FROM club_journal_entries`)[0].balance).toBe(0);
    expect((await sql`SELECT count(*)::int AS n FROM club_journal_entries`)[0].n).toBe(2);
  });
});