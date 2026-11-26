import { describe, expect, it } from "vitest";
import { receivesMemberFeatureUpdate } from "../../supabase/functions/_shared/member-update-audience";

describe("Member credit-transfer update audience", () => {
  const member = { user_id: "member-user", status: "active", role: "member" };
  it("includes active club members", () => {
    expect(receivesMemberFeatureUpdate(member, "club")).toBe(true);
  });
  it("does not send club feature updates to associations", () => {
    expect(receivesMemberFeatureUpdate(member, "association")).toBe(false);
  });
  it("excludes visitors and inactive members", () => {
    expect(receivesMemberFeatureUpdate({ ...member, role: "visitor" }, "club")).toBe(false);
    expect(receivesMemberFeatureUpdate({ ...member, status: "suspended" }, "club")).toBe(false);
    expect(receivesMemberFeatureUpdate({ ...member, status: "resigned" }, "club")).toBe(false);
  });
});