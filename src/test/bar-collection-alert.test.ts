import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { COLLECTION_VIBRATION, showCollectionAlert } from "@/lib/bar/collection-alert";

vi.mock("sonner", () => ({ toast: vi.fn() }));

describe("collection ready alert presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "vibrate", { value: vi.fn(), configurable: true });
  });

  it("keeps a partial-item message visible with an X and order action", () => {
    const view = vi.fn();
    showCollectionAlert({ id: "notice-1", message: "Order #6: 1× Toastie — ready for collection at the bar." }, view);
    const options = vi.mocked(toast).mock.calls[0]?.[1];
    expect(options).toMatchObject({ id: "bar-ready-notice-1", duration: Infinity, closeButton: true,
      description: "Order #6: 1× Toastie — ready for collection at the bar." });
    expect(options?.action).toMatchObject({ label: "View order", onClick: view });
    expect(navigator.vibrate).toHaveBeenCalledWith(COLLECTION_VIBRATION);
  });

  it("uses notification identity for dedupe while resends have a new identity", () => {
    showCollectionAlert({ id: "first", message: "Toastie ready" }, vi.fn());
    showCollectionAlert({ id: "first", message: "Toastie ready" }, vi.fn());
    showCollectionAlert({ id: "resend", message: "Toastie ready" }, vi.fn());
    expect(vi.mocked(toast).mock.calls.map(call => call[1]?.id)).toEqual(["bar-ready-first", "bar-ready-first", "bar-ready-resend"]);
  });

  it("still shows the popup if vibration is unavailable or blocked", () => {
    Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true });
    expect(() => showCollectionAlert({ id: "one", message: "Ready" }, vi.fn())).not.toThrow();
    Object.defineProperty(navigator, "vibrate", { value: () => { throw new Error("Blocked"); }, configurable: true });
    expect(() => showCollectionAlert({ id: "two", message: "Ready" }, vi.fn())).not.toThrow();
    expect(toast).toHaveBeenCalledTimes(2);
  });
});