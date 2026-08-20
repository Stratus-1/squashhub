import { describe, it, expect } from "vitest";
import {
  canShowInstallPrompt,
  detectPlatform,
  isIosSafariUa,
  snoozeUntil,
  SNOOZE_MS,
  type InstallGateInput,
} from "@/lib/pwa-install";

const base: InstallGateInput = {
  standalone: false,
  native: false,
  preview: false,
  blockedRoute: false,
  alreadyInstalled: false,
  snoozedUntil: 0,
  hasDeferredPrompt: true,
  now: 1_000_000,
};

describe("detectPlatform", () => {
  it("detects desktop Edge", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 Edg/126"
      )
    ).toBe("desktop");
  });
  it("detects android and ios", () => {
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14) Chrome/126")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)", true)).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBe("desktop");
  });
  it("flags non-Safari iOS browsers", () => {
    expect(isIosSafariUa("Mozilla/5.0 (iPhone) Version/17 Safari/605")).toBe(true);
    expect(isIosSafariUa("Mozilla/5.0 (iPhone) CriOS/126")).toBe(false);
  });
});

describe("canShowInstallPrompt", () => {
  it("shows when a real prompt event is captured", () => {
    expect(canShowInstallPrompt(base)).toBe(true);
  });
  it("never shows without beforeinstallprompt", () => {
    expect(canShowInstallPrompt({ ...base, hasDeferredPrompt: false })).toBe(false);
  });
  it("never shows when installed / standalone / native / preview", () => {
    expect(canShowInstallPrompt({ ...base, standalone: true })).toBe(false);
    expect(canShowInstallPrompt({ ...base, alreadyInstalled: true })).toBe(false);
    expect(canShowInstallPrompt({ ...base, native: true })).toBe(false);
    expect(canShowInstallPrompt({ ...base, preview: true })).toBe(false);
  });
  it("respects blocked routes", () => {
    expect(canShowInstallPrompt({ ...base, blockedRoute: true })).toBe(false);
  });
  it("respects the snooze window and re-shows after it lapses", () => {
    const until = snoozeUntil(base.now);
    expect(canShowInstallPrompt({ ...base, snoozedUntil: until })).toBe(false);
    expect(
      canShowInstallPrompt({ ...base, snoozedUntil: until, now: base.now + SNOOZE_MS + 1 })
    ).toBe(true);
  });
});
