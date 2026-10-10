import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InlineTournamentStandings } from "@/components/tournaments/InlineTournamentStandings";

afterEach(cleanup);
describe("inline tournament standings", () => {
  it("opens standings by default with an accessible collapse control", () => {
    render(<InlineTournamentStandings tournamentId="t1" name="Club champs"><p>Category standings</p></InlineTournamentStandings>);
    expect(screen.getByText("Category standings")).toBeVisible();
    expect(screen.getByRole("button", { name: "Collapse" })).toHaveAttribute("aria-expanded", "true");
  });
  it("collapses and reopens without remounting the standings", () => {
    render(<InlineTournamentStandings tournamentId="t1" name="Club champs"><input aria-label="Category" defaultValue="Mens A" /></InlineTournamentStandings>);
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Ladies" } });
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.getByLabelText("Category")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Expand standings" }));
    expect(screen.getByLabelText("Category")).toHaveValue("Ladies");
    expect(screen.getByLabelText("Category")).toBeVisible();
  });
});