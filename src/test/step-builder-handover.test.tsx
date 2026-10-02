import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const MEMBERS = [{ id: "m1", name: "Anna Smith" }, { id: "m2", name: "Ben Jones" }];
const calls: Array<{ table: string; op: string; arg: any }> = [];
function chain(table: string): any {
  let op = "select";
  const result = () => table === "club_members" ? { data: MEMBERS, error: null }
    : table === "club_champs" && op === "insert" ? { data: { id: "t-new" }, error: null }
    : table === "club_champs_registrations" && op === "select" ? { data: [{ status: "pending_payment" }, { status: "pending_payment" }], error: null }
    : { data: [], error: null };
  const p: any = new Proxy(() => {}, {
    get: (_t, prop) => {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
      return (arg: any) => { if (["insert", "upsert", "update", "delete"].includes(String(prop))) { op = String(prop); calls.push({ table, op, arg }); } return p; };
    },
    apply: () => p,
  });
  return p;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => chain(t), rpc: () => chain("rpc") } }));
vi.mock("@/hooks/use-tournament-eligibility", () => ({ useOrgHierarchyLite: () => ({ data: null, isLoading: false }) }));
vi.mock("@/hooks/use-association-tenant", () => ({ useAssociationTenant: () => ({ isAssociation: false, orgId: null }) }));
vi.mock("@/pages/admin/SmartTournamentBuilder", () => ({ SmartTournamentBuilderCore: () => null }));

import { ClubTournamentBeta } from "@/components/smart-builder/ClubTournamentBeta";

const SCORING = { mode: "standard", pointsPerGame: 11, bestOf: 5, winCondition: "win_by_2", timeCapMinutes: "", timeCapPlay: "", timeCapBreak: "" };
const seedChamps = () => localStorage.setItem("sh.stepbuilder.c1", JSON.stringify({
  kind: "period", name: "Riverside Champs", scope: "club", periodStart: "2026-11-01", playType: "doubles", scoring: SCORING,
  categories: ["Open Doubles"], disc: { "Open Doubles": "doubles" }, unitEntries: { "Open Doubles": "8" }, format: { kind: "knockout" },
  seeding: "later", partner: { "Open Doubles": "admin" }, source: "select", elig: {},
  picks: { m1: "Open Doubles", m2: "Open Doubles" }, pairs: { "Open Doubles": [["m1", "m2"]] },
  fee: { has: true, amount: "200", varies: false, perUnit: {}, doublesBasis: "pair", doublesCover: true, methods: ["cash"] },
  stages: [{ id: "s1", unit: "", name: "Round 1", mode: "play_by", deadline: "2026-11-15", date: "", from: "", to: "", courtIds: [], phase: "main" }],
  playoffSync: "later",
}));

describe("Step-by-Step handover: Summary → Tournament Management (admin-selected + admin-paired doubles, fee)", () => {
  beforeEach(() => { localStorage.clear(); calls.length = 0; });

  it("completes setup, enters the pair as payment outstanding, and opens Inform selected players", async () => {
    seedChamps();
    render(<MemoryRouter><ClubTournamentBeta clubId="c1" clubName="Riverside" /></MemoryRouter>);
    fireEvent.click(screen.getByText("Build your tournament step by step"));
    fireEvent.click((await screen.findAllByRole("button", { name: /^\d*\s*Summary/ }))[0]);

    const top = await screen.findByTestId("handover-top");
    await waitFor(() => expect(top.textContent).toMatch(/Tournament setup complete/));
    expect(top.textContent).toMatch(/Needed at Finalise entries:.*Seeding/);
    expect(top.textContent).toMatch(/Needed at Generate draw & fixtures:.*Playoff dates/);
    expect(top.textContent).toMatch(/None of these block completing setup/);
    expect(screen.getByTestId("handover-bottom")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Complete setup & continue/ })[0]);

    // Management view, not the old builder.
    expect(await screen.findByText("Next action")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Riverside Champs" })).toBeInTheDocument();
    expect(screen.getByText("Invite / Inform players").closest("li")).toHaveAttribute("aria-current", "step");
    const insert = calls.find((c) => c.table === "club_champs" && c.op === "insert")!;
    expect(insert.arg).toMatchObject({ club_id: "c1", name: "Riverside Champs", status: "planning", entry_fee_cents: 20000, payment_required: true, payment_methods: ["cash"], partner_mode: "admin" });
    const regs = calls.find((c) => c.table === "club_champs_registrations" && c.op === "upsert")!;
    expect(regs.arg).toEqual(expect.arrayContaining([
      expect.objectContaining({ club_member_id: "m1", partner_member_id: "m2", status: "pending_payment", confirmation_source: "admin" }),
      expect.objectContaining({ club_member_id: "m2", partner_member_id: "m1", status: "pending_payment" }),
    ]));
    expect(regs.arg.some((r: any) => r.status === "paid")).toBe(false);

    // Conditional first action: inform, not invite.
    expect(screen.queryByRole("button", { name: /^Invite players/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Inform selected players/ }));
    expect(screen.getByText(/Your doubles partner: Ben Jones/)).toBeInTheDocument();
    expect(screen.getByText(/Your doubles partner: Anna Smith/)).toBeInTheDocument();
    expect(screen.getAllByText("Entered · Payment outstanding")).toHaveLength(2);
    expect(screen.getAllByText(/Amount due: R200 for your pair/).length).toBe(2);
    expect(screen.queryByText(/You are invited/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Mark as informed & continue/ }));
    expect(screen.getByText("Registrations & payments").closest("li")).toHaveAttribute("aria-current", "step");

    // Edit setup returns to Summary and re-saving updates the same tournament (no duplicate).
    fireEvent.click(screen.getByRole("button", { name: /Edit tournament setup/ }));
    fireEvent.click((await screen.findAllByRole("button", { name: /Save setup & return to management/ }))[0]);
    expect(await screen.findByText("Next action")).toBeInTheDocument();
    expect(calls.filter((c) => c.table === "club_champs" && c.op === "insert")).toHaveLength(1);
    expect(calls.some((c) => c.table === "club_champs" && c.op === "update")).toBe(true);
    expect(screen.getByText("Registrations & payments").closest("li")).toHaveAttribute("aria-current", "step");
  });
});
