import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StagePlanPanel } from "@/components/smart-builder/StagePlanPanel";
import type { PlanAnswers } from "@/lib/smart-builder/stage-plan";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

const units = [{ key: "Mens B", base: "Mens B" }, { key: "Ladies A", base: "Ladies A" }];
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("StagePlanPanel", () => {
  it("summarises categories from the starting default and saves only via Save plan", () => {
    const onSave = vi.fn();
    const answers: PlanAnswers = { format: { kind: "swiss", swissRounds: "5" } };
    wrap(<StagePlanPanel answers={answers} onSave={onSave} units={units} entrants={{ "Mens B": 12, "Ladies A": 6 }} />);
    expect(screen.getAllByText("Swiss")).toHaveLength(2);
    expect(screen.getByText(/Suggested for 12 entrants/)).toBeTruthy();
    expect(screen.queryByText("Unsaved changes")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /Edit stage plan/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Add future stage/ }));
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Stage 2 format")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].stagePlans["Mens B"]).toHaveLength(2);
  });

  it("Discard restores the saved plan", () => {
    wrap(<StagePlanPanel answers={{ format: { kind: "swiss", swissRounds: "5" } }} onSave={vi.fn()} units={units} entrants={{}} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Edit stage plan/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Add future stage/ }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    expect(screen.queryByLabelText("Stage 2 format")).toBeNull();
  });
});
