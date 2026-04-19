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

    const insertPayload: Record<string, unknown> = {
      club_id: assoc.id,
      user_id: user.id,
      name: memberName,
      email: user.email,
      phone: memberPhone,
      plays_league: true,
      role: "member",
      is_league_only_membership: true,
    };
    if (validatedHomeClubId) {
      insertPayload.home_club_id = validatedHomeClubId;
    }
    // No club_member_number assigned yet — admin allocates it (and triggers fee creation)

    const { data: newMember, error: insertErr } = await supabaseAdmin
      .from("club_members")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertErr) {
      console.error("[provision-association-member] insert failed", insertErr);
      return jsonResp(500, { error: insertErr.message });
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
