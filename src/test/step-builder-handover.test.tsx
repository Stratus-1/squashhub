import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const MEMBERS = [{ id: "m1", name: "Anna Smith" }, { id: "m2", name: "Ben Jones" }];
let regStatus = "pending_payment";
const calls: Array<{ table: string; op: string; arg: any }> = [];
function chain(table: string): any {
  let op = "select";
  const result = () => table === "club_members" ? { data: MEMBERS, error: null }
    : table === "club_champs" && op === "insert" ? { data: { id: "t-new" }, error: null }
    : table === "club_champs" && op === "select" ? { data: { payment_timing: "after_acceptance" }, error: null }
    : table === "comms_campaigns" && op === "insert" ? { data: { id: "camp1" }, error: null }
    : table === "comms_deliveries" ? { data: [{ club_member_id: "m1", channel: "in_app", status: "sent", error_message: null }, { club_member_id: "m2", channel: "in_app", status: "sent", error_message: null }], error: null }
    : table === "club_champs_registrations" && op === "select" ? { data: [{ club_member_id: "m1", partner_member_id: "m2", status: regStatus }, { club_member_id: "m2", partner_member_id: "m1", status: regStatus }], error: null }
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
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => chain(t), rpc: (name: string, args: any) => { calls.push({ table: `rpc:${name}`, op: "rpc", arg: args }); return chain("rpc"); },
  auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  functions: { invoke: async (name: string, o: any) => { calls.push({ table: `fn:${name}`, op: "invoke", arg: o.body }); return { data: { ok: true, status: "sent", sent: 2, failed: 0, skipped: 0 }, error: null }; } } } }));
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
  fee: { has: true, amount: "200", varies: false, perUnit: {}, doublesBasis: "pair", doublesCover: true, methods: ["cash"], confirmNeedsPay: false },
  planId: "plan1",
  stages: [
    { id: "r1", unit: "", name: "Round 1", mode: "scheduled", deadline: "", date: "2026-11-03", from: "18:00", to: "21:00", courtIds: ["20", "21"], phase: "main" },
    { id: "r2", unit: "", name: "Round 2", mode: "play_by", deadline: "2026-11-15", date: "", from: "", to: "", courtIds: [], phase: "main" },
    { id: "sf", unit: "", name: "Semifinal", mode: "scheduled", deadline: "", date: "2026-11-20", from: "18:00", to: "21:00", courtIds: ["20"], phase: "playoff" },
    { id: "fi", unit: "", name: "Final", mode: "scheduled", deadline: "", date: "2026-11-21", from: "09:00", to: "12:00", courtIds: ["20"], phase: "playoff" },
  ],
  playoffSync: "later",
  waGroup: { use: true, url: "chat.whatsapp.com/AbCdEf123456", include: true },
}));

