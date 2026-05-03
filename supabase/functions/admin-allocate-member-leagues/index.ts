// Admin-side league allocation for an existing club member.
// Mirrors what `provision-association-member` does during self-registration:
//  - Allocates a club number (e.g. NSC101) if the member doesn't have one.
//  - For each selected home-club league_associations row (LS, NIL, ...):
//      * Allocates a sequential association number (e.g. LWL003) at the
//        association tenant if one exists (matched by abbreviation/name).
//      * Inserts an active member_association_affiliations row.
//      * Seeds an unpaid pass-through fee on the member's club account
//        (linked to the association-tenant fee row when applicable).
//      * Sets plays_league = true and (first selected) enable_league_association_id.
//
// Auth: caller must be an admin/captain of the member's club.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return jsonResp(401, { error: "Unauthorized" });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return jsonResp(401, { error: "Unauthorized" });
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const memberId = String(body?.memberId || "").trim();
    const leagueAssocIds: string[] = Array.isArray(body?.leagueAssociationIds)
      ? body.leagueAssociationIds.map((x: any) => String(x))
      : [];
    if (!memberId) return jsonResp(400, { error: "memberId is required" });
    if (leagueAssocIds.length === 0) return jsonResp(400, { error: "Select at least one league" });

    // Load member + club
    const { data: member, error: mErr } = await admin
      .from("club_members")
      .select("id, club_id, user_id, name, email, club_member_number, plays_league, enable_league_association_id")
      .eq("id", memberId)
      .maybeSingle();
    if (mErr || !member) return jsonResp(404, { error: "Member not found" });
    const clubId: string = member.club_id;

    // Permission check
    const { data: caller } = await admin
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", callerId)
      .maybeSingle();
    const isClubAdmin = caller && ["captain", "admin"].includes(String(caller.role));
    if (!isClubAdmin) {
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId);
      const isPlatformAdmin = (roles || []).some((r: any) => r.role === "admin");
      if (!isPlatformAdmin) return jsonResp(403, { error: "Admins only" });
    }

    // Load club config (for member number generation)
    const { data: club } = await admin
      .from("clubs")
      .select("id, name, member_number_prefix, member_number_length, member_number_start")
      .eq("id", clubId)
      .maybeSingle();
    if (!club) return jsonResp(404, { error: "Club not found" });

    // 1) Allocate club_member_number if missing
    let clubNumber = member.club_member_number as string | null;
    if (!clubNumber) {
      clubNumber = await allocateNextNumber(admin, clubId, club);
      const { error: clubNumberErr } = await admin
        .from("club_members")
        .update({ club_member_number: clubNumber })
        .eq("id", memberId);
      if (clubNumberErr) throw clubNumberErr;
    }

    // 2) Load the home-club league_associations rows the admin selected
    const { data: laRows } = await admin
      .from("league_associations")
      .select("id, name, abbreviation, fee_annual, platform_association_id, active")
      .eq("club_id", clubId)
      .in("id", leagueAssocIds);

    const allocations: Array<{
      league: string;
      associationNumber: string | null;
      fee: number;
    }> = [];
    let firstHomeAssocId: string | null = null;
    const seasonYear = new Date().getFullYear();

    for (const la of (laRows || []) as any[]) {
      if (la.active === false) continue;
      if (!firstHomeAssocId) firstHomeAssocId = la.id;

      // Find a matching association-tenant club (by name or abbreviation)
      const { data: assocTenants } = await admin
        .from("clubs")
        .select("id, name, member_number_prefix, member_number_length, member_number_start, subdomain")
        .eq("tenant_type", "association");

      const assocTenant = (assocTenants || []).find((t: any) =>
        (la.platform_association_id && t.id === la.platform_association_id) ||
        (la.abbreviation && t.member_number_prefix &&
          String(t.member_number_prefix).toLowerCase() === String(la.abbreviation).toLowerCase()) ||
        (la.name && t.name && String(t.name).toLowerCase() === String(la.name).toLowerCase())
      );

      let allocatedAssocNumber: string | null = null;
      let assocFeeRowId: string | null = null;

      if (assocTenant) {
        // Check if there's already an MAA row for this (member, association)
        const { data: existingMAA } = await admin
          .from("member_association_affiliations")
          .select("id, league_association_number")
          .eq("club_member_id", memberId)
          .eq("association_id", la.id)
          .maybeSingle();

        // Idempotency: see if member already has a row at the association tenant
        let existingAssocMember: any = null;
        if (member.user_id) {
          const { data } = await admin
            .from("club_members")
            .select("id, club_member_number")
            .eq("club_id", assocTenant.id)
            .eq("user_id", member.user_id)
            .maybeSingle();
          existingAssocMember = data;
        }
        if (!existingAssocMember && member.email) {
          const { data } = await admin
            .from("club_members")
            .select("id, club_member_number")
            .eq("club_id", assocTenant.id)
            .eq("home_club_id", clubId)
            .ilike("email", member.email)
            .maybeSingle();
          existingAssocMember = data;
        }

        // Pick number, prioritising MAA (the unique constraint lives there)
        if (existingMAA?.league_association_number) {
          allocatedAssocNumber = existingMAA.league_association_number;
        } else if (existingAssocMember?.club_member_number) {
          // Verify the tenant-row's number isn't already used by another MAA row
          const { data: maaOwner } = await admin
            .from("member_association_affiliations")
            .select("club_member_id")
            .eq("association_id", la.id)
            .eq("league_association_number", existingAssocMember.club_member_number)
            .maybeSingle();
          if (!maaOwner || maaOwner.club_member_id === memberId) {
            allocatedAssocNumber = existingAssocMember.club_member_number;
          } else {
            // Conflict: reassign a fresh number for this member
            allocatedAssocNumber = await allocateNextAssocNumber(admin, assocTenant, la.id);
            await admin
              .from("club_members")
              .update({ club_member_number: allocatedAssocNumber })
              .eq("id", existingAssocMember.id);
          }
        } else {
          allocatedAssocNumber = await allocateNextAssocNumber(admin, assocTenant, la.id);
        }

        // Create assoc-tenant member row if missing
        if (!existingAssocMember) {
          const { data: newAssocMem, error: newAssocMemErr } = await admin
            .from("club_members")
            .insert({
              club_id: assocTenant.id,
              user_id: member.user_id ?? null,
              name: member.name,
              email: member.email ?? null,
              plays_league: true,
              role: "member",
              is_league_only_membership: true,
              club_member_number: allocatedAssocNumber,
              home_club_id: clubId,
            })
            .select("id")
            .single();
          if (newAssocMemErr) throw newAssocMemErr;

          if (newAssocMem?.id && Number(la.fee_annual) > 0) {
            const { data: assocFee, error: assocFeeErr } = await admin
              .from("club_member_fee_payments")
              .insert({
                club_member_id: newAssocMem.id,
                fee_type: "league",
                fee_label: la.name + (la.abbreviation ? ` (${la.abbreviation})` : ""),
                amount: Number(la.fee_annual),
                paid: false,
                season_year: seasonYear,
              })
              .select("id")
              .single();
            if (assocFeeErr) throw assocFeeErr;
            assocFeeRowId = assocFee?.id ?? null;
          }
        }
      }

      // 3) Permanent affiliation on the home-club member row
      const { error: affiliationErr } = await admin
        .from("member_association_affiliations")
        .upsert(
          {
            club_member_id: memberId,
            association_id: la.id,
            league_association_number: allocatedAssocNumber,
            active: true,
          },
          { onConflict: "club_member_id,association_id" }
        );
      if (affiliationErr) throw affiliationErr;

      // 4) Pass-through fee on the home-club member account
      if (Number(la.fee_annual) > 0) {
        // avoid duplicate seed: check if an unpaid pass-through fee for this label already exists this season
        const label = la.name + (la.abbreviation ? ` (${la.abbreviation})` : "");
        const { data: existingFee } = await admin
          .from("club_member_fee_payments")
          .select("id")
          .eq("club_member_id", memberId)
          .eq("fee_label", label)
          .eq("season_year", seasonYear)
          .eq("paid", false)
          .maybeSingle();
        if (!existingFee) {
          const { error: memberFeeErr } = await admin.from("club_member_fee_payments").insert({
            club_member_id: memberId,
            fee_type: "league_affiliation",
            fee_label: label,
            amount: Number(la.fee_annual),
            paid: false,
            season_year: seasonYear,
            is_pass_through: !!assocFeeRowId,
            linked_fee_payment_id: assocFeeRowId,
          });
          if (memberFeeErr) throw memberFeeErr;
        }
      }

      allocations.push({
        league: la.name,
        associationNumber: allocatedAssocNumber,
        fee: Number(la.fee_annual || 0),
      });
    }

    // 5) Mark plays_league + default association on the member
    const { error: updateMemberErr } = await admin
      .from("club_members")
      .update({
        plays_league: true,
        enable_league_association_id: member.enable_league_association_id || firstHomeAssocId,
      })
      .eq("id", memberId);
    if (updateMemberErr) throw updateMemberErr;

    return jsonResp(200, {
      ok: true,
      clubNumber,
      allocations,
    });
  } catch (e) {
    console.error("[admin-allocate-member-leagues]", e);
    return jsonResp(500, { error: (e as Error).message || "Server error" });
  }
});

async function allocateNextNumber(admin: any, tenantId: string, tenant: any): Promise<string> {
  const prefix = tenant?.member_number_prefix || "";
  const numLength = Number(tenant?.member_number_length || 4);
  const numStart = Number(tenant?.member_number_start || 1);

  const { data: existing } = await admin
    .from("club_members")
    .select("club_member_number")
    .eq("club_id", tenantId)
    .not("club_member_number", "is", null);

  const escaped = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}(\\d+)$`);
  let maxNum = numStart - 1;
  for (const row of (existing || []) as any[]) {
    const m = String(row.club_member_number || "").match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `${prefix}${String(next).padStart(numLength, "0")}`;
}
