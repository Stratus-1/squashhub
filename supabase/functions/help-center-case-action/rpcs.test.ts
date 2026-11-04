import { afterAll, beforeAll, expect, test } from "bun:test";
import postgres from "postgres";
import { readFileSync } from "node:fs";

// Disposable localhost database only. Synthetic fixtures; no hosted support data is read or changed.
const conn = { host: "127.0.0.1", port: 55439, username: "lovable", ssl: false as const, max: 1 };
const dbName = "hc_action_test_" + Date.now();
let sql: postgres.Sql;
const admin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const member = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ticket = "22222222-2222-4222-8222-222222222222";
const hash = (c: string) => c.repeat(64);

const STUBS = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, deleted_at timestamptz);
CREATE TABLE public.user_roles(user_id uuid, role text);
CREATE FUNCTION public.is_platform_admin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $f$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role IN ('admin','moderator')) $f$;
CREATE TABLE public.support_threads(id uuid PRIMARY KEY, user_id uuid, subject text, status text DEFAULT 'open',
  last_message_at timestamptz, last_message_by uuid, last_message_preview text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.support_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid REFERENCES public.support_threads(id), sender_id uuid, body text, created_at timestamptz DEFAULT now());
CREATE TABLE public.help_center_ticket_outbox(id bigserial PRIMARY KEY, event_id uuid UNIQUE DEFAULT gen_random_uuid(), ticket_id uuid, status text, revision bigint,
  ticket_created_at timestamptz, ticket_updated_at timestamptz, event_type text DEFAULT 'case.updated', held_at timestamptz, UNIQUE(ticket_id, revision));
CREATE FUNCTION public.help_center_enqueue(p_ticket uuid, p_type text, p_status text, p_created timestamptz, p_updated timestamptz) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_rev bigint; BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('hc_outbox:' || p_ticket::text, 0));
  SELECT coalesce(max(revision),0)+1 INTO v_rev FROM public.help_center_ticket_outbox WHERE ticket_id=p_ticket;
  INSERT INTO public.help_center_ticket_outbox(ticket_id,event_type,status,revision,ticket_created_at,ticket_updated_at) VALUES(p_ticket,p_type,p_status,v_rev,p_created,p_updated);
END $f$;
CREATE FUNCTION public.t_thread() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN
  IF TG_OP='INSERT' THEN PERFORM public.help_center_enqueue(NEW.id,'case.created',NEW.status,NEW.created_at,NEW.updated_at);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN PERFORM public.help_center_enqueue(NEW.id,'case.updated',NEW.status,NEW.created_at,NEW.updated_at); END IF;
  RETURN NEW; END $f$;
CREATE TRIGGER t_thread AFTER INSERT OR UPDATE ON public.support_threads FOR EACH ROW EXECUTE FUNCTION public.t_thread();
CREATE FUNCTION public.t_msg() RETURNS trigger LANGUAGE plpgsql AS $f$ DECLARE t record; BEGIN
  SELECT * INTO t FROM public.support_threads WHERE id=NEW.thread_id;
  PERFORM public.help_center_enqueue(t.id,'case.updated',t.status,t.created_at,NEW.created_at);
  UPDATE public.support_threads SET last_message_at=NEW.created_at, last_message_by=NEW.sender_id, updated_at=now() WHERE id=NEW.thread_id;
  RETURN NEW; END $f$;
