import { describe, it, expect } from "vitest";
import { createHash } from "crypto";

/**
 * Mirrors supabase/functions/_shared/payfast-recurring.ts. Kept in the web test
 * suite so the signature rules and the monthly date maths are regression
 * tested — both are easy to break and expensive to get wrong in production.
 */
function pfEncode(value: string): string {
  return encodeURIComponent(String(value ?? ""))
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase());
}

function pfApiSignature(
  params: Record<string, string | number | undefined | null>,
  passphrase?: string | null,
): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => [k, String(v).trim()] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const parts = entries.map(([k, v]) => `${k}=${pfEncode(v)}`);
  const pass = (passphrase || "").trim();
  if (pass) parts.push(`passphrase=${pfEncode(pass)}`);
  return createHash("md5").update(parts.join("&"), "utf8").digest("hex");
}

function nextChargeDate(day: number, from: Date = new Date()): string {
  const d = Math.min(Math.max(Math.round(day) || 1, 1), 31);
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const clamp = (y: number, m: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(d, last)));
  };
  const thisMonth = clamp(year, month);
  const todayUtc = new Date(Date.UTC(year, month, from.getUTCDate()));
  const chosen = thisMonth > todayUtc ? thisMonth : clamp(year, month + 1);
  return chosen.toISOString().slice(0, 10);
}

describe("PayFast API signature", () => {
  it("sorts parameters alphabetically and appends the passphrase", () => {
    const sig = pfApiSignature(
      { version: "v1", "merchant-id": "10000100", amount: "15000", timestamp: "2026-09-18T10:00:00+00:00" },
      "jt7NOE43FZPn",
    );
    const expected = createHash("md5")
      .update(
        [
          "amount=15000",
          "merchant-id=10000100",
          "timestamp=" + pfEncode("2026-09-18T10:00:00+00:00"),
          "version=v1",
          "passphrase=jt7NOE43FZPn",
        ].join("&"),
        "utf8",
      )
      .digest("hex");
    expect(sig).toBe(expected);
    expect(sig).toMatch(/^[0-9a-f]{32}$/);
  });

  it("omits empty values and works without a passphrase", () => {
    const sig = pfApiSignature({ "merchant-id": "10000100", version: "v1", item_description: "" });
    expect(sig).toBe(
      createHash("md5").update("merchant-id=10000100&version=v1", "utf8").digest("hex"),
    );
  });
});

describe("next monthly charge date", () => {
  it("uses this month when the day is still ahead", () => {
    expect(nextChargeDate(25, new Date("2026-09-18T08:00:00Z"))).toBe("2026-09-25");
  });

  it("rolls to next month once the day has passed", () => {
    expect(nextChargeDate(5, new Date("2026-09-18T08:00:00Z"))).toBe("2026-10-05");
  });

  it("rolls over when today is the chosen day (never charges twice)", () => {
    expect(nextChargeDate(18, new Date("2026-09-18T08:00:00Z"))).toBe("2026-10-18");
  });

  it("clamps to the last day of a short month", () => {
    expect(nextChargeDate(31, new Date("2026-01-31T08:00:00Z"))).toBe("2026-02-28");
  });

  it("clamps day values outside 1-31", () => {
    expect(nextChargeDate(0, new Date("2026-09-18T08:00:00Z"))).toBe("2026-10-01");
    expect(nextChargeDate(99, new Date("2026-09-10T08:00:00Z"))).toBe("2026-09-30");
  });
});
