import { describe, it, expect } from "vitest";
import {
  lightsPaymentBody, mapGoBookPaymentStatus, lightsReference, lightsTransferLines,
} from "../../supabase/functions/_shared/gobook-lights-topup";

describe("GoBook Lights top-up", () => {
  it("only ever pays the Lights account", () => {
    expect(lightsPaymentBody(158, 123.45, "SH-L-1").accountName).toBe("Lights");
  });
  it("sends the GoBook client ID, never a membership number", () => {
    const body = lightsPaymentBody(158, 100, "SH-L-1") as Record<string, unknown>;
    expect(body.clientId).toBe(158);
    expect("membershipNumber" in body).toBe(false);
  });
  it("refuses to send without a linked GoBook client", () => {
    expect(() => lightsPaymentBody(0, 100, "SH-L-1")).toThrow();
  });
  it("maps GoBook statuses", () => {
    expect(mapGoBookPaymentStatus("Paid")).toBe("submitted");
    expect(mapGoBookPaymentStatus("Posted")).toBe("posted");
    expect(mapGoBookPaymentStatus("Cancelled")).toBe("cancelled");
  });
  it("gives each top-up its own reference", () => {
    expect(lightsReference("aaaaaaaa-1111-2222-3333-444444444444")).not.toBe(lightsReference("bbbbbbbb-1111-2222-3333-444444444444"));
  });
  it("transfer nets the member's top-up to zero", () => {
    const [d, c] = lightsTransferLines(100);
    expect(d).toMatchObject({ account: "debtors", debit: 100 });
    expect(c).toMatchObject({ account: "light_fees_income", credit: 100 });
  });
});