CREATE TRIGGER t_msg AFTER INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION public.t_msg();
`;

beforeAll(async () => {
  const root = postgres({ ...conn, database: "postgres" });
  await root.unsafe(`CREATE DATABASE ${dbName}`);
  await root.end();
  sql = postgres({ ...conn, database: dbName });
  await sql.unsafe(STUBS);
  await sql.unsafe(readFileSync(new URL("./case-action.sql", import.meta.url), "utf8"));
  await sql.unsafe(`INSERT INTO auth.users VALUES('${admin}','ops@example.org',NULL),('${member}','member@example.org',NULL);
    INSERT INTO public.user_roles VALUES('${admin}','admin');
    INSERT INTO public.support_threads(id,user_id,subject) VALUES('${ticket}','${member}','Synthetic');`);
});
afterAll(async () => {
  await sql?.end();
  const root = postgres({ ...conn, database: "postgres" });
  await root.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await root.end();
});

const latest = async () => (await sql`SELECT event_id, revision FROM public.help_center_ticket_outbox WHERE ticket_id=${ticket} ORDER BY revision DESC LIMIT 1`)[0];
const apply = async (a: { action: string; event: string; rev: number; key: string; h: string; actor?: string; msg?: string | null; status?: string | null }) =>
  (await sql`SELECT public.help_center_apply_case_action(${a.action}, ${a.event}::uuid, ${a.rev}, ${a.key}, ${a.h}, ${a.actor ?? admin}::uuid, ${a.msg ?? null}, ${a.status ?? null}) AS r`)[0].r;

test("operator resolver requires an existing auth user with the platform admin role", async () => {
  expect((await sql`SELECT public.help_center_resolve_platform_operator('OPS@example.org') AS id`)[0].id).toBe(admin);
  expect((await sql`SELECT public.help_center_resolve_platform_operator('member@example.org') AS id`)[0].id).toBeNull();
  expect((await sql`SELECT public.help_center_resolve_platform_operator('nobody@example.org') AS id`)[0].id).toBeNull();
});

test("non-admin product user is rejected and nothing is written", async () => {
  const l = await latest();
  expect((await apply({ action: "reply", event: l.event_id, rev: Number(l.revision), key: "key-nonadmin-000001", h: hash("1"), actor: member, msg: "x" })).error).toBe("forbidden");
  expect((await sql`SELECT count(*)::int c FROM public.support_messages`)[0].c).toBe(0);
});

test("valid reply writes support_messages only, bumps revision, audits without body; duplicate key replays", async () => {
  const l = await latest();
  const r = await apply({ action: "reply", event: l.event_id, rev: Number(l.revision), key: "key-reply-00000001", h: hash("a"), msg: "Synthetic approved reply" });
  expect(r.ok).toBe(true);
  expect(Number(r.source_revision)).toBe(Number(l.revision) + 1);
  expect(r.resulting_status).toBe("open");
  expect((await sql`SELECT count(*)::int c FROM public.support_messages WHERE sender_id=${admin}`)[0].c).toBe(1);
  const audit = await sql`SELECT row_to_json(a)::text j FROM public.help_center_case_actions a`;
  expect(audit.length).toBe(1);
  expect(audit[0].j).not.toContain("Synthetic approved reply");
  const again = await apply({ action: "reply", event: l.event_id, rev: Number(l.revision), key: "key-reply-00000001", h: hash("a"), msg: "Synthetic approved reply" });
  expect(again.replayed).toBe(true);
  expect((await sql`SELECT count(*)::int c FROM public.support_messages`)[0].c).toBe(1);
  expect((await apply({ action: "reply", event: l.event_id, rev: Number(l.revision), key: "key-reply-00000001", h: hash("b"), msg: "different" })).error).toBe("idempotency_conflict");
});

test("stale event revision and held event are rejected", async () => {
  const first = (await sql`SELECT event_id FROM public.help_center_ticket_outbox WHERE ticket_id=${ticket} AND revision=1`)[0];
  expect((await apply({ action: "set_status", event: first.event_id, rev: 1, key: "key-stale-00000001", h: hash("c"), status: "closed" })).error).toBe("stale_revision");
  const l = await latest();
  await sql`UPDATE public.help_center_ticket_outbox SET held_at=now() WHERE event_id=${l.event_id}`;
  expect((await apply({ action: "set_status", event: l.event_id, rev: Number(l.revision), key: "key-held-000000001", h: hash("d"), status: "closed" })).error).toBe("event_held");
  await sql`UPDATE public.help_center_ticket_outbox SET held_at=NULL WHERE event_id=${l.event_id}`;
});

test("valid status transition maps waiting to pending, then closed tickets reject further actions", async () => {
  let l = await latest();
  const w = await apply({ action: "set_status", event: l.event_id, rev: Number(l.revision), key: "key-status-0000001", h: hash("e"), status: "waiting" });
  expect(w.resulting_status).toBe("waiting");
  expect((await sql`SELECT status FROM public.support_threads WHERE id=${ticket}`)[0].status).toBe("pending");
  l = await latest();
  expect((await apply({ action: "set_status", event: l.event_id, rev: Number(l.revision), key: "key-status-bogus01", h: hash("f"), status: "deleted" })).error).toBe("invalid_request");
  const c = await apply({ action: "set_status", event: l.event_id, rev: Number(l.revision), key: "key-status-0000002", h: hash("0"), status: "closed" });
  expect(c.resulting_status).toBe("closed");
  l = await latest();
  expect((await apply({ action: "reply", event: l.event_id, rev: Number(l.revision), key: "key-closed-0000001", h: hash("9"), msg: "x" })).error).toBe("ticket_inactive");
});

test("audit table is append-only", async () => {
  await expect(sql`UPDATE public.help_center_case_actions SET action='reply'`).rejects.toThrow();
  await expect(sql`DELETE FROM public.help_center_case_actions`).rejects.toThrow();
});
