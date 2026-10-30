/** All-members audiences fail closed on membership status. Warnings are not suspensions. */
export function isActiveCommsMember(member: {
  status?: string | null;
  suspension_status?: string | null;
} | null | undefined): boolean {
  return member?.status === "active" &&
    (member.suspension_status === "active" || member.suspension_status === "warning");
}