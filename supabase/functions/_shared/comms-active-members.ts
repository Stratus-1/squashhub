/** All-members audiences fail closed on membership status. Warnings are not suspensions. */
export function isActiveCommsMember(member: {
  status?: string | null;
  suspension_status?: string | null;
} | null | undefined): boolean {
  return member?.status === "active" &&
    (member.suspension_status === "active" || member.suspension_status === "warning");
}

/** Nomination audiences exclude visitor records even if they have active status. */
export function isEligibleNominationMember(member: {
  role?: string | null;
  status?: string | null;
  suspension_status?: string | null;
} | null | undefined): boolean {
  return isActiveCommsMember(member) &&
    (member?.role === "member" || member?.role === "admin" || member?.role === "captain");
}