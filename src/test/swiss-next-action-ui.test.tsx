import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepSwissRoundsPanel } from "@/components/smart-builder/StepSwissRoundsPanel";
import type { StageStatus } from "@/lib/tournaments/progression";

const mocks = vi.hoisted(() => ({ data: {} as any, generate: vi.fn(), shorten: vi.fn(), notice: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: mocks.data, refetch: vi.fn() }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/tournaments/swiss-generate", () => ({ generateNextSwissRound: mocks.generate }));
vi.mock("@/lib/tournaments/swiss-shorten", () => ({ shortenSwissStage: mocks.shorten }));
vi.mock("@/lib/smart-builder/session-slots", () => ({ applySetupSessions: vi.fn() }));
vi.mock("@/components/smart-builder/DrawNoticeDialog", () => ({ DrawNoticeDialog: ({ scope }: any) => { mocks.notice(scope); return <div role="dialog">Round {scope.round} notice preview</div>; } }));

const stage: StageStatus = { divisionKey: "A", divisionLabel: "Men's A", stageKey: "qf", afterStageKey: "s", name: "Quarterfinal", state: "needs_setup", automatic: false, detail: "Set up Quarterfinal to continue.", played: 0, total: 0 };
const matches = (group: number, rounds: number, open = false) => Array.from({ length: rounds }, (_, i) => ({ id: `${group}-${i}`, group_number: group, stage_key: "s", round_number: i + 1, player_a_member_id: "a", player_b_member_id: "b", status: open && i === rounds - 1 ? "scheduled" : "completed", winner_member_id: open && i === rounds - 1 ? null : "a", score: "2-0" }));
function mount(status: StageStatus = stage) {
  const open = vi.fn();
  render(<MemoryRouter><StepSwissRoundsPanel clubId="club" tournamentId="t" onSetupRound={vi.fn()} stageStates={[status]} onOpenStage={open} /></MemoryRouter>);
  return open;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.data = { name: "Champs", bl: { draw_notices: { "1:r5": { at: "2026-10-10T10:00:00Z", sent: 16 } } }, plan: [], spec: { divisions: [
    { divisionId: "A", label: "Men's A", stages: [{ id: "s", kind: "swiss", swissRounds: 5, order: 0 }], deferredStages: [{ stageKey: "qf", name: "Quarterfinal" }] },
    { divisionId: "B", label: "Men's B", stages: [{ id: "s", kind: "swiss", swissRounds: 6, order: 0 }] },
  ] }, matches: [...matches(1, 5), ...matches(2, 2, true)] };
});
afterEach(cleanup);

describe("completed Swiss next-action presentation", () => {
  it.each(["needs_setup", "ready"] as const)("opens existing %s flow only; never creates fixtures or sends", (state) => {
    const open = mount({ ...stage, state });
    expect(screen.getByText("Swiss qualification completed · 5 of 5 rounds")).toBeInTheDocument();
    expect(screen.getByText("Next stage: Quarterfinals")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate Quarterfinal Draw" }));
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ stageKey: "qf", state }));
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.shorten).not.toHaveBeenCalled();
    expect(mocks.notice).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "View Swiss standings" })).toHaveAttribute("href", "/club-champs/t");
  });
  it.each(["blocked", "active", "waiting", "completed"] as const)("does not offer generation when next stage is %s", (state) => {
    mount({ ...stage, state });
    expect(screen.queryByRole("button", { name: "Generate Quarterfinal Draw" })).not.toBeInTheDocument();
    expect(screen.getByText(stage.detail)).toBeInTheDocument();
  });
  it("keeps completed-round resend and history collapsed, without touching ongoing category actions", () => {
    mount();
    const row = screen.getByTestId("swiss-row-A");
    const details = row.querySelector("details");
    expect(details).not.toHaveAttribute("open");
    expect(within(row).getByText(/16 deliveries/)).toBeInTheDocument();
    fireEvent.click(within(row).getByText("Previous round notifications"));
    fireEvent.click(within(row).getByRole("button", { name: "Resend Round 5 draw" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Round 5 notice preview");
    const ongoing = screen.getByTestId("swiss-row-B");
    expect(ongoing.querySelector("details")).toBeNull();
    expect(within(ongoing).getByRole("button", { name: "Send Round 2 draw to players" })).toBeInTheDocument();
    expect(within(ongoing).queryByText(/Generate .*Draw/)).not.toBeInTheDocument();
  });
});