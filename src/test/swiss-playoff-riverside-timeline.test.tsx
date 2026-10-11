import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { savedSwissPlayoff } from "@/components/smart-builder/swiss-playoff-setup";
import { SwissPlayoffSetupDialog } from "@/components/smart-builder/SwissPlayoffSetupDialog";
import { specWithSetup } from "@/lib/tournaments/progression";

const mocks = vi.hoisted(() => ({ check: vi.fn(), setup: vi.fn(), confirm: vi.fn(), preview: vi.fn(), select: vi.fn(), order: Array.from({ length: 16 }, (_, i) => `p${i + 1}`) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: mocks.order, isLoading: false }) }));
vi.mock("@/lib/tournaments/progression", async (original) => ({ ...(await original<any>()), checkDeferredSetup: mocks.check, setupDeferredStage: mocks.setup, confirmNextStage: mocks.confirm, previewNextStage: mocks.preview }));
vi.mock("@/lib/tournaments/structured-db", () => ({ supabaseDb: { select: mocks.select } }));

// Exact Riverside Club Champs shape (read-only snapshot, 11 Oct 2026): spec frozen at draw time
// (QF pairing "later", SF, no Final); stage list edited later (QF seeded/auto, SF winners, Final 26 Nov).
const source: any = { id: "vmv0p0b27-main", name: "Swiss rounds", kind: "swiss", discipline: "singles", order: 1 };
const frozen = (label: string): any => ({
  divisionId: "g1", label, unit: "players", stages: [source],
  deferredStages: [
    { stageKey: "vmv0p0b27-po1", name: "Quarterfinal", plannedDate: "2026-11-24", plan: { courtIds: [20, 21, 24], date: "2026-11-24", deadline: null, from: "18:00", mode: "scheduled", pairing: "later", to: "21:00", trigger: "auto" } },
    { stageKey: "vmv0p0b27-po2", name: "Semifinal", plannedDate: "2026-11-25", plan: { courtIds: [20, 21, 24], date: "2026-11-25", deadline: null, from: "18:00", mode: "scheduled", pairing: "later", to: "21:00", trigger: null } },
  ],
});
const stages = [
  { id: "r1", name: "Round 1", phase: "main", unit: "", mode: "scheduled", date: "2026-10-13" },
  { id: "iwdf7jobqd", name: "Quarterfinal", phase: "playoff", unit: "", pairing: "seeded", start: "auto", mode: "scheduled", date: "2026-11-24", from: "18:00", to: "21:00", courtIds: [20, 21, 24] },
  { id: "4rz89n94eiy", name: "Semifinal", phase: "playoff", unit: "", pairing: "winners", mode: "scheduled", date: "2026-11-25", from: "18:00", to: "21:00", courtIds: [20, 21, 24] },
  { id: "l551da5okb", name: "Final", phase: "playoff", unit: "", pairing: "winners", start: "auto", mode: "scheduled", date: "2026-11-26", from: "18:00", to: "21:00", courtIds: [20, 21, 26] },
];
const riverside = { playoff: { choice: "playoffs", pairing: "later", qualification: "later", rounds: 2, style: "later" }, playoffOverrides: {}, playoffSync: true, stages };
const status: any = { divisionKey: "g1", stageKey: "vmv0p0b27-po1", name: "Quarterfinal", afterStageKey: "vmv0p0b27-main" };
const tournament = { beta_lifecycle: { format_plan: riverside }, league_scoring_modes: { 1: "standard" }, league_points_per_game: { 1: 11 }, league_best_of: { 1: 5 } };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Riverside Men's A Swiss → Quarterfinal from saved Stages & Scheduling", () => {
  it("reads the stage list as authoritative: Top 8, 4 seeded games, saved date/courts/trigger, Final added", () => {
    const r = savedSwissPlayoff(frozen("Mens A · Singles"), source, "vmv0p0b27-po1", "Quarterfinal", riverside, 16);
    expect(r.issues).toEqual([]);
    expect(r.mode).toBe("setup");
    expect(r.top).toBe(8);
    expect(r.mapping!.matches.map((m) => `${m.a} v ${m.b}`)).toEqual(["A1 v A8", "A4 v A5", "A2 v A7", "A3 v A6"]);
    expect(r.schedule).toMatchObject({ rule: "fixed", date: "2026-11-24", timeFrom: "18:00", timeTo: "21:00", courtIds: [20, 21, 24] });
    expect(r.trigger).toBe("auto");
    expect(r.laterSync!.map((s) => [s.stageKey, s.name, s.plannedDate])).toEqual([["vmv0p0b27-po2", "Semifinal", "2026-11-25"], ["vmv0p0b27-po3", "Final", "2026-11-26"]]);
    expect(r.laterSync![1].plan!.courtIds).toEqual([20, 21, 26]);
  });
  it("'All categories' rows give every category its own Top 8; a short field is flagged, not shrunk", () => {
    for (const label of ["Mens B · Singles", "Mens C · Singles", "Ladies · Singles"]) expect(savedSwissPlayoff(frozen(label), source, "vmv0p0b27-po1", "Quarterfinal", riverside, 10).issues).toEqual([]);
    expect(savedSwissPlayoff(frozen("Ladies · Singles"), source, "vmv0p0b27-po1", "Quarterfinal", riverside, 6).issues).toContain("Only 6 Swiss entries are available for 8 qualifying places.");
  });
  it("category-specific rows win over the shared row", () => {
    const own = { ...riverside, stages: [...stages, { id: "x", name: "Final", phase: "playoff", unit: "Ladies", pairing: "seeded", mode: "scheduled", date: "2026-11-26" }] };
    // Ladies now has QF/SF/Final (shared) + its own Final → not a standard chain: flagged, never guessed.
    expect(savedSwissPlayoff(frozen("Ladies · Singles"), source, "vmv0p0b27-po1", "Quarterfinal", own, 10).issues.join(" ")).toMatch(/not a standard chain/);
    expect(savedSwissPlayoff(frozen("Mens A · Singles"), source, "vmv0p0b27-po1", "Quarterfinal", own, 16).issues).toEqual([]);
  });
  it("flags genuine mismatches instead of overwriting", () => {
    const sfOnly = { ...riverside, stages: stages.filter((s) => s.name !== "Quarterfinal") };
    expect(savedSwissPlayoff(frozen("Mens A · Singles"), source, "vmv0p0b27-po1", "Quarterfinal", sfOnly, 16).issues.join(" ")).toMatch(/first saved playoff stage is Semifinal/);
    const unpaired = { ...riverside, stages: stages.map((s) => s.name === "Quarterfinal" ? { ...s, pairing: "later" } : s) };
    expect(savedSwissPlayoff(frozen("Mens A · Singles"), source, "vmv0p0b27-po1", "Quarterfinal", unpaired, 16).issues.join(" ")).toMatch(/needs Seeded/);
    const d = frozen("Mens A · Singles"); d.deferredStages[1].name = "Plate";
    expect(savedSwissPlayoff(d, source, "vmv0p0b27-po1", "Quarterfinal", riverside, 16).issues.join(" ")).toMatch(/disagree with Stages & Scheduling/);
  });
  it("falls back to the generic Playoffs answers only when there is no stage list", () => {
    const r = savedSwissPlayoff(frozen("Mens A · Singles"), source, "vmv0p0b27-po1", "Quarterfinal", { ...riverside, stages: [] }, 16);
    expect(r.issues).toContain("Swiss qualification is not saved as Top players/pairs on standings. Edit Tournament Setup; no qualifier count will be guessed.");
  });
  it("planning target → runnable stage exactly once; later stages appended, none removed", () => {
    const d = frozen("Mens A · Singles");
    const r = savedSwissPlayoff(d, source, "vmv0p0b27-po1", "Quarterfinal", riverside, 16);
    const next = specWithSetup({ divisions: [d] } as any, "g1", "vmv0p0b27-po1", { kind: "mapped", discipline: "singles", mapping: r.mapping!, schedule: r.schedule!, syncLater: r.laterSync! });
    const nd = next.spec.divisions[0];
    expect(nd.stages.map((s) => s.id)).toEqual(["vmv0p0b27-main", "vmv0p0b27-po1"]);
    expect(nd.deferredStages!.map((s) => s.name)).toEqual(["Semifinal", "Final"]);
    expect(nd.stages[0]).toBe(source);
    expect(() => specWithSetup(next.spec, "g1", "vmv0p0b27-po1", { kind: "mapped", mapping: r.mapping! })).toThrow();
    const dup = { ...d, stages: [source, { id: "vmv0p0b27-po1" }] };
    expect(() => specWithSetup({ divisions: [dup] } as any, "g1", "vmv0p0b27-po1", { kind: "mapped", mapping: r.mapping! })).toThrow(/already exists/);
    expect(() => specWithSetup({ divisions: [d] } as any, "g1", "vmv0p0b27-po1", { kind: "mapped", mapping: r.mapping!, syncLater: [{ stageKey: "vmv0p0b27-po2", name: "Final", plannedDate: null }] })).toThrow(/disagree/);
  });
  it("dialog: shows setup-from-saved preview, checks, and only creates after explicit confirmation", async () => {
    mocks.check.mockResolvedValue({ structure: [], engine: [], schedule: [], scoring: [] });
    const d = frozen("Mens A · Singles");
    render(<MemoryRouter><SwissPlayoffSetupDialog champId="t" spec={{ divisions: [d] } as any} status={status} tournament={tournament} division={d} source={source} exec={vi.fn()} nameOf={(id) => `Player ${id}`} onClose={vi.fn()} onDone={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("swiss-setup-from-saved")).toHaveTextContent("Set up Quarterfinal from saved setup");
    expect(screen.getByTestId("swiss-setup-from-saved")).toHaveTextContent("Semifinal → Final");
    expect(screen.getByTestId("swiss-qualifier-preview")).toHaveTextContent("#1 Player p1 v #8 Player p8");
    expect(screen.getByText("Scheduled: 2026-11-24")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check Draw" }));
    await screen.findByText("Draw checks passed.");
    expect(mocks.setup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Generate Quarterfinal Draw" }));
    expect(mocks.setup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm generation" }));
    await waitFor(() => expect(mocks.setup).toHaveBeenCalledOnce());
    const [, tid, div, key, setup] = mocks.setup.mock.calls[0];
    expect([tid, div, key]).toEqual(["t", "g1", "vmv0p0b27-po1"]);
    expect(setup.mapping.matches).toHaveLength(4);
    expect(setup.syncLater.map((s: any) => s.name)).toEqual(["Semifinal", "Final"]);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
