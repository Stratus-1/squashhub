import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const port = process.env.CHAIRMAN_TEST_PORT;
(port ? describe : describe.skip)("Chairman banking setup database boundary", () => {
  it("allows setup but denies financial records, identity changes and unrelated credentials", async () => {
    const sql = postgres({ host: "127.0.0.1", port: Number(port), database: "postgres", username: "lovable", ssl: false, max: 1 });
    try {
      const migration = readFileSync("drizzle/migrations/0305_chairman_banking_setup_access.sql", "utf8");
      await sql.unsafe(migration.slice(0, migration.indexOf("REVOKE ALL")));
      const allowed = async (table: string, operation: string, next: object, previous: object = {}) => {
        const rows = await sql`SELECT public.chairman_banking_setup_change_allowed(${table},${operation},${JSON.stringify(next)}::jsonb,${JSON.stringify(previous)}::jsonb) AS allowed`;
        return rows[0].allowed;
      };
      expect(await allowed("clubs", "UPDATE", { payment_gateway: "stitch" }, { payment_gateway: null })).toBe(true);
      expect(await allowed("club_secrets", "UPDATE", { bank_name: "Example" }, { bank_name: null })).toBe(true);
      expect(await allowed("club_recurring_settings", "UPDATE", { recurring_enabled: true }, { recurring_enabled: false })).toBe(true);
      for (const table of ["club_journal_entries", "club_bank_transactions", "club_member_fee_payments", "bar_payroll_runs", "club_recurring_transactions"]) {
        for (const operation of ["INSERT", "UPDATE", "DELETE"]) expect(await allowed(table, operation, { debit: 100 })).toBe(false);
      }
      expect(await allowed("clubs", "UPDATE", { member_fee_annual: 100 }, { member_fee_annual: 0 })).toBe(false);
      expect(await allowed("clubs", "UPDATE", { chairman_member_id: null }, { chairman_member_id: "chairman" })).toBe(false);
      expect(await allowed("club_secrets", "UPDATE", { club_id: "other" }, { club_id: "own" })).toBe(false);
      expect(await allowed("club_secrets", "UPDATE", { smtp_pass: null }, { smtp_pass: "example" })).toBe(false);
    } finally {
      await sql.end();
    }
  });
});