import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const spies = vi.hoisted(() => ({ commit: vi.fn(), auto: vi.fn(), schedule: vi.fn(), notify: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/tournaments/structured-db", () => ({ commitStructured: spies.commit, supabaseDb: { select: spies.read } }));
vi.mock("@/lib/tournaments/progression", async (load) => ({ ...await load<Record<string, unknown>>(), autoProgress: spies.auto,
  stageLifecycle: async () => [{ divisionKey: "d", divisionLabel: "Test", stageKey: "next", name: "Final", state: "ready", automatic: true, detail: "Ready", total: 0, played: 0 }] }));
vi.mock("@/lib/smart-builder/playoff-schedule", async (load) => ({ ...await load<Record<string, unknown>>(), schedulePlannedPlayoffGames: spies.schedule }));
vi.mock("@/lib/tournaments/round-notify", async (load) => ({ ...await load<Record<string, unknown>>(), notifyRoundDraw: spies.notify }));
import { StageProgressPanel } from "@/components/smart-builder/StageProgressPanel";

describe("Tournament viewing is not a progression command", () => {
  it("automatic-ready stages never commit, schedule or notify on mount, rerender or remount", async () => {
    spies.read.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spec = { divisions: [{ divisionId: "d", label: "Test", entrants: [], stages: [{ id: "first", order: 0, kind: "round_robin" }, { id: "next", order: 1, kind: "knockout" }] }] } as any;
    const node = <QueryClientProvider client={client}><StageProgressPanel champId="synthetic" spec={spec} matches={[]} nameOf={() => "Player"} /></QueryClientProvider>;
    const view = render(node);
    await waitFor(() => expect(view.getByText("Generate Final")).toBeTruthy());
    view.rerender(node);
    await client.invalidateQueries();
    view.unmount();
    render(node);
    expect(spies.commit).not.toHaveBeenCalled();
    expect(spies.auto).not.toHaveBeenCalled();
    expect(spies.schedule).not.toHaveBeenCalled();
    expect(spies.notify).not.toHaveBeenCalled();
  });
});