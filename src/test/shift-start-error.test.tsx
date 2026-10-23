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
    expect(mocks.rpc).toHaveBeenCalledWith("bar_counter_start_shift_with_tips", { _token: "fictional-session", _kind: "normal", _start: null, _tip_mode: "own" });
  });
});

describe("special shift tip choices", () => {
  it.each(["own", "hours", "equal"] as const)("starts a special shift with %s tip attribution", async mode => {
    mocks.rpc.mockResolvedValue({ error: null });
    const started = vi.fn();
    render(<ShiftStartDialog token="fictional-session" status={{ club_id: "fictional-club", opening: "16:00:00", attendance: null, shift: null }} onStarted={started} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Special shift" }));
    fireEvent.change(screen.getByLabelText("Paid start time"), { target: { value: "12:00" } });
    if (mode !== "own") fireEvent.click(screen.getByRole("radio", { name: mode === "hours" ? "Split according to hours worked" : "Split equally between staff" }));
    fireEvent.click(screen.getByRole("button", { name: "Start working" }));
    await waitFor(() => expect(started).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledWith("bar_counter_start_shift_with_tips", expect.objectContaining({ _kind: "special", _tip_mode: mode }));
  });
  it("joins an equal-sharing shift without changing its tip policy", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    render(<ShiftStartDialog token="fictional-session" status={{ club_id: "fictional-club", opening: "16:00:00", attendance: null, shift: { id: "shared", kind: "special", split_tips: true, tip_sharing_mode: "equal" } }} onStarted={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Each person keeps their own tips" }));
    fireEvent.change(screen.getByLabelText("Paid start time"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Start working" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("bar_counter_start_shift_with_tips", expect.objectContaining({ _tip_mode: "equal" })));
  });
});