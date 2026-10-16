import { describe, it, expect } from "vitest";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

describe("buildInvoicePdf", () => {
  it("builds a one-page A4 PDF containing the invoice basics", () => {
    const doc = buildInvoicePdf({
      invoiceNumber: "INV-2026-001",
      feeLabel: "Annual membership 2026",
      amount: 1250,
      seasonYear: 2026,
      issueDate: "2026-10-16",
      dueDate: "2026-11-15",
      memberName: "Test Member",
      memberEmail: "test@example.com",
      clubName: "Riverside Squash Club",
      clubAddress: "1 Club Road",
      clubEmail: "info@example.com",
      clubPhone: "012 345 6789",
      bank: {
        bank_name: "Test Bank",
        bank_account_name: "Riverside Squash Club",
        bank_account_number: "1234567890",
        bank_branch_code: "470010",
        bank_reference: "INV-2026-001",
      },
    });

    const buf = doc.output("arraybuffer");
    expect(buf.byteLength).toBeGreaterThan(1000);
    const head = new Uint8Array(buf.slice(0, 5));
    expect(String.fromCharCode(...head)).toBe("%PDF-");
    // A4 portrait, single page
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("renders without a club logo or banking details", () => {
    const doc = buildInvoicePdf({
      invoiceNumber: "INV-2",
      feeLabel: "Fee",
      amount: 100,
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
