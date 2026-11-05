import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, openCheckout } = vi.hoisted(() => ({ invoke: vi.fn(), openCheckout: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("@/lib/yoco-native-checkout", () => ({
  buildYocoReturnUrl: () => "/my-account", openYocoCheckout: openCheckout,
  rememberPendingYocoSession: vi.fn(), getPendingYocoSession: vi.fn(), clearPendingYocoSession: vi.fn(),
}));
vi.mock("@/lib/stitch-checkout", () => ({
  buildStitchReturnUrl: () => "/my-account", openStitchCheckout: openCheckout,
  closeStitchPaymentWindow: vi.fn(), rememberPendingStitchSession: vi.fn(),
  getPendingStitchSession: vi.fn(), clearPendingStitchSession: vi.fn(),
}));
import { startClubCheckout, type GatewayId } from "@/lib/club-payments";

const opts = { clubId: "club", clubMemberId: "member", amount: 75, purpose: "topup" as const, returnPath: "/my-account" };
describe("once-off checkout auth error handling", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each<GatewayId>(["stitch", "yoco", "paynow", "payfast"])("stops %s checkout for rejected sign-in without opening payment", async gateway => {
    invoke.mockResolvedValue({ data: { error: "Unauthorized" }, error: null });
    await expect(startClubCheckout(gateway, opts)).rejects.toBeInstanceOf(Error);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(openCheckout).not.toHaveBeenCalled();
  });
  it("keeps ownership rejection distinct from missing sign-in", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "Member not found or not yours", context: new Response(null, { status: 403 }) } });
    await expect(startClubCheckout("stitch", opts)).rejects.toThrow("Member not found or not yours");
    expect(openCheckout).not.toHaveBeenCalled();
  });
  it("stops HTTP 401 without retrying a payment request", async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(null, { status: 401 }) } });
    await expect(startClubCheckout("stitch", opts)).rejects.toBeInstanceOf(Error);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(openCheckout).not.toHaveBeenCalled();
  });
});