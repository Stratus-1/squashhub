import { describe, expect, test } from "bun:test";
import { fitContextPayload, parseOperatorEmails, projectMessages } from "./context-contract.ts";

describe("Help Center case context contract", () => {
  test("requires an exact, valid operator email list and fails closed on malformed input", () => {
    expect([...parseOperatorEmails('["Admin@example.com","ops@example.org"]')]).toEqual(["admin@example.com", "ops@example.org"]);
    expect(parseOperatorEmails(undefined).size).toBe(0);
    expect(parseOperatorEmails('["not-an-email"]').size).toBe(0);
    expect(parseOperatorEmails('{"email":"ops@example.org"}').size).toBe(0);
  });

  test("limits message count and body size, removes identities, and preserves only reporter/support roles", () => {
    const result = projectMessages([
      { author_role: "support", body: "reply", created_at: "2026-10-01T10:02:00Z" },
      { author_role: "reporter", body: "x".repeat(8), created_at: "2026-10-01T10:01:00Z" },
      { author_role: "reporter", body: "older", created_at: "2026-10-01T10:00:00Z" },
    ], 2, 5);
    expect(result).toEqual([
      { author_role: "reporter", body: "xxxxx", truncated: true, created_at: "2026-10-01T10:01:00Z" },
      { author_role: "support", body: "reply", truncated: false, created_at: "2026-10-01T10:02:00Z" },
    ]);
    expect(JSON.stringify(result)).not.toContain("sender_id");
  });

  test("keeps the newest excerpts and enforces the byte limit with non-ASCII content", () => {
    const payload = { subject: "Ticket", messages: [
      { author_role: "reporter" as const, body: "old😀".repeat(100), truncated: false, created_at: "2026-10-01T10:00:00Z" },
      { author_role: "support" as const, body: "new😀".repeat(100), truncated: false, created_at: "2026-10-01T10:01:00Z" },
    ] };
    const bounded = fitContextPayload(payload, 1_000);
    expect(bounded).not.toBeNull();
    expect(bounded?.messages.at(-1)?.body).toBe(payload.messages.at(-1)?.body);
    expect(new TextEncoder().encode(JSON.stringify(bounded)).byteLength).toBeLessThanOrEqual(1_000);
  });
});
