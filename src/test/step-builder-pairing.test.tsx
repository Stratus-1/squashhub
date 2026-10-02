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
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => chain(t) } }));
vi.mock("@/hooks/use-tournament-eligibility", () => ({ useOrgHierarchyLite: () => ({ data: null, isLoading: false }) }));
vi.mock("@/hooks/use-association-tenant", () => ({ useAssociationTenant: () => ({ isAssociation: false, orgId: null }) }));

import { StepByStepBuilder } from "@/components/smart-builder/StepByStepBuilder";

const SCORING = { mode: "standard", pointsPerGame: 11, bestOf: 5, winCondition: "win_by_2", timeCapMinutes: "", timeCapPlay: "", timeCapBreak: "" };
const seed = (partner: string) => localStorage.setItem("sh.stepbuilder.c1", JSON.stringify({
  kind: "once_off", name: "Pair test", scope: "club", entries: "8", playType: "both", scoring: SCORING,
  categories: ["Open Doubles", "Singles"], disc: { "Open Doubles": "doubles", Singles: "singles" },
  format: { kind: "knockout" }, seeding: "random", partner: { "Open Doubles": partner }, source: "select", picks: {},
}));

async function openPick() {
  render(<StepByStepBuilder clubId="c1" clubName="Riverside" />);
  await waitFor(() => expect(screen.getAllByRole("button", { name: /pick players|select & pair players/i }).length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByRole("button", { name: /pick players|select & pair players/i })[0]);
  await screen.findByText("Anna");
}

describe("Step-by-Step: select & pair players", () => {
  beforeEach(() => localStorage.clear());

  it("lets the admin pair selected players with a Create pair action (multi-group tournament)", async () => {
    seed("admin");
    await openPick();
    for (const n of ["Anna", "Ben", "Cara"]) fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${n}`) }));
    const box = screen.getByTestId("pairing-Open Doubles");
    expect(within(box).getByText(/Unpaired players \(3\)/)).toBeInTheDocument();
    fireEvent.click(within(box).getByRole("button", { name: /Anna/, pressed: false }));
    fireEvent.click(within(box).getByRole("button", { name: /Ben/, pressed: false }));
    fireEvent.click(within(box).getByRole("button", { name: /Create pair: Anna \+ Ben/ }));
    expect(within(box).getByText(/Pair 1:/).parentElement?.textContent).toMatch(/Anna \+ Ben/);
    // Cara is still unplaced/unpaired → odd one out.
    expect(within(box).getByText(/Unpaired players \(1\)/)).toBeInTheDocument();
    // Split and re-pair
    fireEvent.click(within(box).getByRole("button", { name: "Split" }));
    expect(within(box).getByText(/Unpaired players \(3\)/)).toBeInTheDocument();
  });

  it("does not show pairing controls when players choose their own partner", async () => {
    seed("players");
    await openPick();
    fireEvent.click(screen.getByRole("button", { name: /^Anna/ }));
    expect(screen.queryByTestId("pairing-Open Doubles")).toBeNull();
  });
});
