import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const opts = { ok: true, enabled: true, partner_name: "Tasha Hill", partner_owes: true, me_owes: false, fee_cents: 10000, account_allowed: true };
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => ({ data: (globalThis as any).__opts, error: null })) } }));
import { PartnerFeeOptions } from "@/components/tournaments/PartnerFeeOptions";

const mount = (o: object, cardEnabled = true) => {
  (globalThis as any).__opts = o;
  return render(<QueryClientProvider client={new QueryClient()}><PartnerFeeOptions registrationId="r1" cardEnabled={cardEnabled} onPay={() => {}} /></QueryClientProvider>);
};

describe("partner fee payment methods", () => {
  it("own fee settled → partner fee offers card AND add-to-my-account, never 'both'", async () => {
    mount(opts);
    await waitFor(() => expect(screen.getByText(/Pay Tasha Hill's fee by card/)).toBeTruthy());
    expect(screen.getByText(/Add Tasha Hill's R100 to my account/)).toBeTruthy();
    expect(screen.queryByText(/both fees/)).toBeNull();
  });
  it("account offered even when card checkout is unavailable", async () => {
    mount(opts, false);
    await waitFor(() => expect(screen.getByText(/Add Tasha Hill's R100 to my account/)).toBeTruthy());
    expect(screen.queryByText(/by card/)).toBeNull();
  });
  it("partner already settled → no payment buttons", async () => {
    mount({ ...opts, partner_owes: false, partner_settled_via: "account" });
    await waitFor(() => expect(screen.getByTestId("partner-fee-settled")).toBeTruthy());
    expect(screen.queryByText(/to my account/)).toBeNull();
  });
});
