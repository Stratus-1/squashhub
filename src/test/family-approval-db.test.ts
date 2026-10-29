import { beforeAll, afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

// Only a disposable local database may run these mutation tests.
const port = process.env.FAMILY_TEST_PORT;
(port ? describe : describe.skip)("Family package admin approval", () => {
  const sql = postgres({ host: "127.0.0.1", port: Number(port), database: "postgres", username: "lovable", ssl: false, max: 1 });
  const primary = "00000000-0000-0000-0000-000000000001";
  const admin = "00000000-0000-0000-0000-000000000002";
  const club = "00000000-0000-0000-0000-000000000003";
  const cat = "00000000-0000-0000-0000-000000000004";
  const additional = "00000000-0000-0000-0000-000000000005";
  let request: string;
  beforeAll(async () => {
    await sql.unsafe(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE FUNCTION public.is_club_admin(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${admin}'::uuid $$;
      CREATE FUNCTION public.has_club_permission(uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${admin}'::uuid $$;
      CREATE TABLE club_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid,user_id uuid,name text,email text,phone text,role text,fee_category_id uuid,is_pending_approval boolean DEFAULT false,approved_at timestamptz,approved_by uuid,updated_at timestamptz);
      CREATE TABLE member_fee_categories(id uuid PRIMARY KEY,club_id uuid,family_role text,family_additional_category_id uuid,family_max_additional int,family_allowed_relationships text[],annual_fee numeric,pro_rate boolean);
      CREATE TABLE club_family_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid,primary_member_id uuid,season_year int);
      CREATE TABLE club_family_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),family_group_id uuid,club_member_id uuid,relationship text,status text,confirmed_at timestamptz,removed_at timestamptz,updated_at timestamptz);
      CREATE POLICY "Family member can accept or decline own invite" ON club_family_members FOR UPDATE USING(true);
      CREATE TABLE notifications(user_id uuid,club_member_id uuid,title text,message text,type text,url text);
      CREATE TABLE club_member_fee_payments(club_member_id uuid,fee_type text,fee_label text,amount numeric,paid boolean,season_year int,paid_by_member_id uuid,family_group_id uuid);
      CREATE FUNCTION family_respond_invite(_family_member_id uuid,_accept boolean) RETURNS boolean LANGUAGE plpgsql AS $$ DECLARE v_member public.club_members%ROWTYPE; v_cat public.member_fee_categories%ROWTYPE; BEGIN
        IF NOT (v_member.user_id=auth.uid()) THEN RETURN false; END IF;
        SELECT * INTO v_cat FROM member_fee_categories LIMIT 1; RETURN true; END $$;
      CREATE FUNCTION review_membership_application(_member_id uuid,_approve boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
        IF NOT public.is_club_admin(auth.uid(),'${club}') THEN RAISE EXCEPTION 'Not authorised'; END IF;
        IF _approve THEN
          UPDATE club_members SET is_pending_approval=false WHERE id=_member_id;
        END IF;
      END $$;
      INSERT INTO member_fee_categories VALUES('${cat}','${club}','primary','${additional}',20,ARRAY['child','spouse'],1000,false),('${additional}','${club}','additional',NULL,NULL,NULL,100,false);
      INSERT INTO club_members(id,club_id,user_id,name,fee_category_id) VALUES('${primary}','${club}','${primary}','Primary','${cat}');
    `);
    await sql.unsafe(readFileSync("drizzle/migrations/0301_family_additions_admin_approval.sql", "utf8"));
    // The live migration preserves the pre-existing writer; use that exact writer here.
    await sql.unsafe(readFileSync("/tmp/family-db/activate.sql", "utf8"));
    await sql`SELECT set_config('test.uid',${primary},false)`;
  });
  afterAll(async () => { await sql.end(); });

  it("rejects ordinary members who are not on the main family package", async () => {
    await sql`UPDATE club_members SET fee_category_id=${additional} WHERE id=${primary}`;
    await expect(sql`SELECT family_add_member(${primary}::uuid,NULL,'Child',NULL,NULL,'child')`).rejects.toThrow("not on a Family Package");
    await sql`UPDATE club_members SET fee_category_id=${cat} WHERE id=${primary}`;
  });
  it("keeps a new relative pending without a fee until admin approves", async () => {
    request = (await sql`SELECT family_add_member(${primary}::uuid,NULL,'Child',NULL,NULL,'child') id`)[0].id;
    const [r] = await sql`SELECT f.status,f.approval_status,m.is_pending_approval FROM club_family_members f JOIN club_members m ON m.id=f.club_member_id WHERE f.id=${request}`;
    expect(r).toEqual({ status: "invited", approval_status: "pending", is_pending_approval: true });
    expect((await sql`SELECT count(*)::int n FROM club_member_fee_payments`)[0].n).toBe(0);
  });
  it("does not let the main member approve or activate their own addition", async () => {
    await expect(sql`SELECT family_review_addition(${request}::uuid,true)`).rejects.toThrow("Not authorised");
    await expect(sql`UPDATE club_family_members SET status='active' WHERE id=${request}`).rejects.toThrow("requires club admin approval");
  });
  it("admin approval activates the new relative and records one fee", async () => {
    await sql`SELECT set_config('test.uid',${admin},false)`;
    await sql`SELECT review_membership_application(club_member_id,true) FROM club_family_members WHERE id=${request}`;
    const [r] = await sql`SELECT f.status,f.approval_status,m.is_pending_approval FROM club_family_members f JOIN club_members m ON m.id=f.club_member_id WHERE f.id=${request}`;
    expect(r).toEqual({ status: "active", approval_status: "approved", is_pending_approval: false });
    expect((await sql`SELECT amount FROM club_member_fee_payments`)[0].amount).toBe("100");
    await expect(sql`SELECT family_review_addition(${request}::uuid,true)`).rejects.toThrow("no longer pending");
    expect((await sql`SELECT count(*)::int n FROM club_member_fee_payments`)[0].n).toBe(1);
  });
  it("existing members retain access and category until acceptance AND approval", async () => {
    const target = "00000000-0000-0000-0000-000000000006";
    await sql`INSERT INTO club_members(id,club_id,user_id,name,fee_category_id) VALUES(${target},${club},${target},'Existing',${cat})`;
    await sql`SELECT set_config('test.uid',${primary},false)`;
    const id = (await sql`SELECT family_add_member(${primary}::uuid,${target}::uuid,NULL,NULL,NULL,'spouse') id`)[0].id;
    await sql`SELECT set_config('test.uid',${target},false)`;
    await sql`SELECT family_respond_invite(${id}::uuid,true)`;
    expect((await sql`SELECT fee_category_id,is_pending_approval FROM club_members WHERE id=${target}`)[0]).toEqual({ fee_category_id: cat, is_pending_approval: false });
    expect((await sql`SELECT status FROM club_family_members WHERE id=${id}`)[0].status).toBe("invited");
    await sql`SELECT set_config('test.uid',${admin},false)`;
    await sql`SELECT family_review_addition(${id}::uuid,true)`;
    expect((await sql`SELECT fee_category_id FROM club_members WHERE id=${target}`)[0].fee_category_id).toBe(additional);
  });
});