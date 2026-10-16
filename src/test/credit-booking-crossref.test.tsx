import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DefaultCreditNote, MinBookingBalanceNote } from "@/components/club-admin/CreditBookingCrossRef";

const m = vi.hoisted(() => ({ min: 150 as number | null, credit: 425 }));
vi.mock("@/lib/supabase-ext", () => ({
  fromExt: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { min_booking_balance: m.min }, error: null }) }) }) }),
}));
vi.mock("@/hooks/use-member-credit", () => ({
  useMemberCredit: () => ({ data: { default_amount: m.credit, override_amount: null, credit_allowed: m.credit, can_edit: true }, isLoading: false }),
}));
const wrap = (ui: JSX.Element) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("credit / minimum balance cross-references", () => {
  it("shows the club's actual minimum balance", async () => {
    wrap(<MinBookingBalanceNote clubId="c" />);
    expect(await screen.findByText(/required for court bookings: R150.00/)).toBeInTheDocument();
  });
  it("handles a disabled minimum", async () => {
    m.min = null;
    wrap(<MinBookingBalanceNote clubId="c" />);
    expect(await screen.findByText(/not set/)).toBeInTheDocument();
  });
  it("shows the club's actual default credit", () => {
    wrap(<DefaultCreditNote clubId="c" />);
    expect(screen.getByText(/Default member credit allowance: R425.00/)).toBeInTheDocument();
  });
});
