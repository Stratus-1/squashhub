import { describe, expect, it } from "vitest";
import { classifyReply, normaliseReply } from "@/lib/reply-intent";

const cases: Array<[string, "yes" | "no" | "unknown" | "stop"]> = [
  // Affirmative
  ["yes", "yes"],
  ["YES please", "yes"],
  ["Yep 👍", "yes"],
  ["count me in", "yes"],
  ["I can play", "yes"],
  ["I will attend", "yes"],
  ["y", "yes"],
  ["Confirm", "yes"],
  ["I'm in!", "yes"],

  // Negative — must win over any positive-looking keyword
  ["no", "no"],
  ["No thanks", "no"],
  ["Sorry, can't play tonight", "no"],
  ["not playing this weekend", "no"],
  ["I cannot attend", "no"],
  ["I won't be there", "no"],
  ["can't make it", "no"],
  ["No, I won't be there", "no"],
  ["Nope", "no"],
  ["nah", "no"],
  ["unable to attend", "no"],
  ["Please decline for me", "no"],
  ["I'd love to play but I can't make it", "no"],
  ["Yes I would like to play but I cannot attend this weekend", "no"],

  // Ambiguous — must never mutate state
  ["maybe", "unknown"],
  ["will let you know", "unknown"],
  ["I'll let you know tomorrow", "unknown"],
  ["not sure yet", "unknown"],
  ["what time does it start?", "unknown"],
  ["", "unknown"],

  // Opt out
  ["STOP", "stop"],
];

describe("classifyReply", () => {
  it.each(cases)("classifies %j as %s", (text, expected) => {
    expect(classifyReply(null, text).intent).toBe(expected);
  });

  it("gives a button payload precedence", () => {
    expect(classifyReply("rsvp_yes", "").intent).toBe("yes");
    expect(classifyReply("decline", "").intent).toBe("no");
  });

  it("never returns yes for a bare mention of play or attend", () => {
    expect(classifyReply(null, "who else is playing").intent).not.toBe("yes");
    expect(classifyReply(null, "attendance list please").intent).not.toBe("yes");
  });

  it("normalises punctuation, casing and apostrophes", () => {
    expect(normaliseReply("  Can’t make it!! ")).toBe("cant make it");
  });

  it("reports the rule that fired for the audit trail", () => {
    const res = classifyReply(null, "Sorry, can't play tonight");
    expect(res.intent).toBe("no");
    expect(res.reason).toContain("negative");
    expect(res.normalised).toBe("sorry cant play tonight");
  });
});
