/** Display metadata only: never use an organiser choice to grant permission. */
export type TournamentOrganiser = { memberId: string; name: string };
export type OrganiserMember = { id: string; name: string; club_id: string };
export type OrganiserPermission = { club_member_id: string; custom_permissions?: string[]; club_permission_roles?: { club_id: string; role_name: string; permissions: string[] } | null };

export function suggestedOrganiser(clubId: string, members: OrganiserMember[], permissions: OrganiserPermission[]): TournamentOrganiser | undefined {
  const local = new Map(members.filter((m) => m.club_id === clubId).map((m) => [m.id, m]));
  const candidates = permissions.filter((p) => local.has(p.club_member_id) && (
    p.custom_permissions?.includes("champs") ||
    (p.club_permission_roles?.club_id === clubId && p.club_permission_roles.permissions.includes("champs"))
  ));
  const leads = candidates.filter((p) => p.club_permission_roles?.club_id === clubId && /tournament|championship/i.test(p.club_permission_roles.role_name));
  const ids = [...new Set((leads.length ? leads : candidates).map((p) => p.club_member_id))];
  const member = ids.length === 1 ? local.get(ids[0]) : undefined;
  return member ? { memberId: member.id, name: member.name } : undefined;
}

/** null is a deliberate clearing; undefined is an untouched new draft only. */
export function defaultOrganiser(current: TournamentOrganiser | null | undefined, suggested: TournamentOrganiser | undefined, isExisting: boolean) {
  return current === undefined && !isExisting ? suggested : current;
}