import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { familyNote } from "@/components/club-admin/PendingApplicationsPanel";

const migration = readFileSync(
  join(__dirname, "../../drizzle/migrations/0387_family_request_admin_notices.sql"),
  "utf8",
);

describe("family package requests are clearly labelled for admins", () => {
  it("the generic new-application alert skips family additions", () => {
    const fn = migration.slice(0, migration.indexOf("CREATE OR REPLACE FUNCTION public.family_add_member("));
    expect(fn).toContain("current_setting('app.family_add', true)");
    expect(fn).toMatch(/club_family_members[\s\S]{0,120}RETURN NEW;/);
    expect(fn.indexOf("RETURN NEW;")).toBeLessThan(fn.indexOf("'New membership application'"));
  });

  it("admins get a 'Family package request' notice for new and existing members", () => {
    const fn = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.family_add_member("));
    expect(fn).toContain("'Family package request'");
    // Sent after the family link exists, for both kinds of request.
    expect(fn.lastIndexOf("'Family package request'")).toBeGreaterThan(fn.indexOf("INSERT INTO public.club_family_members"));
    expect(fn).toContain("New to the club — approve under Members → Membership applications.");
    expect(fn).toContain("Already a club member — approve under Fees → Family package.");
    // Same people who are allowed to approve family additions.
    expect(fn).toContain("cm.role='admin' OR public.has_club_permission(cm.user_id,p.club_id,'members')");
  });

  it("the applications list says who added them and how they're related", () => {
    expect(familyNote({ addedBy: "Jannie Goosen", relationship: "Spouse" })).toBe("added by Jannie Goosen, spouse");
    expect(familyNote({ addedBy: null, relationship: null })).toBe("added by a family member");
  });
});
