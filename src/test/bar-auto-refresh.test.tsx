import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBarAutoRefresh } from "@/hooks/use-bar-auto-refresh";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("bar read-only refresh", () => {
  it("refreshes every five seconds and stops when disabled", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ enabled }) => useBarAutoRefresh(enabled, refresh), { initialProps: { enabled: false } });
    expect(refresh).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await act(async () => {});
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(refresh).toHaveBeenCalledTimes(2);
    rerender({ enabled: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("refreshes on resume and reconnect and removes listeners on unmount", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useBarAutoRefresh(true, refresh));
    await act(async () => {});
    for (const event of ["focus", "online"]) await act(async () => { window.dispatchEvent(new Event(event)); });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(refresh).toHaveBeenCalledTimes(4);
    unmount();
    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it("does not overlap requests and retries after a network failure", async () => {
    vi.useFakeTimers();
    let rejectRequest: ((reason: Error) => void) | undefined;
    const refresh = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { rejectRequest = reject; })).mockResolvedValue(undefined);
    renderHook(() => useBarAutoRefresh(true, refresh));
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { rejectRequest?.(new Error("offline")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});