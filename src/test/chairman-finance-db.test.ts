import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

// Disposable localhost database only; never use a hosted connection for these writes.
const port = process.env.CHAIRMAN_TEST_PORT;
(port ? describe : describe.skip)("Chairman canonical financial boundary", () => {
  it("permits reads and finance staff writes, but rejects Chairman insert, edit and delete", async () => {
    const sql = postgres({ host: "127.0.0.1", port: Number(port), database: "postgres", username: "lovable", ssl: false, max: 1 });
    const club = "11111111-1111-1111-1111-111111111111";
    const chairman = "33333333-3333-3333-3333-333333333333";
    const entry = "55555555-5555-5555-5555-555555555555";
    try {
      // Load the current migration's canonical trigger, not a simulated permission check.
      const migration = readFileSync("drizzle/migrations/0295_chairman_financial_view_only.sql", "utf8");
      const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.guard_chairman_financial_write()");
      const end = migration.indexOf("DO $$ DECLARE t text;", start);
      await sql.unsafe(migration.slice(start, end));
      await sql`SELECT set_config('test.uid', '44444444-4444-4444-4444-444444444444', false)`;
      await sql`UPDATE club_journal_entries SET debit=100 WHERE id=${entry}`;
      expect((await sql`SELECT debit FROM club_journal_entries WHERE id=${entry}`)[0].debit).toBe("100");
      await sql`SELECT set_config('test.uid', ${chairman}, false)`;
      expect((await sql`SELECT is_club_chairman(auth.uid(),${club}::uuid) yes`)[0].yes).toBe(true);
      expect((await sql`SELECT debit FROM club_journal_entries WHERE id=${entry}`)[0].debit).toBe("100");
      await expect(sql`INSERT INTO club_journal_entries VALUES(gen_random_uuid(),${club}::uuid,NULL,1,0)`).rejects.toThrow("view-only");
      await expect(sql`UPDATE club_journal_entries SET debit=99 WHERE id=${entry}`).rejects.toThrow("view-only");
      await expect(sql`DELETE FROM club_journal_entries WHERE id=${entry}`).rejects.toThrow("view-only");
      expect((await sql`SELECT debit FROM club_journal_entries WHERE id=${entry}`)[0].debit).toBe("100");
    } finally { await sql.end(); }
  });
});