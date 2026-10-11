import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DrawNoticeEditor } from "@/components/smart-builder/DrawNoticeEditor";

describe("tournament notification presentation", () => {
  it("separates editable saved wording from email preview without performing any action", () => {
    const save = vi.fn();
    render(<DrawNoticeEditor notice={{
      value: { message: "Saved wording", includeActivation: false, activationIntro: "Activate your account" },
      setValue: vi.fn(), save, dirty: false, savedAt: null, saving: false, loaded: true,
    } as Parameters<typeof DrawNoticeEditor>[0]["notice"]} />);
    const settings = screen.getByRole("region", { name: "Draw Notification Message Settings" });
    const preview = screen.getByRole("region", { name: "Email Preview" });
    expect(settings.contains(screen.getByRole("textbox", { name: "Draw notification wording" }))).toBe(true);
    expect(preview.contains(screen.getByRole("button", { name: "Preview: needs activation" }))).toBe(true);
    expect(preview.contains(screen.getByRole("button", { name: "Save message" }))).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});