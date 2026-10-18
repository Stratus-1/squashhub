import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";
const port = process.env.MEMBER_ORDER_TEST_PORT;
const club = "11111111-1111-1111-1111-111111111111";
const member = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const user = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const item = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const request = "dddddddd-dddd-dddd-dddd-dddddddddddd";
(port ? describe : describe.skip)("atomic member account orders", () => {
 const sql = postgres({host:"127.0.0.1",port:Number(port),database:"member_order_test",username:"lovable",max:1});
 beforeAll(async () => {
  await sql.unsafe(`CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  CREATE TABLE clubs(id uuid PRIMARY KEY,honesty_bar_enabled boolean,bar_account_tab_enabled boolean);
  CREATE TABLE club_members(id uuid PRIMARY KEY,club_id uuid,user_id uuid,status text,name text);
  CREATE TABLE bar_items(id uuid PRIMARY KEY,club_id uuid,name text,price numeric,active boolean);
  CREATE TABLE bar_guest_tabs(id uuid,club_member_id uuid);
  CREATE TABLE bar_orders(id uuid DEFAULT gen_random_uuid(),club_id uuid,guest_tab_id uuid,order_number int,customer_name text,fulfilment text,idempotency_key text,status text DEFAULT 'open',UNIQUE(club_id,idempotency_key));
  CREATE TABLE bar_tab_entries(id uuid DEFAULT gen_random_uuid(),club_id uuid,club_member_id uuid,bar_item_id uuid,quantity int,unit_price numeric,total numeric);
  CREATE TABLE bar_order_lines(order_id uuid,club_id uuid,bar_item_id uuid,item_name text,unit_price numeric,quantity int);
  CREATE TABLE bar_order_events(club_id uuid,order_id uuid,action text,actor_user_id uuid);
  CREATE TABLE charges(amount numeric);
  CREATE FUNCTION mock_charge() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.total>100 THEN RAISE EXCEPTION 'ACCOUNT_LIMIT'; END IF; INSERT INTO charges VALUES(NEW.total); RETURN NEW; END $$;
  CREATE TRIGGER charge AFTER INSERT ON bar_tab_entries FOR EACH ROW EXECUTE FUNCTION mock_charge();
  CREATE FUNCTION bar_item_on_menu(bar_items) RETURNS boolean LANGUAGE sql AS $$ SELECT $1.active $$;
  CREATE FUNCTION _bar_order_json(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('id',o.id,'tab_id', t.id,'member_linked', (t.club_member_id IS NOT NULL AND EXISTS(SELECT 1 FROM club_members m WHERE m.id = t.club_member_id AND m.user_id IS NOT NULL))) FROM bar_orders o LEFT JOIN bar_guest_tabs t ON t.id=o.guest_tab_id WHERE o.id=$1 $$;
  CREATE FUNCTION bar_counter_notify_ready(uuid[],boolean,uuid,uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE v_tab bar_guest_tabs; v_order bar_orders; v_club uuid; BEGIN IF v_tab.club_member_id IS NOT NULL THEN PERFORM 1 FROM club_members WHERE id = v_tab.club_member_id; END IF; RETURN '{}'::jsonb; END $$;`);
  await sql.unsafe(readFileSync(process.env.MEMBER_ORDER_MIGRATION || "drizzle/migrations/0184_member_account_counter_orders.sql","utf8"));
 });
 beforeEach(async () => {
  await sql.unsafe(`TRUNCATE bar_orders,bar_order_lines,bar_order_events,bar_tab_entries,charges,clubs,club_members,bar_items; INSERT INTO clubs VALUES('${club}',true,true); INSERT INTO club_members VALUES('${member}','${club}','${user}','active','Fictional member'); INSERT INTO bar_items VALUES('${item}','${club}','Test drink',20,true);`);
  await sql`SELECT set_config('request.jwt.claim.sub',${user},false)`;
 });
 afterAll(async () => {await sql.end();});
 const submit = (clubId=club,memberId=member,lines=[{bar_item_id:item,quantity:2}]) => sql`SELECT submit_my_bar_account_order(${clubId}::uuid,${memberId}::uuid,${sql.json(lines)},${request}::uuid) AS result`;
 it("creates a named open counter order without opening a tab",async () => {
  const [r]=await submit(); expect(r.result.account_charged).toBe(true); expect(r.result.member_linked).toBe(true);
  const [o]=await sql`SELECT customer_name,status,guest_tab_id FROM bar_orders`; expect(o).toEqual({customer_name:"Fictional member",status:"open",guest_tab_id:null});
  expect((await sql`SELECT count(*)::int n FROM bar_guest_tabs`)[0].n).toBe(0);
 });
 it("charges R40 once and links exactly that entry",async () => {
  await submit(); const [r]=await sql`SELECT sum(amount) amount,count(*)::int n FROM charges`; expect(Number(r.amount)).toBe(40); expect(r.n).toBe(1);
  const [l]=await sql`SELECT count(*)::int n FROM bar_order_lines l JOIN bar_tab_entries e ON e.id=l.member_tab_entry_id`; expect(l.n).toBe(1);
 });
 it("retries return the same order without another debit",async () => {
  const [a]=await submit(); const [b]=await submit(); expect(a.result.id).toBe(b.result.id); expect((await sql`SELECT count(*)::int n FROM charges`)[0].n).toBe(1);
 });
 it("rejects another person's member ID",async () => {await expect(submit(club,user)).rejects.toThrow("not yours");});
 it("rejects another club",async () => {await expect(submit(user)).rejects.toThrow("not yours");});
 it("rejects signed-out ordering",async () => {await sql`SELECT set_config('request.jwt.claim.sub','',false)`; await expect(submit()).rejects.toThrow("Sign in");});
 it("does not leave an order if account charging is denied",async () => {
  await expect(submit(club,member,[{bar_item_id:item,quantity:6}])).rejects.toThrow("ACCOUNT_LIMIT"); expect((await sql`SELECT count(*)::int n FROM bar_orders`)[0].n).toBe(0);
 });
 it("rejects other-club items without any debit",async () => {await sql`UPDATE bar_items SET club_id=${user}`; await expect(submit()).rejects.toThrow("not available"); expect((await sql`SELECT count(*)::int n FROM charges`)[0].n).toBe(0);});
 it("rejects quantities above 50",async () => {await expect(submit(club,member,[{bar_item_id:item,quantity:51}])).rejects.toThrow("not available");});
});
