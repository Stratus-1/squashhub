/** Broad member feature updates are for active club members, never visitors or body management. */
export function receivesMemberFeatureUpdate(member: { status?: string | null; role?: string | null; user_id?: string | null }, tenantType?: string | null): boolean {
  return !!member.user_id && member.status === "active" && member.role !== "visitor" && tenantType !== "association";
}