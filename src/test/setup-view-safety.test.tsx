import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const writes = vi.hoisted(() => vi.fn());
function chain(table: string): any {
  const result = table === "tournaments" ? { data: { beta_lifecycle: { stage: "run", answers: null }, ladder_affects: false }, error: null }
    : table === "club_champs" ? { data: { name: "Saved tournament", start_date: "2026-10-21" }, error: null }
    : { data: [], error: null };
  const proxy: any = new Proxy(() => {}, { get: (_, key) => key === "then" ? (resolve: any) => Promise.resolve(result).then(resolve)
    : (...args: any[]) => { if (["insert", "update", "delete", "upsert"].includes(String(key))) writes(table, key, args); return proxy; } });
  return proxy;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: chain, rpc: writes } }));
vi.mock("@/hooks/use-tournament-eligibility", () => ({ useOrgHierarchyLite: () => ({ data: null, isLoading: false }) }));
vi.mock("@/hooks/use-association-tenant", () => ({ useAssociationTenant: () => ({ isAssociation: false, orgId: null }) }));
import { StepByStepBuilder } from "@/components/smart-builder/StepByStepBuilder";

describe("Existing setup hydration is read-only", () => {
  it("does not publish a stale local plan when the saved answers are absent", async () => {
    localStorage.setItem("sh.stepbuilder.t.synthetic", JSON.stringify({ createdTournamentId: "synthetic", name: "Stale device", categories: ["Test"], format: { kind: "swiss", swissRounds: "5" }, stages: [] }));
    const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><StepByStepBuilder clubId="synthetic-club" tournamentId="synthetic" /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(view.getByRole("button", { name: "Save setup draft" })).not.toBeDisabled());
    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(writes).not.toHaveBeenCalled();
  });
});