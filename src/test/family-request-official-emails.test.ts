import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "../../drizzle/migrations/0435_family_request_official_emails.sql"),
  "utf8",
);
const helper = sql.slice(0, sql.indexOf("CREATE OR REPLACE FUNCTION public.family_add_member("));
const addMember = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.family_add_member("));

describe("family package requests email the club's officials", () => {
  it("emails admins, members-approvers and every office bearer", () => {
    expect(helper).toContain("cm.role='admin'");
    expect(helper).toContain("public.has_club_permission(cm.user_id,g.club_id,'members')");
    for (const post of ["chairman", "vice_chairman", "secretary", "treasurer", "club_captain", "club_manager"]) {
      expect(helper).toContain(`c.${post}_member_id`);
    }
    expect(helper).toMatch(/club_offices o[\s\S]{0,120}o\.ended_at IS NULL/);
    expect(helper).toContain("cm.status='active'");
  });

  it("only for pending requests, once per official, never to the family themselves", () => {
    expect(helper).toContain("f.status<>'invited' OR f.approval_status<>'pending' THEN RETURN 0");
    expect(helper).toContain("x.kind='family_request_approval'");
    expect(helper).toContain("cm.id NOT IN (f.club_member_id, g.primary_member_id)");
  });

  it("an email problem never blocks the family request, and approval rights are unchanged", () => {
    expect(addMember).toMatch(/PERFORM public\._family_request_email_officials\(row_id\);\s*EXCEPTION WHEN OTHERS/);
    expect(sql).not.toContain("family_review_addition(");
    expect(helper).toContain("REVOKE EXECUTE ON FUNCTION public._family_request_email_officials(uuid) FROM PUBLIC, anon, authenticated");
  });
});
