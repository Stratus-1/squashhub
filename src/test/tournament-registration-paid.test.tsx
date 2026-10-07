import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TournamentRegistrationsDialog } from "@/components/club-admin/TournamentRegistrationsDialog";

const state = vi.hoisted(() => ({ regs: [] as any[], writes: [] as any[], fail: false }));
vi.mock("@/hooks/use-club", () => ({ useClubMembers: () => ({ data: [] }) }));
vi.mock("@/lib/supabase-ext", () => ({
  rpcExt: async () => ({ data: [], error: null }),
  fromExt: (table: string) => {
    let payload: any;
    const filters: any[] = [];
    const result = () => payload
      ? { data: { id: "reg" }, error: state.fail ? new Error("Permission denied") : null }
      : { data: table === "club_champs_registrations" ? state.regs : [], error: null };
    const chain: any = {
      select: () => chain, order: () => chain,
      eq: (key: string, value: any) => { filters.push([key, value]); return chain; },
      update: (value: any) => { payload = value; state.writes.push({ table, payload, filters }); return chain; },
      single: async () => result(),
      then: (resolve: any) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const champ = { id: "champ", name: "Test Championship", entry_fee_cents: 10000, payment_required: true };
function mount(overrides = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><TournamentRegistrationsDialog open onOpenChange={vi.fn()} champ={{ ...champ, ...overrides }} clubId="club" /></QueryClientProvider>);
}
function registration(extra = {}) {
  return { id: "reg", champ_id: "champ", club_member_id: "member", member: { name: "Test Player" }, status: "registered", registration_status: "registered", fee_status: "due", division_choices: [1, 2], ...extra };
}
beforeEach(() => { cleanup(); state.regs = []; state.writes = []; state.fail = false; });

describe("Tournament admin Paid action", () => {
  it("offers Paid on organiser-registered fee-due entries, not only pending EFT", async () => {
    state.regs = [registration()]; mount();
    expect(await screen.findByRole("button", { name: "Mark Test Player paid" })).toHaveTextContent("Paid");
    expect(screen.getByText("Paid 0")).toBeInTheDocument();
  });
  it("records admin confirmation and settles the existing linked fee first", async () => {
    state.regs = [registration({ fee_payment_id: "fee" })]; mount();
    fireEvent.click(await screen.findByRole("button", { name: "Mark Test Player paid" }));
    await waitFor(() => expect(state.writes).toHaveLength(2));
    expect(state.writes[0]).toMatchObject({ table: "club_member_fee_payments", payload: { paid: true } });
    expect(state.writes[1]).toMatchObject({ table: "club_champs_registrations", payload: { status: "paid", fee_paid_cents: 20000 } });
    expect(state.writes[1].payload.payment_ref).toMatch(/^ADMIN-/);
    expect(state.writes[1].filters).toContainEqual(["champ_id", "champ"]);
  });
  it("shows account charges separately from paid online entries", async () => {
    state.regs = [registration({ fee_status: "on_account", fee_settled_via: "account" }), registration({ id: "online", member: { name: "Online Player" }, status: "paid", fee_status: "paid" })]; mount();
    expect(await screen.findByText("Member account 1")).toBeInTheDocument();
    expect(screen.getByText("Paid 1")).toBeInTheDocument();
    expect(screen.getByText(/Charged to member account/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Online Player paid" })).not.toBeInTheDocument();
  });
  it.each(["paid", "waived", "not_required"])("does not offer another payment for %s fees", async (fee_status) => {
    state.regs = [registration({ fee_status })]; mount();
    await screen.findByText("Test Player");
    expect(screen.queryByRole("button", { name: "Mark Test Player paid" })).not.toBeInTheDocument();
  });
  it("does not offer payment on withdrawn entries or free tournaments", async () => {
    state.regs = [registration({ status: "cancelled", registration_status: "declined" })]; mount();
    fireEvent.click(await screen.findByText("Show cancelled 1"));
    expect(screen.queryByRole("button", { name: "Mark Test Player paid" })).not.toBeInTheDocument();
    cleanup(); state.regs = [registration()]; mount({ entry_fee_cents: 0 });
    await screen.findByText("Test Player");
    expect(screen.queryByRole("button", { name: "Mark Test Player paid" })).not.toBeInTheDocument();
  });
  it("shows a permission failure instead of claiming a successful payment", async () => {
    const { toast } = await import("sonner"); vi.mocked(toast.success).mockClear();
    state.regs = [registration()]; state.fail = true; mount();
    fireEvent.click(await screen.findByRole("button", { name: "Mark Test Player paid" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Permission denied"));
    expect(toast.success).not.toHaveBeenCalled();
  });
});