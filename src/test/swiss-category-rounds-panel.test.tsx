import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwissCategoryRoundsPanel, suggestedSwissRounds, type SwissCategoryRow } from "@/components/smart-builder/SwissCategoryRoundsPanel";

const row = (key: string, entrants: number, selected: number | null, isSwiss = true): SwissCategoryRow =>
  ({ key, label: key.replace("::", " › "), entrants, entrantsGuessed: false, isSwiss, formatName: isSwiss ? "swiss" : "pools", selected, ownSetting: false });

describe("Swiss rounds per category panel", () => {
  it("suggests rounds from entrants (10→4, 15→4, 24→5)", () => {
    expect([10, 15, 24].map(suggestedSwissRounds)).toEqual([4, 4, 5]);
  });
  it("shows each category's own count, edits by stable key, leaves non-Swiss alone", () => {
    const onChange = vi.fn();
    render(<SwissCategoryRoundsPanel liveDraw rows={[row("Mens::A", 10, 4), row("Mens::B", 15, 5), row("Mens::C", 24, 6), row("Ladies", 8, null, false)]} onChange={onChange} />);
    expect((screen.getByLabelText("Swiss rounds for Mens › A") as HTMLInputElement).value).toBe("4");
    expect((screen.getByLabelText("Swiss rounds for Mens › B") as HTMLInputElement).value).toBe("5");
    expect(screen.queryByLabelText("Swiss rounds for Ladies")).toBeNull();
    expect(screen.getByText("Not Swiss — unchanged")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Swiss rounds for Mens › C"), { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith("Mens::C", 7);
    expect(screen.getByText(/draw already exists/)).toBeTruthy();
  });
  it("hidden when no category is Swiss", () => {
    const { container } = render(<SwissCategoryRoundsPanel liveDraw={false} rows={[row("Ladies", 8, null, false)]} onChange={() => {}} />);
    expect(container.innerHTML).toBe("");
  });
});
