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

    const { userId, clubName, subdomain, userName, userEmail, tenantType } = await req.json();
    const normalizedSubdomain = String(subdomain || "").trim().toLowerCase();
    const normalizedClubName = String(clubName || "").trim();
    const normalizedUserName = String(userName || "").trim();
    const normalizedUserEmail = String(userEmail || "").trim().toLowerCase();
    const normalizedTenantType = tenantType === "association" ? "association" : "club";

    if (!userId || !normalizedClubName || !normalizedSubdomain) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await supabaseAdmin
      .from("clubs")
      .select("id")
      .eq("subdomain", normalizedSubdomain)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Subdomain already taken" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingMember } = await supabaseAdmin
      .from("club_members")
      .select("club_id")
      .eq("user_id", userId)
      .limit(1);

    if (existingMember && existingMember.length > 0) {
      return new Response(JSON.stringify({ error: "User already belongs to a club" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        name: normalizedUserName || "",
        email: normalizedUserEmail || null,
      }, { onConflict: "id" });

    if (profileErr) {
      console.error("Failed to ensure creator profile:", profileErr);
      return new Response(JSON.stringify({ error: "Failed to prepare creator profile" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: newClub, error: clubErr } = await supabaseAdmin
      .from("clubs")
      .insert({
        name: normalizedClubName,
        subdomain: normalizedSubdomain,
        created_by: userId,
        tenant_type: normalizedTenantType,
      })
      .select()
      .single();

    if (clubErr) {
      console.error("Failed to create club:", clubErr);
      return new Response(JSON.stringify({ error: clubErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: captainMember, error: memErr } = await supabaseAdmin
      .from("club_members")
      .insert({
        club_id: newClub.id,
        user_id: userId,
        role: "captain",
        name: normalizedUserName || "",
        email: normalizedUserEmail || null,
      })
      .select("id")
      .single();

    if (memErr || !captainMember) {
      console.error("Failed to add captain:", memErr);
      await supabaseAdmin.from("clubs").delete().eq("id", newClub.id);

      return new Response(JSON.stringify({ error: memErr?.message || "Failed to add club captain" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateClubErr } = await supabaseAdmin
      .from("clubs")
      .update({ club_captain_member_id: captainMember.id })
      .eq("id", newClub.id);

    if (updateClubErr) {
      console.error("Failed to set club captain member:", updateClubErr);
      return new Response(JSON.stringify({ error: "Club created, but captain setup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auto-provision a trial subscription on the default plan so the new tenant
    // (club OR association) appears in Super Admin → Subscriptions for billing.
    try {
      const { data: defaultPlan } = await supabaseAdmin
        .from("subscription_plans")
        .select("id, price_per_member, minimum_charge, trial_days")
        .eq("is_default", true)
        .eq("active", true)
        .maybeSingle();

      if (defaultPlan) {
        const trialDays = Number(defaultPlan.trial_days ?? 30);
        const now = new Date();
        const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
        const memberCount = 1; // founder
        const amountDue = Math.max(
          memberCount * Number(defaultPlan.price_per_member ?? 0),
          Number(defaultPlan.minimum_charge ?? 0)
        );

        const { error: subErr } = await supabaseAdmin
          .from("club_subscriptions")
          .upsert({
            club_id: newClub.id,
            plan_id: defaultPlan.id,
            status: "trial",
            trial_ends_at: trialEnd.toISOString(),
            current_period_start: now.toISOString(),
            current_period_end: trialEnd.toISOString(),
            member_count: memberCount,
            amount_due: amountDue,
          }, { onConflict: "club_id" });

        if (subErr) console.error("Failed to create trial subscription:", subErr);
      } else {
        console.warn("No default subscription plan found — skipping auto-subscription for", newClub.id);
      }
    } catch (subSetupErr) {
      console.error("Subscription auto-provision error:", subSetupErr);
      // Non-fatal — tenant creation already succeeded.
    }

    return new Response(JSON.stringify({ club: { ...newClub, club_captain_member_id: captainMember.id } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-club error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});