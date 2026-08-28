import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The Deno edge runtime can't import from src/, so the ranking maths is copied
// to supabase/functions/_shared/ranking-model.ts. This guards against drift.
describe("ranking model copies", () => {
  it("keeps the edge-function copy identical to the source of truth", () => {
    const root = resolve(__dirname, "../../..");
    const source = readFileSync(resolve(root, "src/lib/rankings/model.ts"), "utf8");
    const copy = readFileSync(resolve(root, "supabase/functions/_shared/ranking-model.ts"), "utf8");
    expect(copy).toBe(source);
  });
});
