import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "../../drizzle/migrations/0436_family_request_approve_link.sql"),
  "utf8",
);
const ctx = sql.slice(sql.indexOf("FUNCTION public.family_request_review_context"), sql.indexOf("DROP FUNCTION"));
const emails = sql.slice(sql.indexOf("DROP FUNCTION"), sql.indexOf("CREATE OR REPLACE FUNCTION public.family_add_member("));
const page = readFileSync(join(__dirname, "../pages/FamilyRequestReview.tsx"), "utf8");

describe("family request approve link", () => {
  it("only club admins or members-access approvers can read the request", () => {
    expect(ctx).toContain("public.is_club_admin(auth.uid(),g.club_id)");
    expect(ctx).toContain("public.has_club_permission(auth.uid(),g.club_id,'members')");
    expect(ctx).toContain("RETURN jsonb_build_object('state','forbidden'");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.family_request_review_context(uuid) FROM PUBLIC, anon");
  });

  it("deciding uses the existing approval writer, never a new one", () => {
    expect(page).toContain('supabase.rpc("family_review_addition"');
    expect(sql).not.toMatch(/FUNCTION public\.family_review_addition/);
  });

  it("emails and admin notices link straight to the approve page", () => {
    expect(emails).toContain("'/family-request/'||f.id::text, 'Approve or decline'");
    expect(sql).toContain("'/family-request/'||row_id::text,");
  });

  it("reminders only go out while the request is still waiting", () => {
    expect(emails).toContain("f.status<>'invited' OR f.approval_status<>'pending' THEN RETURN 0");
    expect(emails).toContain("WHERE _resend OR NOT EXISTS");
    expect(emails).toContain("REVOKE EXECUTE ON FUNCTION public._family_request_email_officials(uuid, boolean) FROM PUBLIC, anon, authenticated");
  });
});
