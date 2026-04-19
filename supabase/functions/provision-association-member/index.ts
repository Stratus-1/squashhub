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

    // Auto-allocate the next sequential league number using the association's
    // number-config (prefix / length / start). Inactive until fees are paid.
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
    const allocatedNumber = `${prefix}${String(nextNum).padStart(numLength, "0")}`;

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

    const { data: newMember, error: insertErr } = await supabaseAdmin
      .from("club_members")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertErr) {
      console.error("[provision-association-member] insert failed", insertErr);
      return jsonResp(500, { error: insertErr.message });
    }

    // Seed unpaid league-affiliation fees from the association's configured
    // fees. Affiliation fees may live in either `league_associations` OR
    // `national_body_fees` (with fee_type = 'league_affiliation' / 'association').
    // Member stays Inactive until these are paid.
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
        feeRecords.push({
          club_member_id: newMember.id,
          fee_type: "league",
          fee_label: a.name + (a.abbreviation ? ` (${a.abbreviation})` : ""),
          amount: amt,
          paid: false,
          season_year: seasonYear,
        });
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
        feeRecords.push({
          club_member_id: newMember.id,
          fee_type: "league_affiliation",
          fee_label: n.body_name + (n.abbreviation ? ` (${n.abbreviation})` : ""),
          amount: amt,
          paid: false,
          season_year: seasonYear,
        });
      }

      if (feeRecords.length > 0) {
        const { error: feeErr } = await supabaseAdmin
          .from("club_member_fee_payments")
          .insert(feeRecords);
        if (feeErr) {
          console.warn("[provision-association-member] fee seed failed", feeErr);
        }
      } else {
        console.log("[provision-association-member] no active affiliation fees to seed for", assoc.id);
      }
    } catch (feeEx) {
      console.warn("[provision-association-member] fee seed exception", feeEx);
    }

    // Also link the user's home-club member row to this association so the
    // dashboard can show "you've joined" and the tenant switcher works.
    if (validatedHomeClubId) {
      await supabaseAdmin
        .from("club_members")
        .update({ enable_league_association_id: assoc.id, plays_league: true })
        .eq("club_id", validatedHomeClubId)
        .eq("user_id", user.id);
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
