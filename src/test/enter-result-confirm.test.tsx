import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnterResultConfirmDialog } from "@/components/tournaments/EnterResultConfirmDialog";

afterEach(cleanup);

const open = (onConfirm = vi.fn()) =>
  render(
    <EnterResultConfirmDialog
      open
      onOpenChange={vi.fn()}
      playerAName="Nico Govender"
      playerBName="Hennie Erasmus"
      onConfirm={onConfirm}
    />,
  );

describe("enter-result confirmation", () => {
  it("asks plainly, names the game and offers explicit yes / no buttons", () => {
    open();
    expect(
      screen.getByText("Do you want to enter the result for this game?"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nico Govender vs Hennie Erasmus/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, proceed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No, cancel" })).toBeInTheDocument();
    // The old accusatory browser alert wording must not come back.
    expect(screen.queryByText(/This is not your game/i)).toBeNull();
  });

  it("does nothing when the player declines", () => {
    const onConfirm = vi.fn();
    open(onConfirm);
    fireEvent.click(screen.getByRole("button", { name: "No, cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("continues to the score sheet only after an explicit yes", () => {
    const onConfirm = vi.fn();
    open(onConfirm);
    fireEvent.click(screen.getByRole("button", { name: "Yes, proceed" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("still asks sensibly when the players cannot be named", () => {
    render(
      <EnterResultConfirmDialog
        open
        onOpenChange={vi.fn()}
        playerAName=""
        playerBName=""
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Do you want to enter the result for this game?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, proceed" })).toBeInTheDocument();
  });
});
