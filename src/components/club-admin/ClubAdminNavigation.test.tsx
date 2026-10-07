import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Users, Banknote } from "lucide-react";
import { ClubAdminNavigation } from "./ClubAdminNavigation";
import { SetupSteps, SetupStepNav } from "./setup/SetupSteps";

afterEach(cleanup);
const operations = [{ value: "members", label: "Members", description: "Member roster", icon: Users }];
const setup = [{ value: "banking", label: "Banking", description: "Payments", icon: Banknote, needsSetup: true }];

describe("Club Admin presentation", () => {
  it("defaults to operations first/open and setup collapsed with visible attention", () => {
    render(<ClubAdminNavigation operations={operations} setup={setup} activeTab="members" onSelect={vi.fn()} />);
    const groups = screen.getAllByRole("region");
    expect(groups[0]).toHaveAttribute("aria-label", "Club operations");
    expect(screen.getByRole("button", { name: "Club operations" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Setup & configuration/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Banking", exact: true })).not.toBeInTheDocument();
    expect(screen.getByLabelText("1 setup items need attention")).toBeVisible();
  });
  it("keeps destinations selectable in expanded and compact navigation", () => {
    const onSelect = vi.fn();
    render(<ClubAdminNavigation operations={operations} setup={setup} activeTab="members" onSelect={onSelect} compact />);
    expect(screen.getByRole("button", { name: "Members", exact: true })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: /Setup & configuration/ }));
    fireEvent.click(screen.getByRole("button", { name: "Banking", exact: true }));
    expect(onSelect).toHaveBeenCalledWith("banking");
    expect(screen.getByRole("button", { name: "Banking", exact: true })).toHaveAttribute("title", "Banking — Needs setup");
  });
  it("renders only the supplied permission-filtered destinations", () => {
    render(<ClubAdminNavigation operations={operations} setup={[]} activeTab="members" onSelect={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "Setup & configuration" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Banking" })).not.toBeInTheDocument();
  });
  it("preserves direct step selection, sequence, guidance and Back/Next", () => {
    const onChange = vi.fn();
    const steps = ["Payment methods", "Bank details", "Online payments", "Recurring payments"].map((label, i) => ({ id: String(i), label, description: "Details", complete: i < 2 }));
    render(<><SetupSteps variant="connected" steps={steps} value="1" onChange={onChange} /><SetupStepNav steps={steps} value="1" onChange={onChange} /></>);
    expect(screen.getByText("Step 2 of 4:")).toBeVisible();
    expect(screen.getByRole("button", { name: "Bank details" })).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: /Recurring payments/ }));
    expect(onChange).toHaveBeenLastCalledWith("3");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onChange).toHaveBeenLastCalledWith("0");
    fireEvent.click(screen.getByRole("button", { name: /Next:/ }));
    expect(onChange).toHaveBeenLastCalledWith("2");
  });
});