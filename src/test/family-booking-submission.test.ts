import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateBooking } from "@/hooks/use-data";

const mocks = vi.hoisted(() => ({ adjacent: [] as Record<string, unknown>[], upsert: vi.fn(), update: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({user:{id:"parent-login"}}) }));
vi.mock("@/contexts/MemberContext", () => ({useMemberContext: () => ({})}));
vi.mock("@/contexts/ClubContext", () => ({useClubContext: () => ({})}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(), useQueryClient: () => ({invalidateQueries:mocks.invalidate}),
  useMutation: (options: {mutationFn: unknown}) => ({mutateAsync:options.mutationFn}),
}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {
  rpc: vi.fn(), from: () => {
    const chain = {
      select: () => chain, eq: () => chain,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({data:mocks.adjacent,error:null}).then(resolve),
      upsert: (data: unknown) => { mocks.upsert(data); return {select: () => ({single: async () => ({data,error:null})})}; },
      update: (data: unknown) => { mocks.update(data); return {eq: () => ({select: () => ({single: async () => ({data,error:null})})})}; },
    };
    return chain;
  },
}}));

describe("family booking submission", () => {
  const request = {bookingId:"new-booking",courtId:1,date:"2026-11-01",startTime:"10:45:00",endTime:"11:30:00",clubMemberId:"child-member"};
  beforeEach(() => {mocks.adjacent=[];mocks.upsert.mockClear();mocks.update.mockClear();});
  it("keeps the signed-in parent as booker and child as playing member", async () => {
    const result = await useCreateBooking().mutateAsync(request);
    expect(result).toMatchObject({user_id:"parent-login",club_member_id:"child-member"});
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({user_id:"parent-login",club_member_id:"child-member"}));
  });
  it("cannot merge into a sibling's adjacent booking", async () => {
    mocks.adjacent=[{id:"sibling-booking",club_member_id:"sibling-member",start_time:"10:00:00",end_time:"10:45:00"}];
    await useCreateBooking().mutateAsync(request);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it("can still extend the same child's adjacent booking", async () => {
    mocks.adjacent=[{id:"child-booking",club_member_id:"child-member",start_time:"10:00:00",end_time:"10:45:00"}];
    await useCreateBooking().mutateAsync(request);
    expect(mocks.update).toHaveBeenCalledWith({start_time:"10:00:00",end_time:"11:30:00"});
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});