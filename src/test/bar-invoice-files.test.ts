import { describe, expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => mocks } } }));
import { saveWithInvoiceFiles, validateInvoiceFile } from "@/lib/bar-invoice-files";

describe("stock purchase invoice attachments", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null }); });
  it("accepts an invoice photo", () => expect(() => validateInvoiceFile({ type: "image/jpeg", size: 10 })).not.toThrow());
  it("accepts an uploaded PDF", () => expect(() => validateInvoiceFile({ type: "application/pdf", size: 10 })).not.toThrow());
  it("rejects executable attachments", () => expect(() => validateInvoiceFile({ type: "application/x-msdownload", size: 10 })).toThrow());
  it("links the same invoice to the single purchase save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    await saveWithInvoiceFiles("riverside", [new File(["invoice"], "invoice.pdf", { type: "application/pdf" })], save);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0][0]).toMatchObject({ name: "invoice.pdf", path: expect.stringMatching(/^riverside\//) });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("does not record stock when upload fails", async () => {
    mocks.upload.mockResolvedValue({ error: new Error("Upload failed") });
    const save = vi.fn();
    await expect(saveWithInvoiceFiles("riverside", [new File(["photo"], "photo.jpg", { type: "image/jpeg" })], save)).rejects.toThrow("Upload failed");
    expect(save).not.toHaveBeenCalled();
  });
  it("removes uploaded files if the purchase save fails", async () => {
    await expect(saveWithInvoiceFiles("riverside", [new File(["invoice"], "invoice.pdf", { type: "application/pdf" })], async () => { throw new Error("Purchase failed"); })).rejects.toThrow("Purchase failed");
    expect(mocks.remove).toHaveBeenCalledWith([expect.stringMatching(/^riverside\//)]);
  });
});