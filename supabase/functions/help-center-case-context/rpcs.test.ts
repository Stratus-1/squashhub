import { expect, test } from "bun:test";
import postgres from "postgres";
import { readFileSync } from "node:fs";

test("staged RPCs return non-allowlisted active tickets and deny closed tickets", async () => {
  // Disposable localhost only. No hosted support data is read or changed.
  const sql = postgres({ host: "127.0.0.1", port: 55439, database: "postgres", username: "lovable", ssl: false, max: 1 });
  const schema = "context_test_" + Date.now();
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`CREATE SCHEMA ${schema}; CREATE TABLE ${schema}.support_threads(id uuid,user_id uuid,subject text,status text,created_at timestamptz,updated_at timestamptz); CREATE TABLE ${schema}.support_messages(id uuid,thread_id uuid,sender_id uuid,body text,created_at timestamptz);`);
      const source = readFileSync(new URL("./live-context-rpcs.sql", import.meta.url), "utf8");
      // Keep function definitions identical; isolate names and skip production grants.
      await tx.unsafe(source.slice(0, source.indexOf("REVOKE ALL")).replaceAll("public.", schema + ".").replaceAll("search_path = public", "search_path = " + schema));
      const ticket = "22222222-2222-4222-8222-222222222222";
      await tx.unsafe(`INSERT INTO ${schema}.support_threads VALUES('${ticket}',NULL,'Synthetic','open',now(),now()); INSERT INTO ${schema}.support_messages VALUES(gen_random_uuid(),'${ticket}',NULL,repeat('x',3000),now());`);
      expect((await tx.unsafe(`SELECT * FROM ${schema}.help_center_case_context_thread('${ticket}')`)).length).toBe(1);
      const messages = await tx.unsafe(`SELECT * FROM ${schema}.help_center_case_context_messages('${ticket}')`);
      expect(messages.length).toBe(1);
      expect(messages[0].body.length).toBe(2001);
      expect(Object.keys(messages[0]).sort()).toEqual(["author_role", "body", "created_at"]);
      await tx.unsafe(`UPDATE ${schema}.support_threads SET status='closed'`);
      expect((await tx.unsafe(`SELECT * FROM ${schema}.help_center_case_context_thread('${ticket}')`)).length).toBe(0);
      expect((await tx.unsafe(`SELECT * FROM ${schema}.help_center_case_context_messages('${ticket}')`)).length).toBe(0);
      // Roll back the entire synthetic fixture and schema.
      throw new Error("rollback synthetic context fixture");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "rollback synthetic context fixture") throw error;
  } finally { await sql.end(); }
});