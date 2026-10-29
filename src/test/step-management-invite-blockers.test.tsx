import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Handover } from "@/lib/smart-builder/step-handover";

const mocks = vi.hoisted(() => ({ handover: null as Handover | null, edit: vi.fn(), saveLife: vi.fn(), saveHandover: vi.fn() }));
vi.mock("@/lib/smart-builder/step-handover", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/smart-builder/step-handover")>(),
  loadHandover: () => mocks.handover,
  saveHandover: mocks.saveHandover,
  saveLifecycle: mocks.saveLife,
  loadLifecycle: async () => ({ stage: mocks.handover?.stage, completed: mocks.handover?.completed }),
  loadRegistrations: async () => ({ rows: [{ id: "entry", status: "paid", memberName: "Player" }], feeCents: 0 }),
}));
vi.mock("@/lib/tournaments/diamond-guard", () => ({ isDiamondTournament: async () => false }));
vi.mock("@/components/smart-builder/StepInformPanel", () => ({ StepInformPanel: () => <div>Inform controls</div> }));
vi.mock("@/components/smart-builder/StepInvitePanel", () => ({ StepInvitePanel: () => <div>Invite controls</div> }));
vi.mock("@/components/smart-builder/StepGenerateDrawPanel", () => ({ StepGenerateDrawPanel: () => <div>Generate controls</div> }));
vi.mock("@/components/smart-builder/StepRunOverview", () => ({ StepRunOverview: () => null }));
vi.mock("@/components/smart-builder/StepSwissRoundsPanel", () => ({ StepSwissRoundsPanel: () => null }));
vi.mock("@/components/smart-builder/StepKnockoutRoundsPanel", () => ({ StepKnockoutRoundsPanel: () => null }));
vi.mock("@/components/smart-builder/StandingsAwardsSection", () => ({ StandingsAwardsSection: () => null }));
vi.mock("@/components/smart-builder/PendingDrawNoticePrompt", () => ({ PendingDrawNoticePrompt: () => null }));
vi.mock("@/components/smart-builder/PlayerNotificationsSection", () => ({ PlayerNotificationsSection: () => null }));
vi.mock("@/components/match-day/MatchDayAccessCard", () => ({ MatchDayAccessCard: () => null }));
vi.mock("@/components/club-admin/TournamentRegistrationsDialog", () => ({ TournamentRegistrationsDialog: () => null }));

import { StepTournamentManagement } from "@/components/smart-builder/StepTournamentManagement";

beforeEach(() => {
  mocks.edit.mockReset();
  mocks.saveLife.mockReset().mockResolvedValue(undefined);
  mocks.saveHandover.mockReset();
  mocks.handover = {
    tournamentId: "test-tournament", clubId: "test-club", name: "Test Champs", kind: "period",
    mode: "invite", feeDue: false, channels: [], messageTemplate: "", entrantMessages: [], invitePreview: "",
    deferred: [{ id: "eligibility", label: "Who may enter", neededAt: "invite", why: "Choose eligible players before contacting them." }],
    stage: "invite", completed: ["planning"], createdAt: "2026-10-12",
  };
});
afterEach(cleanup);
const open = () => render(<StepTournamentManagement clubId="test-club" tournamentId="test-tournament" onEditSetup={mocks.edit} onBack={vi.fn()} />);

describe("invitation blockers remain visible and actionable", () => {
  it("visits the QR page before advancing finalised entries to the draw", async () => {
    if (!mocks.handover) throw new Error("Missing fixture");
    mocks.handover.stage = "finalise";
    mocks.handover.completed = ["planning", "invite", "registrations"];
    mocks.handover.deferred = [];
    open();
    const next = await screen.findByRole("button", { name: /Continue to Tournament link/ });
    fireEvent.click(next);
    expect(mocks.saveLife).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Continue to Generate draw/ }));
    expect(mocks.saveLife).toHaveBeenCalledWith("test-tournament", expect.objectContaining({ stage: "generate", completed: ["planning", "invite", "registrations", "finalise"] }));
  });
  it.each(["invite", "inform"] as const)("explains blocked %s mode and opens setup", async (mode) => {
    if (!mocks.handover) return;
    mocks.handover.mode = mode;
    open();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Who may enter");
    expect(alert).toHaveTextContent("Choose eligible players before contacting them.");
    if (mode === "invite") expect(screen.getByRole("button", { name: /^Invite players/ })).toBeDisabled();
    expect(screen.queryByText("Inform controls")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Decide now in setup" }));
    expect(mocks.edit).toHaveBeenCalledWith(undefined);
  });

  it.each(["invite", "inform"] as const)("keeps unblocked %s controls available without the alert", async (mode) => {
    if (!mocks.handover) return;
    mocks.handover.mode = mode;
    mocks.handover.deferred[0].neededAt = "finalise";
    open();
    await screen.findByText("Next action");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    if (mode === "invite") {
      fireEvent.click(screen.getByRole("button", { name: /^Invite players/ }));
      expect(screen.getByText("Invite controls")).toBeInTheDocument();
    } else expect(await screen.findByText("Inform controls")).toBeInTheDocument();
  });

  it("does not restore the removed callout on Generate, and preserves the revisit edit warning", async () => {
    if (!mocks.handover) return;
    mocks.handover.stage = "generate";
    mocks.handover.completed = ["planning", "invite", "registrations", "finalise"];
    mocks.handover.deferred.push({ id: "dates", label: "Dates", neededAt: "generate", why: "Choose dates." });
    open();
    await screen.findByText("Generate controls");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Invite \/ Inform players/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Who may enter");
    fireEvent.click(screen.getByRole("button", { name: "Decide now in setup" }));
    expect(await screen.findByText("Players are already entered")).toBeInTheDocument();
    expect(mocks.edit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit anyway" }));
    expect(mocks.edit).toHaveBeenCalledWith(undefined);
  });
});