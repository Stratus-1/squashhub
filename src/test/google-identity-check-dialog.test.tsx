import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

/**
 * A Google sign-in that could belong to somebody else must stop and ask, and
 * the answer must decide what happens next: stay, switch Google account, or
 * start a membership application. The member list is only ever read masked.
 */
const h = vi.hoisted(() => ({
  user: {
    id: "u-1",
    email: "someone.else@gmail.com",
    app_metadata: { provider: "google" },
    user_metadata: { full_name: "Taylor Gower" },
  },
  rpc: vi.fn() as any,
  navigate: vi.fn(),
  signOut: vi.fn(),
  linked: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: h.signOut } },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock("@/contexts/ClubContext", () => ({
  useClubContext: () => ({
    club: { id: "club-1", name: "Nelspruit Squash Club" },
    subdomain: "nelspruit",
  }),
}));
vi.mock("@/hooks/use-club", () => ({
  useMyClub: () => ({
    data: h.linked ? { membership: { club_id: "club-1", role: "member" } } : null,
    isPending: false,
  }),
}));
vi.mock("@/lib/supabase-ext", () => ({ rpcExt: (name: string, args: any) => h.rpc(name, args) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => h.navigate }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

import { GoogleIdentityCheck } from "@/components/GoogleIdentityCheck";

beforeEach(() => {
  h.linked = false;
  h.rpc.mockResolvedValue({
    data: [{ match_kind: "name", masked_name: "Taylor G." }],
    error: null,
  });
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("Google sign-in identity confirmation", () => {
  it("1. asks whether the matching member is really this person", async () => {
    render(<GoogleIdentityCheck />);
    await waitFor(() => expect(screen.getByText("Wait — is this you?")).toBeInTheDocument());
    expect(screen.getByText(/Taylor G\./)).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith("check_member_duplicate_hint", {
      _club_id: "club-1",
      _name: "Taylor Gower",
      _email: "someone.else@gmail.com",
    });
  });

  it("2. 'that's not me' offers the other Google account", async () => {
    render(<GoogleIdentityCheck />);
    await waitFor(() => expect(screen.getByText("Wait — is this you?")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "No, that's not me" }));
    await waitFor(() =>
      expect(screen.getByText("Don't you have another Google account?")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: "Use a different Google account" }));
    await waitFor(() => expect(h.signOut).toHaveBeenCalled());
    expect(h.navigate).toHaveBeenCalledWith("/auth", { replace: true });
  });

  it("3. nobody on the member list is asked whether this is a new application", async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    render(<GoogleIdentityCheck />);
    await waitFor(() =>
      expect(screen.getByText("Is this a new membership application?")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes, apply for membership" }));
    expect(sessionStorage.getItem("sh.open_membership_wizard")).toBe("1");
    expect(h.navigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("4. a member who already owns this login is never asked", async () => {
    h.linked = true;
    render(<GoogleIdentityCheck />);
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(screen.queryByText("Wait — is this you?")).not.toBeInTheDocument();
    expect(screen.queryByText("Is this a new membership application?")).not.toBeInTheDocument();
  });

  it("5. an email/password sign-in is never asked", async () => {
    h.user = { ...h.user, app_metadata: { provider: "email" } };
    render(<GoogleIdentityCheck />);
    await new Promise((r) => setTimeout(r, 50));
    expect(h.rpc).not.toHaveBeenCalled();
    expect(screen.queryByText("Wait — is this you?")).not.toBeInTheDocument();
    h.user = { ...h.user, app_metadata: { provider: "google" } };
  });
});