describe("Step-by-Step handover: Summary → Tournament Management (admin-selected + admin-paired doubles, fee)", () => {
  beforeEach(() => { localStorage.clear(); calls.length = 0; regStatus = "pending_payment"; });

  it("completes setup, enters the pair as payment outstanding, and opens Inform selected players", async () => {
    seedChamps();
    render(<MemoryRouter><ClubTournamentBeta clubId="c1" clubName="Riverside" /></MemoryRouter>);
    fireEvent.click(screen.getByText("Build your tournament step by step"));
    // Court bookings plan lists every concretely scheduled stage — main rounds too, not only playoffs; play-by rounds are not booked.
    fireEvent.click((await screen.findAllByRole("button", { name: /Stages & scheduling/ }))[0]);
    const panel = await screen.findByTestId("stage-court-bookings");
    expect(panel.textContent).toMatch(/Round 1 \(All categories\) · 2026-11-03 18:00–21:00 · Court 20/);
    expect(panel.textContent).toMatch(/Round 1 \(All categories\) · 2026-11-03 18:00–21:00 · Court 21/);
    expect(panel.textContent).toMatch(/Semifinal/);
    expect(panel.textContent).toMatch(/Final \(All categories\) · 2026-11-21/);
    expect(panel.textContent).not.toMatch(/Round 2/);
    fireEvent.click((await screen.findAllByRole("button", { name: /^\d*\s*Summary/ }))[0]);

    const top = await screen.findByTestId("handover-top");
    await waitFor(() => expect(top.textContent).toMatch(/Tournament setup complete/));
    expect(top.textContent).toMatch(/Needed at Finalise entries:.*Seeding/);
    expect(top.textContent).toMatch(/Needed at Generate draw & fixtures:.*Playoff dates/);
    expect(top.textContent).toMatch(/Must be decided before players are contacted \(0\)/);
    expect(top.textContent).toMatch(/Can stay "Decide later" for now \(2\)/);
    expect(screen.getByTestId("handover-bottom")).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp group: group link configured · join link included in messages/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Complete setup & continue/ })[0]);

    // Management view, not the old builder.
    expect(await screen.findByText("Next action")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Riverside Champs" })).toBeInTheDocument();
    expect(screen.getByText("Invite / Inform players").closest("li")).toHaveAttribute("aria-current", "step");
    const insert = calls.find((c) => c.table === "club_champs" && c.op === "insert")!;
    expect(insert.arg).toMatchObject({ club_id: "c1", name: "Riverside Champs", status: "planning", entry_fee_cents: 20000, payment_required: true, payment_methods: ["cash"], partner_mode: "admin", payment_timing: "after_acceptance" });
    // Entrants go through the one-for-one server sync (never a blind upsert that leaves replaced players counted).
    const regs = calls.find((c) => c.table === "rpc:step_sync_admin_entrants")!;
    expect(regs.arg.p_fee_due).toBe(true);
    expect(regs.arg.p_entrants).toEqual(expect.arrayContaining([
      expect.objectContaining({ memberId: "m1", partnerId: "m2" }),
      expect.objectContaining({ memberId: "m2", partnerId: "m1" }),
    ]));
    expect(calls.some((c) => c.table === "club_champs_registrations" && c.op === "upsert")).toBe(false);

    // Conditional first action: inform, not invite.
    expect(screen.queryByRole("button", { name: /^Invite players/ })).toBeNull();
    // Concise by default: one example message, recipients behind an expander.
    expect(await screen.findByText(/2 selected players/)).toBeInTheDocument();
    expect(screen.getAllByText(/Your doubles partner:/)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /^View recipients/ }));
    expect(screen.getAllByText(/Your doubles partner: Ben Jones/)).toHaveLength(1); // list doesn't repeat messages
    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[1]);
    expect(screen.getByText(/Your doubles partner: Anna Smith/)).toBeInTheDocument();
    expect(screen.getAllByText(/Amount due: R200 for your pair/).length).toBe(1);
    expect(screen.queryByText(/Pay now link added when/)).toBeNull();
    expect(screen.queryByText(/You are invited/)).toBeNull();

    expect(screen.queryByRole("button", { name: /Continue to Registrations/ })).toBeNull(); // not before sending
    fireEvent.click(screen.getByRole("button", { name: /^Inform selected players/ }));
    expect(calls.some((c) => c.table === "comms_campaigns")).toBe(false); // nothing before confirming
    expect(await screen.findByText(/Send to 2 real players\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send now" }));
    expect(await screen.findByText(/2 of 2 reached/)).toBeInTheDocument();
    const camp = calls.find((c) => c.table === "comms_campaigns" && c.op === "insert")!;
    expect(calls.find((c) => c.table === "tournament_whatsapp_groups" && c.op === "upsert")!.arg).toMatchObject({ invite_url: "https://chat.whatsapp.com/AbCdEf123456", status: "active" });
    expect(camp.arg.audience_filter.member_vars.m1.personal_message).toMatch(/Join the tournament WhatsApp group: https:\/\/chat\.whatsapp\.com\/AbCdEf123456/);
    expect(camp.arg).toMatchObject({ audience_type: "selected", audience_member_ids: ["m1", "m2"], channels: ["in_app"] });
    expect(camp.arg.action).toMatchObject({ key: "tournament_view", params: { tournament_id: "t-new" } });
    expect(camp.arg.audience_filter.member_vars.m1.personal_message).toMatch(/Your doubles partner: Ben Jones/);
    expect(calls.some((c) => c.table === "fn:send-comms-campaign" && c.arg.campaign_id === "camp1")).toBe(true);
    expect(calls.some((c) => c.table === "tournaments" && c.op === "update" && c.arg.beta_lifecycle?.inform?.method === "sent")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Continue to Registrations & payments/ }));
    await waitFor(() => expect(screen.getAllByText("Registrations & payments").map((e) => e.closest("li")?.getAttribute("aria-current")).join(",")).toBe("step"));
    // Blocked with an explanation, not hidden; nobody is marked paid automatically.
    expect(await screen.findByText(/2 payments outstanding/)).toBeInTheDocument();
    expect(screen.getByText(/doesn't block you/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Close registrations & finalise entries/ })).not.toBeDisabled();
    // Invite / Inform stays revisitable with Send again; revisiting doesn't move the stage back.
    fireEvent.click(screen.getByRole("button", { name: /Invite \/ Inform players/ }));
    expect(await screen.findByText(/Revisiting/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send again to everyone/ })).toBeInTheDocument();
    expect(camp.arg.audience_filter.member_vars.m1).toMatchObject({ pay_url: "/club-champs/t-new?pay=1", pay_label: expect.stringMatching(/^Pay (R[\d.,]+ )?now$/) });
    fireEvent.click(screen.getByRole("button", { name: /Back to current stage/ }));
    regStatus = "paid";
    fireEvent.click(screen.getByRole("button", { name: /Refresh payments/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Close registrations & finalise entries/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /Close registrations & finalise entries/ }));
    await waitFor(() => expect(screen.getByText("Finalise entries").closest("li")).toHaveAttribute("aria-current", "step"));
    expect(screen.getByText("Finalise entries").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(/Decide these first/).parentElement?.textContent).toMatch(/Seeding/);
    expect(screen.getByText(/expected 8 pairs/)).toBeInTheDocument();
    screen.getAllByRole("button", { name: /Generate draw & fixtures/ }).forEach((b) => expect(b).toBeDisabled());

    // Edit setup returns to Summary and re-saving updates the same tournament (no duplicate).
    fireEvent.click(screen.getByRole("button", { name: /Edit tournament setup/ }));
    expect(await screen.findByText("Players are already entered")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit anyway" }));
    fireEvent.click((await screen.findAllByRole("button", { name: /Save setup & return to management/ }))[0]);
    expect(await screen.findByText("Next action")).toBeInTheDocument();
    expect(calls.filter((c) => c.table === "club_champs" && c.op === "insert")).toHaveLength(1);
    expect(calls.some((c) => c.table === "club_champs" && c.op === "update")).toBe(true);
    expect(screen.getByText("Finalise entries").closest("li")).toHaveAttribute("aria-current", "step");
  });
});

import { isOutstanding, regLabel, paymentWarning } from "@/lib/smart-builder/step-handover";
describe("Step-by-Step payment status semantics", () => {
  it("account-charged entries are satisfied but never called paid; unpaid stays outstanding", () => {
    expect(isOutstanding("on_account", true)).toBe(false);
    expect(regLabel("on_account", true, true)).toBe("Entered · Charged to member account");
    expect(isOutstanding("paid", true)).toBe(false);
    expect(regLabel("paid", true)).toBe("Entered · Paid");
    expect(isOutstanding("pending_payment", true)).toBe(true);
    const rows = [
      { memberId: "a", name: "A", partnerName: null, status: "on_account", owesCents: 0 },
      { memberId: "b", name: "B", partnerName: null, status: "pending_payment", owesCents: 10000 },
    ];
    expect(paymentWarning(rows, true)).toBe("1 payment outstanding (R100)");
  });
});
