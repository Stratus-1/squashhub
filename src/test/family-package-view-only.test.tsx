import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const access = vi.hoisted(() => ({ canChange: false }));
const writes = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-financial-access", () => ({ useFinancialAccess: () => access }));
vi.mock("@/hooks/use-currency", () => ({ useClubCurrency: () => ({ format: (amount: number) => `R${amount}` }) }));
vi.mock("@/lib/supabase-ext", () => ({ fromExt: () => {
  const result = { data: [], error: null };
  const query: any = {
    select: () => query, eq: () => query, order: () => Promise.resolve(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    update: writes,
  };
  return query;
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: writes } }));
import { FamilyPackageCard } from "@/components/club-admin/FamilyPackageCard";

function showCard() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FamilyPackageCard clubId="synthetic-club" /></QueryClientProvider>);
}

beforeEach(() => { access.canChange = false; writes.mockClear(); });
describe("Chairman Family package view-only access", () => {
  it("allows viewing without permitting family configuration writes", async () => {
    const view = showCard();
    await waitFor(() => expect(view.getAllByRole("combobox")).toHaveLength(2));
    for (const control of [...view.getAllByRole("combobox"), ...view.getAllByRole("spinbutton"), ...view.getAllByRole("checkbox")]) expect(control).toBeDisabled();
    const save = view.getByRole("button", { name: "Save family settings" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(writes).not.toHaveBeenCalled();
  });
  it("retains configuration editing for financial editors", () => {
    access.canChange = true;
    const view = showCard();
    for (const control of [...view.getAllByRole("combobox"), ...view.getAllByRole("spinbutton"), ...view.getAllByRole("checkbox")]) expect(control).not.toBeDisabled();
  });
});