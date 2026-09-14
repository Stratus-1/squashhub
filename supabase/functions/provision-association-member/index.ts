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
    // Admin mode: a club admin affiliates ANOTHER member (who may not even have
    // a login yet). Without this the function used to provision the *caller*.
    const clubMemberId = body?.clubMemberId ? String(body.clubMemberId) : null;

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

    // ---------------------------------------------------------------
    // Resolve WHO is being affiliated (self-signup vs admin acting for a member)
    // ---------------------------------------------------------------
    const normalisePhone = (p: string | null | undefined) =>
      (p || "").replace(/\D+/g, "").replace(/^0+/, "");

    let targetUserId: string | null = user.id;
    let targetHomeMemberId: string | null = null;
    let targetHomeClubId: string | null = homeClubId;
    let memberName = ((user.user_metadata || {}) as any).name as string ||
      (user.email?.split("@")[0] ?? "Member");
    let memberEmail: string | null = user.email ?? null;
    let memberPhone: string | null = (((user.user_metadata || {}) as any).phone as string) ||
      (user.phone ?? null);

    if (clubMemberId) {
      const { data: target, error: targetErr } = await supabaseAdmin
        .from("club_members")
        .select("id, club_id, user_id, name, email, phone")
        .eq("id", clubMemberId)
        .maybeSingle();
      if (targetErr || !target) {
        return jsonResp(404, { error: "Member not found" });
      }
      const { data: isAdmin } = await supabaseAdmin.rpc("is_club_admin", {
        _user_id: user.id,
        _club_id: target.club_id,
      });
      if (!isAdmin) {
        return jsonResp(403, { error: "Not a club admin for this member" });
      }
      targetUserId = (target as any).user_id ?? null;
      targetHomeMemberId = target.id;
      targetHomeClubId = target.club_id;
      memberName = (target as any).name || "Member";
      memberEmail = (target as any).email ?? null;
      memberPhone = (target as any).phone ?? null;
    }

    // Idempotency: association row already exists for this person?
    if (targetUserId) {
      const { data: existing } = await supabaseAdmin
        .from("club_members")
        .select("id")
        .eq("club_id", assoc.id)
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (existing?.id) {
        return jsonResp(200, { ok: true, memberId: existing.id, alreadyExists: true });
      }
    }

    // If home club provided, validate it is affiliated to this association
    let validatedHomeClubId: string | null = null;
    if (targetHomeClubId) {
      const { data: aff } = await supabaseAdmin
        .from("association_affiliated_clubs")
        .select("id")
        .eq("association_tenant_id", assoc.id)
        .eq("club_id", targetHomeClubId)
        .eq("status", "active")
        .maybeSingle();
      if (aff) {
        validatedHomeClubId = targetHomeClubId;
      }
    }

    // ---------------------------------------------------------------
    // CLAIM EXISTING PRE-LOADED ROW (admin pre-allocated members)
    // ---------------------------------------------------------------
    // Match priority: email (case-insensitive) → phone (digits-only).
    const userEmailLower = (memberEmail || "").toLowerCase();
    const userPhoneDigits = normalisePhone(memberPhone);


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
        name: memberName,
        plays_league: true,
      };
      if (targetUserId) updatePayload.user_id = targetUserId;
      if (memberPhone) updatePayload.phone = memberPhone;
      if (memberEmail) updatePayload.email = memberEmail;
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
        user_id: targetUserId,
        name: memberName,
        email: memberEmail,
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

    // NOTE: league/national affiliation fees are NOT charged to members here.
    // Affiliation billing is handled at regional/national level and filtered
    // down to clubs — never auto-raised on a member when they are provisioned
    // into a league association. (Product decision, 2026-09.)


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

      // Resolve the home-club member row (explicit id in admin mode, otherwise the caller's row)
      let homeMemberId: string | null = targetHomeMemberId;
      if (!homeMemberId && targetUserId) {
        const { data: found } = await supabaseAdmin
          .from("club_members")
          .select("id")
          .eq("club_id", validatedHomeClubId)
          .eq("user_id", targetUserId)
          .maybeSingle();
        homeMemberId = found?.id ?? null;
      }

      if (homeMemberId) {
        await supabaseAdmin
          .from("club_members")
          .update({ enable_league_association_id: homeAssoc?.id ?? null, plays_league: true })
          .eq("id", homeMemberId);
      }

      const homeMember = homeMemberId ? { id: homeMemberId } : null;


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
