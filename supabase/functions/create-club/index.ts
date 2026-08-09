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

    // Verify caller's JWT — only the authenticated user can create a club for themselves.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authedUserId = userData.user.id;

    const { clubName, subdomain, userName, userEmail, tenantType } = await req.json();
    // Force userId from the verified token — ignore any client-supplied value.
    const userId = authedUserId;
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
        role: "admin",
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
        const trialDays = Number(defaultPlan.trial_days ?? 90);
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

    // Notify all Super Admins (platform admins) of the new tenant registration.
    try {
      const { data: superAdmins } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (superAdmins && superAdmins.length > 0) {
        const tenantLabel = normalizedTenantType === "association" ? "association" : "club";
        const rows = superAdmins.map((sa: { user_id: string }) => ({
          user_id: sa.user_id,
          title: `New ${tenantLabel} registered`,
          message: `${normalizedClubName} (${normalizedSubdomain}) was just registered by ${normalizedUserName || normalizedUserEmail || "a new user"}.`,
          type: "club_registered",
          url: "/super-admin/clubs",
          data: {
            club_id: newClub.id,
            club_name: normalizedClubName,
            subdomain: normalizedSubdomain,
            tenant_type: normalizedTenantType,
            founder_name: normalizedUserName,
            founder_email: normalizedUserEmail,
          },
        }));
        const { error: notifErr } = await supabaseAdmin.from("notifications").insert(rows);
        if (notifErr) console.error("Failed to notify super admins:", notifErr);

        // Email each super admin (look up their email from profiles).
        const adminIds = superAdmins.map((sa: { user_id: string }) => sa.user_id);
        const { data: adminProfiles } = await supabaseAdmin
          .from("profiles")
          .select("id, email")
          .in("id", adminIds);

        const recipients = (adminProfiles ?? [])
          .map((p: { id: string; email: string | null }) => p.email)
          .filter((e): e is string => !!e);

        const registeredAt = new Date().toLocaleString("en-ZA", {
          timeZone: "Africa/Johannesburg",
        });
        const adminUrl = "https://squashhub.co.za/super-admin/clubs";

        await Promise.all(
          recipients.map((email) =>
            supabaseAdmin.functions.invoke("send-transactional-email", {
              body: {
                templateName: "new-club-registered",
                recipientEmail: email,
                idempotencyKey: `new-club-${newClub.id}-${email}`,
                templateData: {
                  clubName: normalizedClubName,
                  subdomain: normalizedSubdomain,
                  tenantType: tenantLabel,
                  founderName: normalizedUserName,
                  founderEmail: normalizedUserEmail,
                  registeredAt,
                  adminUrl,
                },
              },
            }).catch((e) => console.error("send-transactional-email failed:", e))
          )
        );
      }
    } catch (notifySetupErr) {
      console.error("Super admin notify error:", notifySetupErr);
      // Non-fatal.
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