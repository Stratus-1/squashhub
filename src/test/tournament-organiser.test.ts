import { describe, expect, it } from "vitest";
import { defaultOrganiser, suggestedOrganiser } from "@/lib/smart-builder/tournament-organiser";
import { fromStepTemplate, toStepTemplate } from "@/lib/smart-builder/step-templates";
import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";

const members = [{ id: "kaylee", name: "Kaylee Hunt", club_id: "uitsig" }, { id: "committee", name: "Committee member", club_id: "uitsig" }];
const kaylee = { memberId: "kaylee", name: "Kaylee Hunt" };
describe("optional tournament organiser", () => {
  it("suggests the single member with tournament permission", () => {
    expect(suggestedOrganiser("uitsig", members, [{ club_member_id: "kaylee", custom_permissions: ["champs"] }])).toEqual(kaylee);
  });
  it("prioritises a dedicated tournament role over another permitted member", () => {
    expect(suggestedOrganiser("uitsig", members, [{ club_member_id: "kaylee", club_permission_roles: { club_id: "uitsig", role_name: "Tournament organiser", permissions: ["champs"] } }, { club_member_id: "committee", custom_permissions: ["champs"] }])).toEqual(kaylee);
  });
  it("leaves ambiguous defaults unselected", () => {
    expect(suggestedOrganiser("uitsig", members, members.map((m) => ({ club_member_id: m.id, custom_permissions: ["champs"] })))).toBeUndefined();
  });
  it("does not suggest a member or permission role from another club", () => {
    expect(suggestedOrganiser("riverside", members, [{ club_member_id: "kaylee", custom_permissions: ["champs"] }])).toBeUndefined();
    expect(suggestedOrganiser("uitsig", members, [{ club_member_id: "kaylee", club_permission_roles: { club_id: "riverside", role_name: "Tournament organiser", permissions: ["champs"] } }])).toBeUndefined();
  });
  it("allows no organiser and retains deliberate clearing", () => {
    expect(defaultOrganiser(null, kaylee, false)).toBeNull();
    expect(defaultOrganiser(undefined, undefined, false)).toBeUndefined();
  });
  it("only defaults untouched new drafts, not existing tournaments", () => {
    expect(defaultOrganiser(undefined, kaylee, false)).toEqual(kaylee);
    expect(defaultOrganiser(undefined, kaylee, true)).toBeUndefined();
  });
  it("retains an explicitly picked committee organiser without requiring permission", () => {
    const choice = { memberId: "committee", name: "Committee member" };
    expect(defaultOrganiser(choice, kaylee, false)).toEqual(choice);
  });
  it("never carries organiser identity into a new template tournament", () => {
    const template = toStepTemplate({ organiser: kaylee } as StepAnswers);
    expect(template.answers.organiser).toBeUndefined();
    expect(fromStepTemplate({ v: 1, answers: { organiser: kaylee } }).organiser).toBeUndefined();
  });
});