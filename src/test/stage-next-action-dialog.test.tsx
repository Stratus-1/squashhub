import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StageProgressPanel } from "@/components/smart-builder/StageProgressPanel";
import type { TournamentSpec } from "@/lib/tournaments/engine-service";
import type { StageStatus } from "@/lib/tournaments/progression";

const mocks = vi.hoisted(() => ({ states: [] as any[], commit: vi.fn(), notify: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => ({ data: queryKey[0] === "stage-lifecycle" ? mocks.states : [], refetch: vi.fn(), isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/supabase-ext", () => ({ fromExt: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { beta_lifecycle: {} } }) }) }) }) }));
vi.mock("@/lib/tournaments/structured-db", () => ({ supabaseDb: {}, commitStructured: mocks.commit }));
vi.mock("@/lib/tournaments/round-notify", () => ({ notifyRoundDraw: mocks.notify, roundNotifySummary: vi.fn() }));

afterEach(cleanup);
describe("stage panel next-action bridge", () => {
  it("keeps actual multi-pool round-robin qualification controls separate from Swiss", () => {
    mocks.states = [{ divisionKey: "RR", divisionLabel: "RR category", stageKey: "qf", afterStageKey: "pools", name: "Quarterfinal", state: "needs_setup", automatic: false, detail: "Pools complete", played: 0, total: 0 }];
    const spec = { divisions: [{ divisionId: "RR", label: "RR category", unit: "players", stages: [{ id: "pools", name: "Round-robin pools", kind: "pools", pools: 4, poolSize: 4, order: 0 }], deferredStages: [{ stageKey: "qf", name: "Quarterfinal" }] }] } as TournamentSpec;
    render(<StageProgressPanel champId="t" spec={spec} matches={[]} nameOf={() => "Player"} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Generate Quarterfinal" })[0]);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "knockout" } });
    expect(screen.getByText("Qualify per pool")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cross-pool (winner v runner-up)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create stage" })).toBeInTheDocument();
    expect(screen.queryByTestId("swiss-transition-summary")).not.toBeInTheDocument();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it.each(["ready", "needs_setup"] as const)("opens the existing %s dialog and replaces duplicate generate controls", (state) => {
    const status: StageStatus = { divisionKey: "A", divisionLabel: "Men's A", stageKey: "qf", afterStageKey: "s", name: "Quarterfinal", state, automatic: false, detail: "Next stage", played: 0, total: 0 };
    mocks.states = [status];
    const spec = { divisions: [{ divisionId: "A", label: "Men's A", stages: [{ id: "s", name: "Swiss rounds", kind: "swiss", swissRounds: 5, order: 0 }, ...(state === "ready" ? [{ id: "qf", name: "Quarterfinal", kind: "knockout", order: 1, waitForOrganiser: true }] : [])], deferredStages: state === "needs_setup" ? [{ stageKey: "qf", name: "Quarterfinal" }] : [] }] } as TournamentSpec;
    render(<StageProgressPanel champId="t" spec={spec} matches={[]} nameOf={() => "Player"} renderNextActions={(states, open) => <button onClick={() => open(states[0])}>Generate Quarterfinal Draw</button>} />);
    expect(screen.queryByRole("button", { name: /^Generate Quarterfinal$/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate Quarterfinal Draw" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: state === "ready" ? "Generate Quarterfinal — Men's A" : "Set up Quarterfinal" })).toBeInTheDocument();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});