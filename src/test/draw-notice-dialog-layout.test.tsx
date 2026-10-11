import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DrawNoticeDialog } from "@/components/smart-builder/DrawNoticeDialog";

vi.mock("@/hooks/use-whatsapp-enabled", () => ({ useWhatsAppEnabled: () => false }));
vi.mock("@/components/smart-builder/DrawNoticeEditor", () => ({
  useDrawNoticeSettings: () => ({ value: { message: "Saved intro", activationIntro: "Activate" }, dirty: false }),
  DrawNoticeEditor: () => <div data-testid="expanded-email">Personalized email preview</div>,
}));
vi.mock("@/lib/smart-builder/draw-notice", () => ({
  drawNoticeKey: () => "1:r2", drawScopeTitle: () => "Round 2",
  loadDrawNoticeRecipients: async () => [{ id: "player", name: "Selected player" }],
  recordDrawNotice: vi.fn(), sendDrawNotice: vi.fn(),
}));

describe("draw notification dialog layout", () => {
  it("keeps header and actions outside the scrollable body", async () => {
    render(<DrawNoticeDialog open onClose={vi.fn()} clubId="club" tournamentId="tournament" tournamentName="Champs" scope={{ round: 2 }} />);
    const dialog = screen.getByRole("dialog");
    const body = within(dialog).getByTestId("draw-notice-modal-body");
    expect(body.contains(screen.getByTestId("expanded-email"))).toBe(true);
    expect(body.contains(screen.getByRole("heading", { name: "Send draw to players now?" }))).toBe(false);
    expect(body.contains(screen.getByTestId("draw-notice-actions"))).toBe(false);
    expect(within(dialog).getByRole("button", { name: "Later" })).toBeTruthy();
    expect(await screen.findByText("Selected player")).toBeTruthy();
  });
});