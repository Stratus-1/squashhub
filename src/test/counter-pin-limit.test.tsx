import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CounterModeCard } from "@/components/bar/CounterModeCard";

const state = vi.hoisted(() => ({ count: 10, writes: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: async (name: string, args: unknown) => {
  if (name === "bar_counter_set_pin") {
    state.writes.push(args);
    state.count += 1;
    return { data: { device_id: "new" }, error: null };
  }
  return { data: Array.from({ length: state.count }, (_, i) => ({ id: `person-${i}`, label: `Person ${i}`, updated_at: "2026-10-29", unlocked: 0 })), error: null };
} } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><CounterModeCard clubId="uitsig-test" /></QueryClientProvider></MemoryRouter>);
}
beforeEach(() => { cleanup(); state.count = 10; state.writes = []; });

describe("counter PIN maximum of 20", () => {
  it.each([10, 19])("allows another named PIN with %i already active", async (count) => {
    state.count = count;
    mount();
    await screen.findByText(`Person ${count - 1}`);
    fireEvent.change(screen.getByPlaceholderText("e.g. Pete"), { target: { value: "New barman" } });
    fireEvent.change(screen.getByPlaceholderText("••••"), { target: { value: "9876" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(state.writes).toEqual([{ _club_id: "uitsig-test", _pin: "9876", _label: "New barman", _device_id: null }]));
    await screen.findByText(`Person ${count}`);
  });
  it("does not allow a 21st PIN, while retaining existing PIN reset controls", async () => {
    state.count = 20;
    mount();
    await screen.findByText("Person 19");
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New PIN" })).toHaveLength(20);
    expect(state.writes).toHaveLength(0);
  });
});