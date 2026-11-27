// Tournament fees are always paid to the HOST club. A player entering from
// another club must reach the host's payment gateway and be billed via their
// host-club (visitor) record, never their home club's gateway.
export async function routeTournamentToHost(
  admin: any,
  champRegistrationId: string | null | undefined,
  clubMemberId: string | null | undefined,
): Promise<{ routed: boolean; clubId?: string; clubMemberId?: string; homeUserId?: string | null; error?: string }> {
  if (!champRegistrationId || !clubMemberId) return { routed: false };
  const { data: reg } = await admin.from("club_champs_registrations")
    .select("champ_id").eq("id", champRegistrationId).maybeSingle();
  if (!reg?.champ_id) return { routed: false };
  const { data: champ } = await admin.from("club_champs").select("club_id").eq("id", reg.champ_id).maybeSingle();
  const hostClubId = champ?.club_id as string | undefined;
  if (!hostClubId) return { routed: false };
  const { data: payer } = await admin.from("club_members").select("id, club_id, user_id").eq("id", clubMemberId).maybeSingle();
  if (!payer || payer.club_id === hostClubId) return { routed: false };
  const { data: hostIsClub } = await admin.from("clubs").select("id").eq("id", hostClubId).maybeSingle();
  if (!hostIsClub) return { routed: false };
  const { data: hostMember, error } = await admin.rpc("resolve_host_billing_member", {
    p_club_member_id: payer.id, p_host_club_id: hostClubId,
  });
  if (error || !hostMember) {
    console.error("host billing member error", error);
    return { routed: false, error: "Could not prepare the host club payment" };
  }
  return { routed: true, clubId: hostClubId, clubMemberId: hostMember as string, homeUserId: payer.user_id };
}
