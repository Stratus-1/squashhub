import { describe, it, expect } from "vitest";
import { buildApplicationProgress, parseApplicationProgress, resumeStepIndex } from "@/lib/membership-application";

describe("application progress (resume on any device)", () => {
  it("never stores secret-like keys", () => {
    const p = buildApplicationProgress("membership", { name: "A B", password: "x", otpCode: "1", pin: "2" } as any);
    expect(p.answers).toEqual({ name: "A B" });
    expect(p.stepId).toBe("membership");
  });
  it("round-trips and rejects junk", () => {
    const p = buildApplicationProgress("rules", { phone: "082" });
    expect(parseApplicationProgress(JSON.parse(JSON.stringify(p)))?.stepId).toBe("rules");
    expect(parseApplicationProgress(null)).toBeNull();
    expect(parseApplicationProgress({ v: 2 })).toBeNull();
  });
  it("resumes at the saved step, never past done, unknown → start", () => {
    const ids = ["welcome", "personal", "membership", "rules", "fees", "done"];
    expect(resumeStepIndex(ids, "membership")).toBe(2);
    expect(resumeStepIndex(ids, "fees")).toBe(4);
    expect(resumeStepIndex(ids, "done")).toBe(4);
    expect(resumeStepIndex(ids, "gone")).toBe(0);
  });
});
