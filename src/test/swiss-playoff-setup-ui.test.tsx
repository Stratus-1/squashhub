import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { savedSwissPlayoff, swissSetupPilot, RIVERSIDE_PLAYOFF_PILOT } from "@/components/smart-builder/swiss-playoff-setup";
import { SwissPlayoffSetupDialog } from "@/components/smart-builder/SwissPlayoffSetupDialog";
import { seededBracketText } from "@/lib/tournaments/seeded-bracket";
import { parseMapping, resolveMapping } from "@/lib/tournaments/mapping";

const mocks = vi.hoisted(() => ({ check: vi.fn(), generate: vi.fn(), preview: vi.fn(), select: vi.fn(), order: Array.from({ length: 16 }, (_, i) => `p${i + 1}`) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: mocks.order, isLoading: false }) }));
vi.mock("@/lib/tournaments/progression", async (original) => ({ ...(await original<any>()), checkDeferredSetup: mocks.check, setupDeferredStage: mocks.generate, confirmNextStage: mocks.generate, previewNextStage: mocks.preview }));
vi.mock("@/lib/tournaments/structured-db", () => ({ supabaseDb: { select: mocks.select } }));
const source: any = { id: "sw", name: "Swiss rounds", kind: "swiss", discipline: "singles", order: 0 };
const division: any = { divisionId: "a", label: "Men's A · Singles", unit: "players", stages: [source], deferredStages: [{ stageKey: "qf", name: "Quarterfinal", plan: { date: "2026-11-24", mode: "scheduled", courtIds: [20, 21], from: "18:00", to: "21:00" } }] };
const plan = { playoff: { choice: "playoffs", qualification: "top_pools", pairing: "seeded", style: "championship", rounds: 3 } };
const tournament = { beta_lifecycle: { format_plan: plan }, league_scoring_modes: { 1: "standard" }, league_points_per_game: { 1: 11 }, league_best_of: { 1: 5 } };
const status: any = { divisionKey: "a", stageKey: "qf", name: "Quarterfinal", afterStageKey: "sw" };
const mapping = parseMapping(seededBracketText(8), { source: "stage_standings", sourceStageId: "sw", pools: 1, poolSize: 16, discipline: "singles" }).mapping;
const configured = { ...division, stages: [source, { id: "qf", name: "Quarterfinal", kind: "mapped", order: 1, mapping, schedule: { rule: "fixed", date: "2026-11-24" } }] };
function mount(t = tournament, d = configured) { render(<MemoryRouter><SwissPlayoffSetupDialog champId="t" spec={{ divisions: [d] } as any} status={status} tournament={t} division={d} source={source} exec={vi.fn()} nameOf={(id) => `Player ${id}`} onClose={vi.fn()} onDone={vi.fn()} /></MemoryRouter>); }
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("Riverside Swiss playoff preflight", () => {
  it("is source-kind keyed, fails closed and leaves non-pilot/multi-pool RR unchanged", () => {
    expect(swissSetupPilot(RIVERSIDE_PLAYOFF_PILOT, true, "swiss")).toBe(true);
    expect(swissSetupPilot(RIVERSIDE_PLAYOFF_PILOT, false, "swiss")).toBe(false);
    expect(swissSetupPilot("another-club", true, "swiss")).toBe(false);
    expect(swissSetupPilot(RIVERSIDE_PLAYOFF_PILOT, true, "pools")).toBe(false);
    expect(swissSetupPilot(RIVERSIDE_PLAYOFF_PILOT, true, "round_robin")).toBe(false);
  });
  it("requires saved qualification and matching bracket count, not a QF name or default 2", () => {
    expect(savedSwissPlayoff(division, source, "qf", "Quarterfinal", { playoff: { qualification: "later", rounds: 2 } }, 16).issues.length).toBeGreaterThan(0);
    expect(savedSwissPlayoff(configured, source, "qf", "Quarterfinal", plan, 16).issues).toEqual([]);
    expect(savedSwissPlayoff(division, source, "qf", "Quarterfinal", plan, 6).issues).toContain("Only 6 Swiss entries are available for 8 qualifying places.");
  });
  it("renders actual names, inherited rules and four seeded games, with no generic controls", () => {
    mount();
    expect(screen.getByTestId("swiss-transition-summary")).toHaveTextContent("Men's A · Singles · Swiss standings");
    const preview = screen.getByTestId("swiss-qualifier-preview");
    expect(preview).toHaveTextContent("#1 Player p1 v #8 Player p8");
    expect(preview).toHaveTextContent("#4 Player p4 v #5 Player p5");
    expect(preview).toHaveTextContent("#2 Player p2 v #7 Player p7");
    expect(preview).toHaveTextContent("#3 Player p3 v #6 Player p6");
    expect(screen.getByTestId("inherited-match-format")).toHaveTextContent("PAR 11 · Best of 5");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Qualify per pool")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create stage" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Quarterfinal Draw" })).toBeDisabled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("blocks incomplete actual saved setup and links to its correction", () => {
    mount({ ...tournament, beta_lifecycle: { format_plan: { playoff: { ...plan.playoff, qualification: "later" } } } }, division);
    expect(screen.getByRole("alert")).toHaveTextContent("no qualifier count will be guessed");
    expect(screen.getByRole("button", { name: "Check Draw" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Generate Quarterfinal Draw" }));
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Return to Tournament Setup" })).toHaveAttribute("href", "/club-admin?club=riverside&tab=champs&setup=t");
    expect(screen.getByRole("heading", { name: "Generate Quarterfinal Draw" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).not.toHaveTextContent("runnable stage definition is absent");
  });
  it("requires an existing persisted identity, check and explicit confirmation; never invokes deferred creation", async () => {
    mocks.select.mockImplementation(async (table) => table === "tournament_divisions" ? [{ id: "division" }] : [{ id: "stage" }]);
    mocks.preview.mockResolvedValue(Array.from({ length: 4 }, () => ({})));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Check Draw" }));
    await screen.findByText("Draw checks passed.");
    expect(mocks.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Generate Quarterfinal Draw" }));
    expect(mocks.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm generation" }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
    expect(mocks.generate.mock.calls[0].slice(1, 4)).toEqual(["t", "a", "qf"]);
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it("blocks a missing stored identity before dry-run or generation", async () => {
    mocks.select.mockResolvedValue([]);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Check Draw" }));
    await screen.findByText(/existing stage identity is missing/);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("targets saved existing QF, never appends a duplicate or rewrites inconsistent pairings", () => {
    const mapping = parseMapping(seededBracketText(8), { source: "stage_standings", sourceStageId: "sw", pools: 1, poolSize: 16, discipline: "singles" }).mapping;
    const qf = { id: "qf", mapping };
    const d = { ...division, stages: [source, qf] };
    const result = savedSwissPlayoff(d, source, "qf", "Quarterfinal", null, 16);
    expect(result.existing).toBe(qf);
    expect(result.mapping).toBe(mapping);
    expect(result.issues).toEqual([]);
    expect(d.stages).toHaveLength(2);
  });
  it("preserves doubles pairs as ranked units, never forms new pairs from two positions", () => {
    const d = { ...division, unit: "pairs", label: "Doubles A", stages: [{ ...source, discipline: "doubles" }] };
    const result = savedSwissPlayoff(d, d.stages[0], "qf", "Quarterfinal", plan, 8);
    expect(result.discipline).toBe("doubles");
    if (!result.mapping) throw new Error("Missing mapping");
    const pairs = Array.from({ length: 8 }, (_, i) => `a${i}+b${i}`);
    expect(resolveMapping(result.mapping, [pairs])[0]).toMatchObject({ aId: "a0+b0", bId: "a7+b7" });
  });
});