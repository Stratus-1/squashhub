import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return jsonResp(401, { error: "Unauthorized" });
    }
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return jsonResp(401, { error: "Unauthorized" });
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const associationSubdomain = String(body?.associationSubdomain || "").trim().toLowerCase();
    const homeClubId = body?.homeClubId ? String(body.homeClubId) : null;
    const homeClubName = body?.homeClubName ? String(body.homeClubName) : null;

    if (!associationSubdomain) {
      return jsonResp(400, { error: "associationSubdomain is required" });
    }

    // Look up the association tenant (incl. number-config for auto allocation)
    const { data: assoc, error: assocErr } = await supabaseAdmin
      .from("clubs")
      .select("id, name, tenant_type, member_number_prefix, member_number_length, member_number_start")
      .eq("subdomain", associationSubdomain)
      .maybeSingle();

    if (assocErr || !assoc) {
      return jsonResp(404, { error: "Association not found" });
    }
    if (assoc.tenant_type !== "association") {
      return jsonResp(400, { error: "Tenant is not an association" });
    }

    // Idempotency: if a club_member already exists at the association for this user, return success
    const { data: existing } = await supabaseAdmin
      .from("club_members")
      .select("id")
      .eq("club_id", assoc.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing?.id) {
      return jsonResp(200, { ok: true, memberId: existing.id, alreadyExists: true });
    }

    // If home club provided, validate it is affiliated to this association
    let validatedHomeClubId: string | null = null;
    if (homeClubId) {
      const { data: aff } = await supabaseAdmin
        .from("association_affiliated_clubs")
        .select("id")
        .eq("association_tenant_id", assoc.id)
        .eq("club_id", homeClubId)
        .eq("status", "active")
        .maybeSingle();
      if (aff) {
        validatedHomeClubId = homeClubId;
      }
    }

    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const memberName = (meta.name as string) || (user.email?.split("@")[0] ?? "Member");
    const memberPhone = (meta.phone as string) || null;

    // ---------------------------------------------------------------
    // CLAIM EXISTING PRE-LOADED ROW (admin pre-allocated members)
    // ---------------------------------------------------------------
    // Admin may have already created a club_members row for this person at
    // the association tenant (with a club_member_number / league number,
    // email and/or phone) but with user_id IS NULL because they hadn't
    // signed up yet. When they now sign up, we MUST link to that existing
    // row instead of inserting a duplicate with a fresh number.
    //
    // Match priority: email (case-insensitive) → phone (digits-only).
    const normalisePhone = (p: string | null | undefined) =>
      (p || "").replace(/\D+/g, "").replace(/^0+/, "");
    const userEmailLower = (user.email || "").toLowerCase();
    const userPhoneDigits = normalisePhone(memberPhone) || normalisePhone(user.phone || "");

    let claimedMember: { id: string; club_member_number: string | null } | null = null;
    if (userEmailLower || userPhoneDigits) {
      const { data: candidates } = await supabaseAdmin
        .from("club_members")
        .select("id, email, phone, club_member_number, user_id")
        .eq("club_id", assoc.id)
        .is("user_id", null);

      // 1) email match
      if (userEmailLower) {
        const m = (candidates || []).find(
          (r: any) => (r.email || "").toLowerCase() === userEmailLower
        );
        if (m) claimedMember = { id: m.id, club_member_number: m.club_member_number };
      }
      // 2) phone match (only if no email match)
      if (!claimedMember && userPhoneDigits) {
        const m = (candidates || []).find(
          (r: any) => normalisePhone(r.phone) === userPhoneDigits
        );
        if (m) claimedMember = { id: m.id, club_member_number: m.club_member_number };
      }
    }

    let newMember: { id: string };
    let allocatedNumber: string;

    if (claimedMember) {
      // Link existing row → keep their club_member_number and any prior setup.
      const updatePayload: Record<string, unknown> = {
        user_id: user.id,
        name: memberName,
        plays_league: true,
      };
      if (memberPhone) updatePayload.phone = memberPhone;
      if (user.email) updatePayload.email = user.email;
      if (validatedHomeClubId) updatePayload.home_club_id = validatedHomeClubId;

      const { error: updErr } = await supabaseAdmin
        .from("club_members")
        .update(updatePayload)
        .eq("id", claimedMember.id);
      if (updErr) {
        console.error("[provision-association-member] claim update failed", updErr);
        return jsonResp(500, { error: updErr.message });
      }
      newMember = { id: claimedMember.id };
      allocatedNumber = claimedMember.club_member_number || "";
      console.log(
        "[provision-association-member] claimed pre-loaded member",
        claimedMember.id,
        "number",
        allocatedNumber
      );
    } else {
      // No pre-loaded row → allocate a fresh sequential league number.
      const prefix = (assoc as any).member_number_prefix || "";
      const numLength = Number((assoc as any).member_number_length || 4);
      const numStart = Number((assoc as any).member_number_start || 1);

      const { data: existingNumbers } = await supabaseAdmin
        .from("club_members")
        .select("club_member_number")
        .eq("club_id", assoc.id)
        .not("club_member_number", "is", null);

      let maxNum = numStart - 1;
      const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^${escapedPrefix}(\\d+)$`);
      for (const row of (existingNumbers || []) as any[]) {
        const v = String(row.club_member_number || "");
        const m = v.match(re);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      }
      const nextNum = maxNum + 1;
      allocatedNumber = `${prefix}${String(nextNum).padStart(numLength, "0")}`;

      const insertPayload: Record<string, unknown> = {
        club_id: assoc.id,
        user_id: user.id,
        name: memberName,
        email: user.email,
        phone: memberPhone,
        plays_league: true,
        role: "member",
        is_league_only_membership: true,
        club_member_number: allocatedNumber,
      };
      if (validatedHomeClubId) {
        insertPayload.home_club_id = validatedHomeClubId;
      }

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("club_members")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertErr) {
        console.error("[provision-association-member] insert failed", insertErr);
        return jsonResp(500, { error: insertErr.message });
      }
      newMember = inserted;
    }

    // Seed unpaid league-affiliation fees from the association's configured
    // fees. Affiliation fees may live in either `league_associations` OR
    // `national_body_fees` (with fee_type = 'league_affiliation' / 'association').
    // Member stays Inactive until these are paid.
    //
    // We collect both:
    //  - feeRecords: rows on the ASSOCIATION tenant (the league's view of who owes them).
    //  - homeClubFeeSeeds: matching rows on the HOME CLUB tenant, marked
    //    is_pass_through=true and linked to the association-tenant fee row.
    //    The member pays the home club; a trigger then auto-settles the
    //    association-tenant row and journals "club owes league" on the club books.
    const insertedAssocFeeIds: string[] = [];
    const homeClubFeeSeeds: Array<{ label: string; amount: number; assocFeeIndex: number }> = [];
    try {
      const seasonYear = new Date().getFullYear();
      const feeRecords: any[] = [];

      // Source 1: league_associations table
      const { data: laConfigs } = await supabaseAdmin
        .from("league_associations")
        .select("name, abbreviation, fee_annual, active")
        .eq("club_id", assoc.id);
      for (const a of ((laConfigs || []) as any[])) {
        if (a.active === false) continue;
        const amt = Number(a.fee_annual ?? 0);
        if (amt <= 0) continue;
        const label = a.name + (a.abbreviation ? ` (${a.abbreviation})` : "");
        feeRecords.push({
          club_member_id: newMember.id,
          fee_type: "league",
          fee_label: label,
          amount: amt,
          paid: false,
          season_year: seasonYear,
        });
        homeClubFeeSeeds.push({ label, amount: amt, assocFeeIndex: feeRecords.length - 1 });
      }

      // Source 2: national_body_fees with affiliation-style fee_type
      const { data: nbfConfigs } = await supabaseAdmin
        .from("national_body_fees")
        .select("body_name, abbreviation, fee_annual, active, fee_type")
        .eq("club_id", assoc.id);
      for (const n of ((nbfConfigs || []) as any[])) {
        if (n.active === false) continue;
        const amt = Number(n.fee_annual ?? 0);
        if (amt <= 0) continue;
        const t = String(n.fee_type || "").toLowerCase();
        // Only seed affiliation/league-style fees, not registration/other
        if (!(t === "league_affiliation" || t === "association" || t === "league" || t === "affiliation")) continue;
        const label = n.body_name + (n.abbreviation ? ` (${n.abbreviation})` : "");
        feeRecords.push({
          club_member_id: newMember.id,
          fee_type: "league_affiliation",
          fee_label: label,
          amount: amt,
          paid: false,
          season_year: seasonYear,
        });
        homeClubFeeSeeds.push({ label, amount: amt, assocFeeIndex: feeRecords.length - 1 });
      }

      if (feeRecords.length > 0) {
        const { data: insertedFees, error: feeErr } = await supabaseAdmin
          .from("club_member_fee_payments")
          .insert(feeRecords)
          .select("id");
        if (feeErr) {
          console.warn("[provision-association-member] fee seed failed", feeErr);
        } else {
          for (const f of (insertedFees || []) as any[]) {
            insertedAssocFeeIds.push(f.id);
          }
        }
      } else {
        console.log("[provision-association-member] no active affiliation fees to seed for", assoc.id);
      }
    } catch (feeEx) {
      console.warn("[provision-association-member] fee seed exception", feeEx);
    }

    // Mirror affiliation fees onto the HOME CLUB tenant as pass-through fees.
    // Member pays the home club; trigger auto-settles the association-tenant
    // row and journals "club owes league" on the home-club books.
    if (validatedHomeClubId && homeClubFeeSeeds.length > 0 && insertedAssocFeeIds.length > 0) {
      try {
        const { data: homeMemberRow } = await supabaseAdmin
          .from("club_members")
          .select("id")
          .eq("club_id", validatedHomeClubId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (homeMemberRow?.id) {
          const seasonYear = new Date().getFullYear();
          const ptRecords = homeClubFeeSeeds
            .map((s) => ({
              club_member_id: homeMemberRow.id,
              fee_type: "league_affiliation",
              fee_label: s.label,
              amount: s.amount,
              paid: false,
              season_year: seasonYear,
              is_pass_through: true,
              linked_fee_payment_id: insertedAssocFeeIds[s.assocFeeIndex] ?? null,
            }))
            .filter((r) => !!r.linked_fee_payment_id);
          if (ptRecords.length > 0) {
            const { error: ptErr } = await supabaseAdmin
              .from("club_member_fee_payments")
              .insert(ptRecords);
            if (ptErr) {
              console.warn("[provision-association-member] home-club pass-through seed failed", ptErr);
            }
          }
        }
      } catch (ptEx) {
        console.warn("[provision-association-member] pass-through seed exception", ptEx);
      }
    }

    // Also link the user's home-club member row to this association so the
    // dashboard can show "you've joined" and the tenant switcher works,
    // AND record the allocated association number against a default
    // home-club league for that association so the Members card badge
    // displays e.g. "League LS #LWL002".
    if (validatedHomeClubId) {
      // Find the matching league_associations row at the home club that
      // points to this association tenant (via platform_association_id, name
      // or abbreviation). This is the "NSC-side" representation of LS/NIL.
      const { data: homeAssocRows } = await supabaseAdmin
        .from("league_associations")
        .select("id, name, abbreviation")
        .eq("club_id", validatedHomeClubId);
      const assocAbbr = (assoc as any).member_number_prefix || null;
      const homeAssoc = (homeAssocRows || []).find((r: any) =>
        (r.name || "").toLowerCase() === (assoc.name || "").toLowerCase() ||
        (assocAbbr && (r.abbreviation || "").toLowerCase() === String(assocAbbr).toLowerCase())
      ) || (homeAssocRows || [])[0] || null;

      await supabaseAdmin
        .from("club_members")
        .update({ enable_league_association_id: homeAssoc?.id ?? null, plays_league: true })
        .eq("club_id", validatedHomeClubId)
        .eq("user_id", user.id);

      // Resolve the home-club member row id (needed for the registration)
      const { data: homeMember } = await supabaseAdmin
        .from("club_members")
        .select("id")
        .eq("club_id", validatedHomeClubId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (homeMember?.id && homeAssoc?.id) {
        // IMPORTANT: We deliberately do NOT create any `member_league_registrations`
        // row here. A "league" (NSA / LS) is the governing association — `plays_league=true`
        // plus the permanent `member_association_affiliations` row below is enough to
        // mark the member as affiliated. A `member_league_registrations` row represents
        // a *league team* (Men's 7th, Ladies 1st, etc.) and must ONLY be created by an
        // admin via the league/team allocation UI. Auto-creating one here was the bug
        // that kept dropping male players (Grant Williams) into the Ladies 1st league.
        //
        // Backfill the league_association_number on any EXISTING admin-created
        // registrations for this association, so the official NSA/LS number shows
        // on team rosters — but never insert a new registration.
        const { data: assocLeagues } = await supabaseAdmin
          .from("leagues")
          .select("id")
          .eq("club_id", validatedHomeClubId)
          .eq("association_id", homeAssoc.id);

        const assocLeagueIds = (assocLeagues || []).map((l: any) => l.id);

        if (assocLeagueIds.length > 0) {
          const { data: existingRegs } = await supabaseAdmin
            .from("member_league_registrations")
            .select("id, league_association_number")
            .eq("club_member_id", homeMember.id)
            .in("league_id", assocLeagueIds);

          for (const reg of (existingRegs || []) as any[]) {
            if (!reg.league_association_number) {
              await supabaseAdmin
                .from("member_league_registrations")
                .update({ league_association_number: allocatedNumber })
                .eq("id", reg.id);
            }
          }
        }

        // Permanent affiliation record — survives team/league rebuilds.
        // The number is reserved to this member forever.
        const { error: affErr } = await supabaseAdmin
          .from("member_association_affiliations")
          .upsert(
            {
              club_member_id: homeMember.id,
              association_id: homeAssoc.id,
              league_association_number: allocatedNumber,
              active: true,
            },
            { onConflict: "club_member_id,association_id" }
          );
        if (affErr) {
          console.warn("[provision-association-member] affiliation upsert failed", affErr);
        }
      }
    }

    return jsonResp(200, {
      ok: true,
      memberId: newMember.id,
      associationName: assoc.name,
      homeClubName,
      allocatedNumber,
    });
  } catch (e) {
    console.error("[provision-association-member] error", e);
    return jsonResp(500, { error: (e as Error).message || "Server error" });
  }
});

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
