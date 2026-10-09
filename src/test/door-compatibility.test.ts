import { describe, expect, it } from "vitest";
import { describeDoorCompatibility, detectIos } from "@/lib/door-compatibility";

const base = { online: true, native: false, webBluetooth: true, ios: false };

describe("describeDoorCompatibility", () => {
  it("all good on Chrome Android", () => {
    expect(describeDoorCompatibility(base)).toMatchObject({ tone: "ok", advice: null });
  });
  it("tells iPhone PWA users to install the app", () => {
    const c = describeDoorCompatibility({ ...base, webBluetooth: false, ios: true });
    expect(c.bluetooth).toBe("unavailable");
    expect(c.advice).toMatch(/SquashHub app/);
  });
  it("native iPhone app has Bluetooth", () => {
    expect(describeDoorCompatibility({ ...base, webBluetooth: false, ios: true, native: true }).bluetooth).toBe("ok");
  });
  it("offline without Bluetooth is an error", () => {
    expect(describeDoorCompatibility({ ...base, online: false, webBluetooth: false, ios: true }).tone).toBe("error");
  });
  it("detects iPad desktop UA", () => {
    expect(detectIos("Mozilla/5.0 (Macintosh)", true)).toBe(true);
  });
});
