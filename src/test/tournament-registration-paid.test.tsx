import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TournamentRegistrationsDialog } from "@/components/club-admin/TournamentRegistrationsDialog";

const state = vi.hoisted(() => ({ regs: [] as any[], writes: [] as any[], fail: false, emptyUpdate: false, savedPaid: false, canChange: true }));
vi.mock("@/hooks/use-financial-access", () => ({ useFinancialAccess: () => ({ canChange: state.canChange }) }));
vi.mock("@/hooks/use-club", () => ({ useClubMembers: () => ({ data: [] }) }));
vi.mock("@/lib/supabase-ext", () => ({
  rpcExt: async (name: string, args: any) => {
    if (name !== "champ_admin_confirm_paid") return { data: [], error: null };
    state.writes.push({ rpc: name, args });
    return { data: state.emptyUpdate ? null : { ok: true, id: "reg", already_settled: state.savedPaid }, error: state.fail ? new Error("Permission denied") : null };
  },
  fromExt: (table: string) => {
    let payload: any;
    let selected = "";
    const filters: any[] = [];
    const result = () => payload
      ? { data: state.emptyUpdate ? [] : [{ id: "reg" }], error: state.fail ? new Error("Permission denied") : null }
      : { data: table === "club_champs_registrations" ? (selected === "id, status, fee_status" ?
          [{ id: "reg", status: state.savedPaid ? "paid" : "registered", fee_status: state.savedPaid ? "paid" : "due" }] : state.regs) : [], error: null };
    const chain: any = {
      select: (columns: string) => { selected = columns; return chain; }, order: () => chain,
      eq: (key: string, value: any) => { filters.push([key, value]); return chain; },
      update: (value: any) => { payload = value; state.writes.push({ table, payload, filters }); return chain; },
      single: async () => payload ? { data: null, error: new Error("Cannot coerce the result to a single JSON object") } : result(),
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
beforeEach(() => { cleanup(); vi.clearAllMocks(); state.regs = []; state.writes = []; state.fail = false; state.emptyUpdate = false; state.savedPaid = false; state.canChange = true; });

describe("Tournament admin Paid action", () => {
  it("prevents Chairman from recording a tournament payment", async () => {
    state.regs = [registration()]; state.canChange = false; mount();
    fireEvent.click(await screen.findByRole("button", { name: "Mark Test Player paid" }));
    expect(state.writes).toHaveLength(0);
  });
  it("offers Paid on organiser-registered fee-due entries, not only pending EFT", async () => {
    state.regs = [registration()]; mount();
    expect(await screen.findByRole("button", { name: "Mark Test Player paid" })).toHaveTextContent("Paid");
    expect(screen.getByText("Paid 0")).toBeInTheDocument();
  });
  it("confirms the existing fee atomically through the club-scoped payment action", async () => {
    state.regs = [registration({ fee_payment_id: "fee" })]; mount();
    fireEvent.click(await screen.findByRole("button", { name: "Mark Test Player paid" }));
    await waitFor(() => expect(state.writes).toHaveLength(1));
    expect(state.writes[0]).toEqual({ rpc: "champ_admin_confirm_paid", args: { p_club_id: "club", p_champ_id: "champ", p_registration_id: "reg" } });
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
    await screen.findAllByText("Test Player");
    expect(screen.queryByRole("button", { name: "Mark Test Player paid" })).not.toBeInTheDocument();
  });
  it("does not offer payment on withdrawn entries or free tournaments", async () => {
    state.regs = [registration({ status: "cancelled", registration_status: "declined" })]; mount();
    fireEvent.click(await screen.findByText("Show cancelled 1"));
    expect(screen.queryByRole("button", { name: "Mark Test Player paid" })).not.toBeInTheDocument();
    cleanup(); state.regs = [registration()]; mount({ entry_fee_cents: 0 });
    await screen.findAllByText("Test Player");
    expect(screen.queryByRole("button", { name: "Mark Test Player paid" })).not.toBeInTheDocument();
  });
  it("shows a permission failure instead of claiming a successful payment", async () => {
    const { toast } = await import("sonner"); vi.mocked(toast.success).mockClear();
    state.regs = [registration()]; state.fail = true; mount();
    fireEvent.click(await screen.findByRole("button", { name: "Mark Test Player paid" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Permission denied"));
    expect(toast.success).not.toHaveBeenCalled();
  });
  it("records Paid only after the server confirms the registration", async () => {
    const { toast } = await import("sonner");
    state.regs = [registration()]; mount();
    fireEvent.click(await screen.findByRole("button", { name: "Mark Test Player paid" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Marked as paid"));
    expect(toast.error).not.toHaveBeenCalled();
  });
  it("accepts an idempotent already-settled confirmation", async () => {
    const { toast } = await import("sonner");
    state.regs = [registration({ fee_payment_id: "fee" })]; state.savedPaid = true; mount();
    fireEvent.click(await screen.findByRole("button", { name: "Mark Test Player paid" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Marked as paid"));
  });
  it("never claims Paid when an empty update leaves the saved fee due", async () => {
    const { toast } = await import("sonner");
    state.regs = [registration()]; state.emptyUpdate = true; mount();
    fireEvent.click(await screen.findByRole("button", { name: "Mark Test Player paid" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Payment was not confirmed")));
    expect(toast.success).not.toHaveBeenCalled();
  });
});