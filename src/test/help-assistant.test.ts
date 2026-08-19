import { describe, it, expect } from "vitest";
import { searchHelp, quickPrompts, visibleTopics, tokenize, buildHelpContext } from "@/lib/help/search";
import { ALL_HELP_TOPICS, HELP_TOPICS } from "@/lib/help/knowledge";
import {
  mergeTranscript,
  mapDictationError,
  dictationLabel,
  isDictationSupported,
  getSpeechRecognitionCtor,
} from "@/lib/help/dictation";

const all = new Set(["bookings", "tournaments", "ladder", "leagues", "bar", "events", "membership_fees"]);

describe("help search filtering", () => {
  it("tokenizes and drops stop words", () => {
    expect(tokenize("How do I book a court?")).toEqual(["book", "court"]);
  });

  it("hides admin topics from members", () => {
    const member = visibleTopics({ enabled: all, isAdmin: false });
    expect(member.some((t) => t.audience === "admin")).toBe(false);
    const admin = visibleTopics({ enabled: all, isAdmin: true });
    expect(admin.length).toBeGreaterThan(member.length);
  });

  it("hides topics for disabled capabilities", () => {
    const noBar = visibleTopics({ enabled: new Set(["bookings"]), isAdmin: true });
    expect(noBar.some((t) => t.capability === "bar")).toBe(false);
    expect(noBar.some((t) => t.capability === "bookings")).toBe(true);
  });

  it("finds the booking topic for a typed question", () => {
    const [top] = searchHelp("how do I book a court", { enabled: all, isAdmin: false });
    expect(top?.topic.id).toBe("book-court");
  });

  it("never returns admin topics to a member search", () => {
    const res = searchHelp("import members permissions fees", { enabled: all, isAdmin: false });
    expect(res.every((m) => m.topic.audience === "member")).toBe(true);
  });

  it("returns nothing for an empty query", () => {
    expect(searchHelp("   ", { enabled: all, isAdmin: true })).toEqual([]);
  });

  it("grounding context respects the same filters", () => {
    const ctx = buildHelpContext("bar", { enabled: new Set(["bookings"]), isAdmin: false });
    expect(ctx.every((t) => t.audience === "member" && (!t.capability || t.capability === "bookings"))).toBe(true);
  });
});

describe("contextual quick prompts", () => {
  it("suggests page-specific prompts first", () => {
    const p = quickPrompts("/bookings", { enabled: all, isAdmin: false });
    expect(p[0].query).toMatch(/cancel a booking/i);
  });

  it("omits prompts for disabled modules", () => {
    const p = quickPrompts("/", { enabled: new Set(["bookings"]), isAdmin: false });
    expect(p.some((x) => /tournament/i.test(x.query))).toBe(false);
  });

  it("only offers admin prompts to admins", () => {
    const member = quickPrompts("/club-admin", { enabled: all, isAdmin: false });
    expect(member.some((x) => /import members/i.test(x.query))).toBe(false);
    const admin = quickPrompts("/club-admin", { enabled: all, isAdmin: true });
    expect(admin.some((x) => /import members/i.test(x.query))).toBe(true);
  });

  it("de-duplicates prompts", () => {
    const p = quickPrompts("/tournaments", { enabled: all, isAdmin: true });
    expect(new Set(p.map((x) => x.query)).size).toBe(p.length);
  });
});

describe("help corpus routes", () => {
  it("uses the real marker route", () => {
    const marker = HELP_TOPICS.find((t) => t.id === "score-match");
    expect(marker?.route).toBe("/match-marker");
  });

  it("every route is an absolute in-app path", () => {
    for (const t of ALL_HELP_TOPICS) {
      if (t.route) expect(t.route.startsWith("/")).toBe(true);
    }
  });
});

describe("dictation helpers", () => {
  it("appends the transcript to typed text", () => {
    expect(mergeTranscript("how do", " I book ")).toBe("how do I book");
    expect(mergeTranscript("", "hello")).toBe("hello");
    expect(mergeTranscript("keep", "   ")).toBe("keep");
  });

  it("maps permission errors to a denied state", () => {
    expect(mapDictationError("not-allowed").state).toBe("denied");
    expect(mapDictationError("service-not-allowed").state).toBe("denied");
    expect(mapDictationError("no-speech").state).toBe("idle");
    expect(mapDictationError("audio-capture").state).toBe("error");
    expect(mapDictationError(undefined).state).toBe("error");
  });

  it("labels each state", () => {
    expect(dictationLabel("listening")).toMatch(/listening/i);
    expect(dictationLabel("unsupported")).toMatch(/not supported/i);
  });

  it("detects support from the window object", () => {
    expect(isDictationSupported({})).toBe(false);
    expect(isDictationSupported({ webkitSpeechRecognition: function () {} })).toBe(true);
    expect(getSpeechRecognitionCtor(undefined)).toBeNull();
  });
});
