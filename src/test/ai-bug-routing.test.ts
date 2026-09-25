import { describe, it, expect } from "vitest";
import { bugFingerprint, sanitiseBug } from "../../supabase/functions/ai-help/bugs";
const base = { issue_key: "Overall winners display mismatch", title: "t", feature: "Tournament overall winners display", expected_behaviour: "e", actual_behaviour: "a", evidence: "ev", reproduction: "r", severity: "critical" as const, verified: true, related_ids: { tournament_id: "T1" } };
describe("AI bug routing", () => {
  it("same issue on same tournament shares a fingerprint regardless of wording case", () => {
    expect(bugFingerprint("C", base)).toBe(bugFingerprint("C", { ...base, issue_key: "overall_winners_display_MISMATCH" }));
    expect(bugFingerprint("C", base)).not.toBe(bugFingerprint("C", { ...base, related_ids: { tournament_id: "T2" } }));
  });
  it("members cannot mark bugs verified or critical", () => {
    const m = sanitiseBug(base, false);
    expect(m.verified).toBe(false); expect(m.severity).toBe("medium");
    expect(sanitiseBug(base, true)).toMatchObject({ verified: true, severity: "critical" });
  });
});
