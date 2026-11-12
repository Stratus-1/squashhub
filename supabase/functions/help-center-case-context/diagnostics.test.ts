import { describe, expect, test } from "bun:test";
import { joseDetail, sanitizeDetail } from "./diagnostics.ts";

describe("diagnostic detail sanitizer", () => {
  test("drops unknown config names, values and free text", () => {
    expect(sanitizeDetail({ missing: ["HELP_CENTER_TENANT_SCOPE", "someone@example.org"] })).toEqual({ missing: ["HELP_CENTER_TENANT_SCOPE"] });
    expect(sanitizeDetail({ db_code: "relation x does not exist" })).toEqual({});
    expect(sanitizeDetail({ jose_code: "ERR_JWT_EXPIRED", jose_claim: "approved@example.org" } as never)).toEqual({ jose_code: "ERR_JWT_EXPIRED" });
    expect(sanitizeDetail({ ticket: "22222222-2222-4222-8222-222222222222" } as never)).toEqual({});
  });
  test("jose errors keep only code and claim name, never the message", () => {
    const error = Object.assign(new Error('unexpected "aud" value https://secret.example'), { code: "ERR_JWT_CLAIM_VALIDATION_FAILED", claim: "aud" });
    expect(joseDetail(error)).toEqual({ jose_code: "ERR_JWT_CLAIM_VALIDATION_FAILED", jose_claim: "aud" });
    expect(joseDetail(new Error("network"))).toEqual({ jose_code: "ERR_UNKNOWN" });
  });
});
