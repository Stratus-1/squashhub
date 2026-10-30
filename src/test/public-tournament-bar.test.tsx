import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PublicTournamentBar, PUBLIC_NOTICE_KEY, PUBLIC_BAR_DISMISSED_KEY, openInAppHref } from "@/components/match-day/PublicTournamentBar";

const ID = "0980bb1e-8494-4c5f-add6-d0170723f72a";
describe("public QR tournament bar", () => {
  beforeEach(() => localStorage.clear());
  it("Continue as visitor closes the whole bar and remembers it", () => {
    const { unmount } = render(<PublicTournamentBar kind="tournament" competitionId={ID} />);
    expect(screen.getByTestId("public-view-notice")).toHaveTextContent("You're viewing the public tournament page");
    fireEvent.click(screen.getByRole("button", { name: "Continue as visitor" }));
    expect(screen.queryByTestId("public-view-notice")).toBeNull();
    expect(screen.queryByTestId("public-view-panel")).toBeNull();
    expect(localStorage.getItem(PUBLIC_NOTICE_KEY)).toBe("1");
    expect(localStorage.getItem(PUBLIC_BAR_DISMISSED_KEY)).toBe("1");
    unmount();
    render(<PublicTournamentBar kind="tournament" competitionId={ID} />);
    expect(screen.queryByTestId("public-view-notice")).toBeNull();
    expect(screen.queryByTestId("public-view-panel")).toBeNull();
  });
  it("the panel's close button hides the bar and remembers it", () => {
    const { unmount } = render(<PublicTournamentBar kind="tournament" competitionId={ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("public-view-panel")).toBeNull();
    expect(localStorage.getItem(PUBLIC_BAR_DISMISSED_KEY)).toBe("1");
    unmount();
    render(<PublicTournamentBar kind="league" />);
    expect(screen.queryByTestId("public-view-panel")).toBeNull();
  });
  it("links to the SAME tournament, never a logout, and ignores junk ids", () => {
    render(<PublicTournamentBar kind="tournament" competitionId={ID} />);
    const links = screen.getAllByRole("link", { name: /Open in SquashHub/ });
    links.forEach((a) => expect(a.getAttribute("href")).toBe(`${window.location.origin}/club-champs/${ID}`));
    expect(screen.queryByText(/Exit|Log out/i)).toBeNull();
    expect(openInAppHref("tournament", "../admin")).toBe(`${window.location.origin}/`);
  });
});
