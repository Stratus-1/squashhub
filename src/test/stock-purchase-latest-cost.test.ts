import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const port = process.env.STOCK_COST_TEST_PORT;
const suite = port ? describe : describe.skip;
suite("latest purchase cost and stock average", () => {
  const sql = postgres({ host: "127.0.0.1", port: Number(port), database: "stock_cost_test", username: "lovable", max: 1 });
  beforeAll(async () => {
    await sql.unsafe(`
      CREATE TABLE bar_items(id uuid PRIMARY KEY,club_id uuid,item_kind text,unit_yield int,cost_price numeric,stock_units int,avg_unit_cost numeric);
      CREATE TABLE bar_stock_purchases(id uuid DEFAULT gen_random_uuid(),bar_item_id uuid,club_id uuid,quantity int,quantity_units int,total_cost numeric,unit_cost numeric);
      CREATE TABLE receipt_calls(units int,cost numeric);
      CREATE FUNCTION bar_stock_apply(uuid,int,text,text,uuid,uuid,boolean,numeric) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO receipt_calls VALUES($2,$8);
        UPDATE bar_items SET avg_unit_cost=CASE WHEN $8 IS NULL THEN avg_unit_cost
          ELSE (stock_units*avg_unit_cost+$2*$8)/(stock_units+$2) END,stock_units=stock_units+$2 WHERE id=$1;
      END $$;
    `);
    await sql.unsafe(readFileSync("drizzle/migrations/0185_stock_purchase_latest_cost_price.sql", "utf8"));
    await sql.unsafe("CREATE TRIGGER receipt AFTER INSERT ON bar_stock_purchases FOR EACH ROW EXECUTE FUNCTION journal_bar_purchase()");
  });
  beforeEach(async () => {
    await sql.unsafe("TRUNCATE bar_items,bar_stock_purchases,receipt_calls");
    await sql.unsafe("INSERT INTO bar_items VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','stock',1,15,10,15)");
  });
  afterAll(async () => { await sql.end(); });
  const receipt = (quantity: number, total: number, units: number | null = null) => sql`
    INSERT INTO bar_stock_purchases(bar_item_id,club_id,quantity,total_cost,quantity_units)
    VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',${quantity},${total},${units})`;
  it("20 units at R18 update latest cost to R18 but average to R17", async () => {
    await receipt(20, 360);
    const [item] = await sql`SELECT cost_price::float,avg_unit_cost::float,stock_units FROM bar_items`;
    expect(item).toEqual({ cost_price: 18, avg_unit_cost: 17, stock_units: 30 });
    expect(await sql`SELECT units,cost::float FROM receipt_calls`).toEqual([{ units: 20, cost: 18 }]);
  });
  it("explicit received units convert latest cost back to the bottle basis", async () => {
    await sql`UPDATE bar_items SET unit_yield=30,stock_units=300,avg_unit_cost=10,cost_price=300`;
    await receipt(2, 720, 60);
    const [item] = await sql`SELECT cost_price::float,avg_unit_cost::float FROM bar_items`;
    expect(item.cost_price).toBe(360);
    expect(item.avg_unit_cost).toBeCloseTo(10.333333, 5);
    expect(await sql`SELECT units,cost::float FROM receipt_calls`).toEqual([{ units: 60, cost: 12 }]);
  });
  it("missing purchase cost does not replace an entered current price with zero", async () => {
    await receipt(2, 0);
    expect((await sql`SELECT cost_price::float FROM bar_items`)[0].cost_price).toBe(15);
  });
});