import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let liveIds = ["riverside-tid"];
let lookupFails = false;
function chain(table: string): any {
  const p: any = new Proxy(() => {}, { get: (_t, prop) => (prop === "then" ? (res: any) => Promise.resolve(table === "tournaments" ? { data: liveIds.map((id) => ({ id })), error: lookupFails ? { message: "offline" } : null } : { data: [], error: null }).then(res) : () => p), apply: () => p });
  return p;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => chain(table), rpc: () => chain("rpc"), auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, functions: { invoke: async () => ({ data: null, error: null }) } } }));
vi.mock("@/hooks/use-tournament-eligibility", () => ({ useOrgHierarchyLite: () => ({ data: null, isLoading: false }) }));
vi.mock("@/hooks/use-association-tenant", () => ({ useAssociationTenant: () => ({ isAssociation: false, orgId: null }) }));
vi.mock("@/pages/admin/SmartTournamentBuilder", () => ({ SmartTournamentBuilderCore: () => null }));
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
  // Pre-fix state: the single shared slot holds Riverside's plan (the root cause).
  localStorage.setItem(legacyKey("c1"), JSON.stringify(rivPlan));
  localStorage.setItem("sh.stepbuilder.handover.c1", JSON.stringify([{ tournamentId: RIV, clubId: "c1", name: "Riverside Club champs" }]));
};
const draft = () => JSON.parse(localStorage.getItem(draftKey("c1")) || "{}");
const ui = () => render(<MemoryRouter><ClubTournamentBeta clubId="c1" clubName="Riverside" /></MemoryRouter>);

describe("Tournament Beta landing: New vs Continue managing", () => {
  beforeEach(() => { localStorage.clear(); liveIds = [RIV]; lookupFails = false; });

  it("A) manage Riverside → back → Build step by step opens a fresh NEW setup, not Riverside", async () => {
    seed(); ui();
    fireEvent.click(await screen.findByRole("button", { name: "Riverside Club champs" }));
    expect(screen.getByTestId("managing").textContent).toBe(RIV);
    fireEvent.click(screen.getByText("Back"));
    fireEvent.click(screen.getByText("Build your tournament step by step"));
    await screen.findAllByRole("button", { name: /Summary/ });
    expect(screen.queryByDisplayValue("Riverside Club champs")).toBeNull();
    expect(draft().createdTournamentId).toBeUndefined();
  });

  it("B) Continue managing opens that exact tournament and keeps its plan", async () => {
    seed(); ui();
    fireEvent.click(await screen.findByRole("button", { name: "Riverside Club champs" }));
    expect(screen.getByTestId("managing").textContent).toBe(RIV);
    expect(JSON.parse(localStorage.getItem(tournamentKey(RIV))!)).toMatchObject(rivPlan);
  });

  it("C) a new draft gets its own plan identity and never alters Riverside", async () => {
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

  it("D) a template starts a new copied identity — no tournament id, template copy untouched", () => {
    const def = toStepTemplate({ ...rivPlan, picks: { m1: "Mens" } } as any);
    const copy = fromStepTemplate(def) as any;
    expect(copy.createdTournamentId).toBeUndefined();
    expect(copy.picks ?? {}).toEqual({});
    expect(toStepTemplate({ ...rivPlan } as any)).toEqual(def);
  });

  it("removes an orphaned card and plan only after the club-scoped tournament lookup", async () => {
    seed(); liveIds = [];
    ui();
    await waitFor(() => expect(screen.queryByText("Continue managing")).toBeNull());
    expect(localStorage.getItem("sh.stepbuilder.handover.c1")).toBe("[]");
    expect(localStorage.getItem(tournamentKey(RIV))).toBeNull();
  });

  it("does not prune stored records when the lookup fails", async () => {
    seed(); lookupFails = true;
    ui();
    expect(await screen.findByText(/Could not check saved tournaments/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("sh.stepbuilder.handover.c1") || "[]")).toHaveLength(1);
  });

  it("confirms local-only removal of a live build, without deleting its tournament", async () => {
    seed(); ui();
    fireEvent.click(await screen.findByRole("button", { name: /Remove build for Riverside Club champs/ }));
    expect(screen.getByText(/real tournament, its fixtures, results and history will NOT be deleted/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Riverside Club champs" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Remove build for Riverside Club champs/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove builder card only" }));
    expect(screen.queryByRole("button", { name: "Riverside Club champs" })).toBeNull();
    expect(localStorage.getItem(tournamentKey(RIV))).toBeNull();
    expect(localStorage.getItem("sh.stepbuilder.handover.c1")).toBe("[]");
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
