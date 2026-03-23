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

    const { userId, clubName, subdomain, userName, userEmail } = await req.json();

    if (!userId || !clubName || !subdomain) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check subdomain uniqueness
    const { data: existing } = await supabaseAdmin
      .from("clubs")
      .select("id")
      .eq("subdomain", subdomain)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Subdomain already taken" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already has a club
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

    // Create the club
    const { data: newClub, error: clubErr } = await supabaseAdmin
      .from("clubs")
      .insert({
        name: clubName,
        subdomain,
        created_by: userId,
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

    // Add creator as captain
    const { error: memErr } = await supabaseAdmin.from("club_members").insert({
      club_id: newClub.id,
      user_id: userId,
      role: "captain",
      name: userName || "",
      email: userEmail || "",
    });

    if (memErr) {
      console.error("Failed to add captain:", memErr);
    }

    return new Response(JSON.stringify({ club: newClub }), {
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
