import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

function chain(): any {
  const p: any = new Proxy(() => {}, { get: (_t, prop) => (prop === "then" ? (res: any) => Promise.resolve({ data: [], error: null }).then(res) : () => p), apply: () => p });
  return p;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => chain(), rpc: () => chain(), auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, functions: { invoke: async () => ({ data: null, error: null }) } } }));
vi.mock("@/hooks/use-tournament-eligibility", () => ({ useOrgHierarchyLite: () => ({ data: null, isLoading: false }) }));
vi.mock("@/hooks/use-association-tenant", () => ({ useAssociationTenant: () => ({ isAssociation: false, orgId: null }) }));
vi.mock("@/pages/admin/SmartTournamentBuilder", () => ({ SmartTournamentBuilderCore: () => null }));
vi.mock("@/components/club-admin/ClubChampsTab", () => ({ ClubChampsTab: ({ launchDiamond }: any) => <div data-testid="diamond-setup">{launchDiamond ? "existing Diamond setup" : "other"}</div> }));
// Management screen stub: shows which tournament id it opened.
vi.mock("@/components/smart-builder/StepTournamentManagement", () => ({
  StepTournamentManagement: ({ tournamentId, onBack }: any) => <div><div data-testid="managing">{tournamentId}</div><button onClick={onBack}>Back</button></div>,
}));

import { ClubTournamentBeta } from "@/components/smart-builder/ClubTournamentBeta";
import { draftKey, legacyKey, tournamentKey } from "@/lib/smart-builder/step-storage";
import { fromStepTemplate, toStepTemplate } from "@/lib/smart-builder/step-templates";

const RIV = "riverside-tid";
const rivPlan = { kind: "period", name: "Riverside Club champs", createdTournamentId: RIV, planId: "p-riv", categories: ["Mens"] };
const seed = () => {
  localStorage.setItem(legacyKey("c1"), JSON.stringify(rivPlan));
  localStorage.setItem("sh.stepbuilder.handover.c1", JSON.stringify([{ tournamentId: RIV, clubId: "c1", name: "Riverside Club champs" }]));
};
const draft = () => JSON.parse(localStorage.getItem(draftKey("c1")) || "{}");
const ui = () => render(<MemoryRouter><ClubTournamentBeta clubId="c1" clubName="Riverside" /></MemoryRouter>);

describe("Tournament landing: creation choices only; management lives on the normal tournament cards", () => {
  beforeEach(() => { localStorage.clear(); });

  it("offers exactly the three start choices and hands the Diamond pre-built template to the existing setup", () => {
    ui();
    expect(screen.getByRole("button", { name: /Build your tournament step by step/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Use one of my templates/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Pre-built templates/ }));
    expect(screen.getByText("Diamond League")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use template" }));
    expect(screen.getByTestId("diamond-setup")).toHaveTextContent("existing Diamond setup");
  });

  it("never shows a duplicate 'Continue managing' list, even with saved handovers", () => {
    seed(); ui();
    expect(screen.queryByText("Continue managing")).toBeNull();
    expect(screen.queryByRole("button", { name: "Riverside Club champs" })).toBeNull();
    // Saved local data is NOT deleted just because the list is gone.
    expect(JSON.parse(localStorage.getItem("sh.stepbuilder.handover.c1") || "[]")).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(tournamentKey(RIV))!)).toEqual(rivPlan);
  });

  it("the normal tournament list's Manage action opens that exact tournament", () => {
    seed();
    render(<MemoryRouter><ClubTournamentBeta clubId="c1" clubName="Riverside" renderList={(manage) => <button onClick={() => manage(RIV)}>Manage Riverside</button>} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Manage Riverside" }));
    expect(screen.getByTestId("managing").textContent).toBe(RIV);
    expect(JSON.parse(localStorage.getItem(tournamentKey(RIV))!)).toMatchObject(rivPlan);
  });

  it("a new draft gets its own plan identity and never alters Riverside", async () => {
    seed(); ui();
    fireEvent.click(screen.getByText("Build your tournament step by step"));
    await screen.findAllByRole("button", { name: /Summary/ });
    const d = draft();
    expect(d.planId).toBeTruthy();
    expect(d.planId).not.toBe("p-riv");
    expect(d.createdTournamentId).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(tournamentKey(RIV))!)).toEqual(rivPlan);
  });

  it("an unfinished draft is never silently resumed or overwritten by the New tile", () => {
    seed(); localStorage.setItem(draftKey("c1"), JSON.stringify({ kind: "once_off", name: "Spring Open" }));
    ui();
    expect(screen.getByText("Continue draft: Spring Open")).toBeTruthy();
    fireEvent.click(screen.getByText("Build your tournament step by step"));
    expect(screen.getByRole("alertdialog").textContent).toMatch(/unfinished new tournament draft/);
    fireEvent.click(screen.getByText("Start a new tournament"));
    expect(draft().name || "").toBe("");
  });

  it("a template starts a new copied identity — no tournament id, template copy untouched", () => {
    const def = toStepTemplate({ ...rivPlan, picks: { m1: "Mens" } } as any);
    const copy = fromStepTemplate(def) as any;
    expect(copy.createdTournamentId).toBeUndefined();
    expect(copy.picks ?? {}).toEqual({});
    expect(toStepTemplate({ ...rivPlan } as any)).toEqual(def);
  });

  it("retains categories, format, eligibility and ordered stages while clearing only event-specific details", () => {
    const source = {
      kind: "period", name: "CSIR CC", createdTournamentId: "tid", planId: "original",
      categories: ["A", "B", "Ladies"], categoryTypes: { A: "mens", B: "mens", Ladies: "ladies" },
      format: { kind: "pools" }, poolPlan: { A: { mode: "auto" } },
      elig: { B: { mode: "leagues", leagueIds: ["league-7"] } },
      entriesOpen: "2026-09-01", entriesClose: "2026-09-30",
      periodStart: "2026-10-01", picks: { player: ["B"] },
      stages: [
        { id: "round", name: "Round 1", phase: "main", mode: "play_by", deadline: "2026-10-07", unit: "", courtIds: [] },
        { id: "final", name: "Final", phase: "playoff", mode: "scheduled", date: "2026-10-30", from: "17:00", to: "20:00", courtIds: ["court"] },
      ],
    } as any;
    const saved = toStepTemplate(source);
    const restored = fromStepTemplate(saved);
    expect(restored).toMatchObject({ categories: source.categories, categoryTypes: source.categoryTypes, format: source.format, poolPlan: source.poolPlan, elig: source.elig });
    expect(restored.stages?.map((s) => [s.name, s.phase, s.mode])).toEqual([["Round 1", "main", "play_by"], ["Final", "playoff", "scheduled"]]);
    expect(restored.stages?.[1].id).not.toBe("final");
    expect(restored.stages?.[1].date).toBe("");
    expect(restored.entriesOpen).toBe("");
    expect(restored.entriesClose).toBe("");
    expect(restored.createdTournamentId).toBeUndefined();
    expect(source.stages[1].date).toBe("2026-10-30");
  });

  it("removes an unfinished draft separately after confirmation", async () => {
    localStorage.setItem(draftKey("c1"), JSON.stringify({ kind: "once_off", name: "Test build" }));
    ui();
    fireEvent.click(screen.getByRole("button", { name: "Remove unfinished draft" }));
    expect(screen.getByText(/No tournament will be deleted/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove draft" }));
    expect(localStorage.getItem(draftKey("c1"))).toBeNull();
    expect(screen.queryByText("Unfinished draft")).toBeNull();
  });
});
