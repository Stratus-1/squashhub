import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({}) }));
vi.mock("@/contexts/ClubContext", () => ({ useClubContext: () => ({}) }));

import { mergeTenantClub } from "@/hooks/use-club";

describe("mergeTenantClub", () => {
  it("fills the saved 45-minute slot when the membership snapshot lacked it", () => {
    const data = { membership: null, club: { id: "u", name: "Uitsig" } as any };
    const out = mergeTenantClub(data, { id: "u", booking_slot_minutes: 45, booking_open_time: "05:15:00" });
    expect((out!.club as any).booking_slot_minutes).toBe(45);
    expect((out!.club as any).booking_open_time).toBe("05:15:00");
  });

  it("uses the live tenant club when the user has no membership there", () => {
    const out = mergeTenantClub({ membership: null, club: null as any }, { id: "u", booking_slot_minutes: 45 });
    expect((out!.club as any).booking_slot_minutes).toBe(45);
  });

  it("never mixes in another club's settings", () => {
    const data = { membership: { club_id: "csir", role: "member" }, club: { id: "csir", booking_slot_minutes: 60 } as any };
    const out = mergeTenantClub(data, { id: "u", booking_slot_minutes: 45 });
    expect((out!.club as any).booking_slot_minutes).toBe(60);
  });
});
