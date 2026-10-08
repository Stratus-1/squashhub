import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const MEMBERS = [
  { id: "m1", name: "Anna" }, { id: "m2", name: "Ben" }, { id: "m3", name: "Cara" }, { id: "m4", name: "Dan" },
];
function chain(table: string): any {
  const result = table === "club_members" ? { data: MEMBERS, error: null } : { data: [], error: null };
  const p: any = new Proxy(() => {}, {
    get: (_t, prop) => prop === "then" ? (res: any, rej: any) => Promise.resolve(result).then(res, rej) : () => p,
    apply: () => p,
  });
  return p;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => chain(t), rpc: () => chain("rpc") } }));
vi.mock("@/hooks/use-tournament-eligibility", () => ({ useOrgHierarchyLite: () => ({ data: null, isLoading: false }) }));
vi.mock("@/hooks/use-association-tenant", () => ({ useAssociationTenant: () => ({ isAssociation: false, orgId: null }) }));

import { StepByStepBuilder } from "@/components/smart-builder/StepByStepBuilder";

const SCORING = { mode: "standard", pointsPerGame: 11, bestOf: 5, winCondition: "win_by_2", timeCapMinutes: "", timeCapPlay: "", timeCapBreak: "" };

/** Admin-picked players across two categories: the board has something to show. */
const seed = () => localStorage.setItem("sh.stepbuilder.c1", JSON.stringify({
  kind: "once_off", name: "Expand test", scope: "club", entries: "8", playType: "singles", scoring: SCORING,
  categories: ["Mens A", "Ladies"], disc: { "Mens A": "singles", Ladies: "singles" }, categoryTypes: { "Mens A": "mens", Ladies: "ladies" },
  format: { kind: "knockout" }, seeding: "random", source: "select", elig: {},
  picks: { m1: "Mens A", m2: "Mens A", m3: "Ladies", m4: "Ladies" },
}));

async function openBoard() {
  render(<StepByStepBuilder clubId="c1" clubName="Riverside" />);
  fireEvent.click(await screen.findByRole("button", { name: /allocate|pick players/i }));
  await screen.findByTestId("pick-board");
}

describe("Step-by-Step: category board full-screen expand", () => {
  beforeEach(() => localStorage.clear());

  it("opens the board across the whole screen and keeps every category", async () => {
    seed();
    await openBoard();
    fireEvent.click(screen.getByRole("button", { name: /^Expand$/i }));
    const dlg = await screen.findByRole("dialog", { name: /full screen/i });
    expect(within(dlg).getByTestId("pick-board")).toBeInTheDocument();
    expect(within(dlg).getByText("Mens A")).toBeInTheDocument();
    expect(within(dlg).getByText("Ladies")).toBeInTheDocument();
    // The inline board is replaced, not duplicated.
    expect(screen.getAllByTestId("pick-board")).toHaveLength(1);
  });

  it("closes again with Escape and with the Exit button", async () => {
    seed();
    await openBoard();
    fireEvent.click(screen.getByRole("button", { name: /^Expand$/i }));
    await screen.findByRole("dialog", { name: /full screen/i });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /full screen/i })).toBeNull());
    expect(screen.getByTestId("pick-board")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Expand$/i }));
    const dlg = await screen.findByRole("dialog", { name: /full screen/i });
    fireEvent.click(within(dlg).getByRole("button", { name: /exit full screen/i }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /full screen/i })).toBeNull());
    expect(screen.getByTestId("pick-board")).toBeInTheDocument();
  });

  it("still moves a player between categories while expanded", async () => {
    seed();
    await openBoard();
    fireEvent.click(screen.getByRole("button", { name: /^Expand$/i }));
    const dlg = await screen.findByRole("dialog", { name: /full screen/i });
    fireEvent.click(within(dlg).getByRole("button", { name: /move anna to/i }));
    fireEvent.click(within(dlg).getByRole("option", { name: "Ladies" }));
    const ladies = await within(dlg).findByText("Ladies");
    expect(ladies).toBeInTheDocument();
    // Anna is now in Ladies and no longer in Mens A.
    const annaRows = within(dlg).getAllByText("Anna");
    expect(annaRows).toHaveLength(1);
  });
});
