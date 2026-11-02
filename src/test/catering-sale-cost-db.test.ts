import { beforeAll, afterAll, describe, it, expect } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const port = process.env.CATERING_TEST_PORT;
(port ? describe : describe.skip)("Audited outsourced catering costs", () => {
  const sql = postgres({ host: "127.0.0.1", port: Number(port), username: "lovable", database: "postgres", ssl: false, max: 1 });
  const club = "11111111-1111-1111-1111-111111111111";
  const other = "22222222-2222-2222-2222-222222222222";
  beforeAll(async () => {
    await sql.unsafe(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${club}'::uuid $$;
      CREATE FUNCTION is_club_admin_or_permitted(uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $2='${club}'::uuid $$;
      CREATE TABLE clubs(id uuid PRIMARY KEY);
      INSERT INTO clubs VALUES('${club}'),('${other}');
      CREATE TABLE bar_items(id uuid,club_id uuid,division text,cost_price numeric,unit_yield int);
      CREATE TABLE bar_tab_entries(id uuid,club_id uuid,bar_item_id uuid,quantity int,created_at timestamptz);
      CREATE TABLE bar_visitor_sales(id uuid,club_id uuid,bar_item_id uuid,quantity int,created_at timestamptz,payment_status text);
      CREATE TABLE bar_stock_movements(club_id uuid,source_table text,source_id uuid,bar_item_id uuid,reason text,cost_value numeric,units_delta int);
      INSERT INTO bar_items VALUES('${club}','${club}','bar',30,1),('${other}','${club}','bar',10,1);
      INSERT INTO bar_visitor_sales VALUES('${club}','${club}','${club}',25,'2026-10-31','paid');
      INSERT INTO bar_tab_entries VALUES('${other}','${club}','${other}',2,'2026-10-31');
      INSERT INTO bar_stock_movements VALUES('${club}','bar_tab_entries','${other}','${other}','sale',-20,-2);`);
    await sql.unsafe(readFileSync("drizzle/migrations/0341_audited_sale_cost_corrections.sql", "utf8"));
  });
  afterAll(async () => { await sql.end(); });
  const report = () => sql`SELECT * FROM income_statement_sale_costs(${club}::uuid,'2026-10-30','2026-11-02')`;
  it("removes the approved food cost but preserves drinks and original costs", async () => {
    expect(Number((await report())[0].cogs)).toBe(770);
    await sql`INSERT INTO bar_sale_cost_corrections(club_id,source_table,source_id,original_cost,corrected_cost,reason) VALUES(${club},'bar_visitor_sales',${club},750,0,'Outsourced catering paid separately')`;
    expect(Number((await report())[0].cogs)).toBe(20);
    expect(Number((await sql`SELECT cost_price FROM bar_items WHERE id=${club}`)[0].cost_price)).toBe(30);
    expect(Number((await sql`SELECT cost_value FROM bar_stock_movements`)[0].cost_value)).toBe(-20);
    expect((await sql`SELECT quantity FROM bar_visitor_sales`)[0].quantity).toBe(25);
  });
  it("cannot apply another club's correction to this club's drink sale", async () => {
    await sql`INSERT INTO bar_sale_cost_corrections(club_id,source_table,source_id,original_cost,corrected_cost,reason) VALUES(${other},'bar_tab_entries',${other},20,0,'Other club')`;
    expect(Number((await report())[0].cogs)).toBe(20);
  });
  it("does not remove costs from another sale date", async () => {
    await sql`INSERT INTO bar_visitor_sales VALUES(${other},${club},${club},1,'2026-10-29','paid')`;
    const rows = await sql`SELECT * FROM income_statement_sale_costs(${club}::uuid,'2026-10-29','2026-10-30')`;
    expect(Number(rows[0].cogs)).toBe(30);
  });
});