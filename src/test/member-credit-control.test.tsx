import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemberCreditControl } from "@/components/club-admin/MemberCreditControl";

const mocks = vi.hoisted(() => ({ data: { default_amount: 300, override_amount: null as number | null, credit_allowed: 300, can_edit: true }, save: vi.fn() }));
vi.mock("@/hooks/use-member-credit", () => ({
  useMemberCredit: () => ({ data: mocks.data, isLoading: false }),
  useSaveMemberCredit: () => ({ mutateAsync: mocks.save, isPending: false }),
}));
vi.mock("@/components/club-admin/CreditBookingCrossRef", () => ({ MinBookingBalanceNote: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("member credit settings", () => {
  beforeEach(() => { mocks.data = { default_amount: 300, override_amount: null, credit_allowed: 300, can_edit: true }; mocks.save.mockReset(); });
  it("blank inherits until R800 is explicitly entered", async () => {
    render(<MemberCreditControl clubId="club" memberId="member" />);
    const input = screen.getByLabelText("Credit allowed (R)");
    expect(input).toHaveDisplayValue("");
    expect(input).toHaveAttribute("placeholder", "300.00");
    expect(screen.getByText(/Effective credit: R300.00 · Default/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "800" } });
    fireEvent.click(screen.getByRole("button", { name: "Save credit" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(800));
  });
  it("reset saves null to restore dynamic inheritance", async () => {
    mocks.data.override_amount = 800; mocks.data.credit_allowed = 800;
    render(<MemberCreditControl clubId="club" memberId="member" />);
    fireEvent.click(screen.getByRole("button", { name: "Use club default" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(null));
  });
  it.each([true, false])("member account read-only has no editing even when finance permission=%s", can_edit => {
    mocks.data.can_edit = can_edit;
    render(<MemberCreditControl clubId="club" memberId="member" readOnly />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("unauthorized staff cannot edit", () => {
    mocks.data.can_edit = false;
    render(<MemberCreditControl clubId="club" memberId="member" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("rejects negative and fractional-cent defaults", () => {
    render(<MemberCreditControl clubId="club" />);
    const input = screen.getByLabelText("Credit allowed (R)");
    for (const value of ["-1", "1.001", ""]) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByRole("button", { name: "Save credit" })).toBeDisabled();
    }
  });
  it.each([["", null], ["0", 0]])("member value %s saves as %s", async (value, expected) => {
    render(<MemberCreditControl clubId="club" memberId="member" />);
    fireEvent.change(screen.getByLabelText("Credit allowed (R)"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save credit" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expected));
  });
});