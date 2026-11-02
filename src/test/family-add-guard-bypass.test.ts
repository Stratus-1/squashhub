import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(__dirname, "../../drizzle/migrations/0342_family_add_self_guard_bypass.sql"),
  "utf8",
);

describe("family add self-guard bypass migration", () => {
  it("redefines the self-fields guard", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.club_members_guard_self_fields()");
  });

  it("guard returns the row untouched for family additions", () => {
    expect(migration).toContain("current_setting('app.family_add', true)");
    expect(migration).toMatch(/app\.family_add[\s\S]{0,200}RETURN NEW;/);
  });

  it("family_add_member sets the transaction-local flag before inserting", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.family_add_member(");
    expect(migration).toContain("set_config('app.family_add','1',true)");
    const flagPos = migration.indexOf("set_config('app.family_add','1',true)");
    const insertPos = migration.indexOf("INSERT INTO public.club_members(club_id,name,email,phone,role");
    expect(flagPos).toBeGreaterThan(-1);
    expect(insertPos).toBeGreaterThan(flagPos);
  });

  it("family additions still insert a pending member with the member role", () => {
    expect(migration).toContain("'member',c.family_additional_category_id,true");
  });

  it("keeps the self sign-up application branch for real applications", () => {
    expect(migration).toContain("This club is not accepting membership applications");
    expect(migration).toContain("v_has_admin");
  });
});
