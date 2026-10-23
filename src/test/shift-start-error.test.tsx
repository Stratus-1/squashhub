import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShiftStartDialog } from "@/components/bar/ShiftStartDialog";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
beforeEach(() => { cleanup(); vi.clearAllMocks(); });
describe("shift start failure", () => {
  it("preserves the server's attendance refusal and does not mark a rejected shift as started", async () => {
    const refusal = "This person already has an open shift; end or correct it first";
    mocks.rpc.mockResolvedValue({ error: { message: refusal, code: "P0001" }, data: null });
    const started = vi.fn();
    render(<ShiftStartDialog token="fictional-session" status={{ club_id: "fictional-club", opening: "16:00:00", attendance: null, shift: { id: "shared", kind: "normal", split_tips: false } }} onStarted={started} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Start working" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(refusal));
    expect(started).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("bar_counter_start_shift", { _token: "fictional-session", _kind: "normal", _start: null, _split: false });
  });
});