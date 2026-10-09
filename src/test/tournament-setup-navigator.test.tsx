import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TournamentSetupNavigator } from "@/components/smart-builder/TournamentSetupNavigator";

describe("Tournament setup visual navigation", () => {
  const steps = Array.from({ length: 19 }, (_, i) => ({ key: `step-${i}`, label: `Setup ${i + 1}`, validated: i !== 1 }));
  it("preserves 19 ordered buttons and existing reachability", () => {
    const onSelect = vi.fn();
    render(<TournamentSetupNavigator steps={steps} current={2} reached={4} onSelect={onSelect} />);
    const nav = screen.getByRole("navigation", { name: "Tournament setup steps" });
    const buttons = within(nav).getAllByRole("button");
    expect(buttons).toHaveLength(19);
    expect(screen.getByText("Step 3 of 19")).toBeInTheDocument();
    expect(buttons[2]).toHaveAttribute("aria-current", "step");
    expect(buttons[0]).toHaveAttribute("data-state", "validated");
    // Visited but invalid must never get a completed check.
    expect(buttons[1]).toHaveAttribute("data-state", "incomplete");
    expect(buttons[1].querySelector("svg")).toBeNull();
    expect(buttons[4]).not.toBeDisabled();
    expect(buttons[5]).toBeDisabled();
    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledWith(0);
  });
  it("does not turn the current position into completion", () => {
    render(<TournamentSetupNavigator steps={steps} current={0} reached={0} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Setup 1$/ })).toHaveAttribute("data-state", "current");
    expect(document.querySelectorAll('[data-state="validated"]')).toHaveLength(0);
  });
});