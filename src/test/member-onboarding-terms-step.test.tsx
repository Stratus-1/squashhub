import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * A Google sign-in reaches the onboarding wizard without ever seeing the
 * registration form, so the account carries no record of agreeing to the terms.
 * The wizard must then show the tick and hold the applicant on that step until
 * they accept, and must write the acceptance onto the account. An account that
 * already accepted must not be asked again.
 *
 * Synthetic applicant only: no club, member or auth row is touched.
 */
const H = vi.hoisted(() => {
  const CLUB_ID = "synthetic-club";
  const USER_ID = "11111111-1111-4111-8111-111111111111";
  const ROW_ID = "22222222-2222-4222-8222-222222222222";
  const state = {
    metadata: {} as Record<string, unknown>,
    updateData: null as Record<string, unknown> | null,
  };
  const applicant = () => ({
    id: ROW_ID,
    user_id: USER_ID,
    club_id: CLUB_ID,
    name: "Google Applicant",
    email: "google.applicant@example.com",
    role: "member",
    applied_at: new Date().toISOString(),
    joined_at: new Date().toISOString(),
    is_pending_approval: true,
    fee_category_id: null,
    billing_exempt: false,
  });
  const chain = (table: string): any => {
    const proxy: any = new Proxy(function () {}, {
      get(_t, key: string) {
        if (key === "then") {
          return (res: any) =>
            Promise.resolve(
              table === "club_member_fee_payments"
                ? { data: null, count: 0, error: null }
                : { data: [], error: null }
            ).then(res);
        }
        if (key === "maybeSingle" || key === "single") {
          return async () => ({ data: table === "club_members" ? applicant() : null, error: null });
        }
        return () => proxy;
      },
    });
    return proxy;
  };
  return { CLUB_ID, USER_ID, ROW_ID, state, chain };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => H.chain(table),
    rpc: (fn: string) =>
      Promise.resolve(
        fn === "get_my_application_progress"
          ? { data: { v: 1, stepId: "terms", savedAt: new Date().toISOString(), answers: {} }, error: null }
          : { data: null, error: null }
      ),
    auth: {
      signOut: async () => ({ error: null }),
      updateUser: async ({ data }: any) => {
        H.state.updateData = data;
        return { error: null };
      },
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: H.USER_ID,
      email: "google.applicant@example.com",
      user_metadata: H.state.metadata,
      app_metadata: {},
      created_at: new Date().toISOString(),
    },
    session: null,
    loading: false,
  }),
}));

vi.mock("@/contexts/ClubContext", () => ({
  useClubContext: () => ({ club: null, clubId: null, subdomain: null, loading: false }),
}));

vi.mock("@/hooks/use-club", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useMyClub: () => ({
      data: { club: { id: H.CLUB_ID, name: "Riverside Squash Club", subdomain: "riverside" } },
      isLoading: false,
    }),
    useFeeCategories: () => ({ data: [], isLoading: false }),
    useLeagueAssociations: () => ({ data: [], isLoading: false }),
    useNationalBodyFees: () => ({ data: [], isLoading: false }),
  };
});

vi.mock("@/hooks/use-currency", () => ({
  useClubCurrency: () => ({ format: (n: number) => `R${n}`, currency: "ZAR" }),
}));
vi.mock("@/components/auth/DuplicateAccountGuard", () => ({
  useDuplicateGuard: () => ({ guard: async () => true, dialog: null }),
}));
vi.mock("@/components/LeagueParticipationPicker", () => ({
  LeagueParticipationPicker: () => null,
  applyLeagueSelections: async () => ({}),
}));
vi.mock("@/components/family/FamilyMembersStep", () => ({ FamilyMembersStep: () => null }));
vi.mock("@/hooks/use-club-rules", () => ({
  useMemberClubRules: () => ({ data: null, isLoading: false }),
  recordRuleAcceptance: async () => ({}),
}));
vi.mock("@/hooks/use-club-capabilities", () => ({ useHasCapability: () => false }));
vi.mock("@/components/ClubRulesContent", () => ({ ClubRulesContent: () => null }));

import { MemberOnboardingWizard } from "@/components/MemberOnboardingWizard";

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MemberOnboardingWizard open onComplete={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Terms & Privacy step in the member application", () => {
  beforeEach(() => {
    H.state.metadata = {};
    H.state.updateData = null;
  });

  it("asks a Google account that never ticked, holds Next, then records both stamps", async () => {
    H.state.metadata = { full_name: "Google Applicant", provider: "google" };
    renderWizard();

    await waitFor(() => expect(screen.getByText("Terms & Privacy")).toBeInTheDocument());
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /Accept Terms and Privacy Policy/i }));
    await waitFor(() => expect(next).toBeEnabled());

    fireEvent.click(next);
    await waitFor(() =>
      expect(H.state.updateData).toEqual({
        terms_accepted_at: expect.any(String),
        privacy_accepted_at: expect.any(String),
      })
    );
  });

  it("does not ask an account whose acceptance is already on record", async () => {
    H.state.metadata = {
      full_name: "Google Applicant",
      provider: "google",
      terms_accepted_at: "2026-09-30T08:00:00.000Z",
      privacy_accepted_at: "2026-09-30T08:00:00.000Z",
    };
    renderWizard();

    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.queryByText("Terms & Privacy")).toBeNull();
    expect(H.state.updateData).toBeNull();
  });
});
