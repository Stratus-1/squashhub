// Creates a Stitch recurring debit mandate (DebiCheck or EFT) for a member.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token";
const STITCH_GRAPHQL = "https://api.stitch.money/graphql";
const PUBLIC_APP_ORIGIN = "https://squashhub.co.za";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const {
      club_id,
      club_member_id,
      fee_category_id = null,
      rail = "debicheck",
      max_amount,
      debit_day = 1,
      return_url,
    } = body || {};

    if (!club_id || !club_member_id || !max_amount || !return_url) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (!["debicheck", "eft_debit"].includes(rail)) {
      return json({ error: "Invalid rail" }, 400);
    }
    const amt = Number(max_amount);
    if (!(amt > 0)) return json({ error: "Invalid amount" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: member } = await admin
      .from("club_members")
      .select("id, club_id, user_id, full_name, club_member_number, cellphone, email")
      .eq("id", club_member_id)
      .maybeSingle();
    if (!member || member.club_id !== club_id || member.user_id !== userId) {
      return json({ error: "Member not found or not yours" }, 403);
    }

    const { data: club } = await admin
      .from("clubs")
      .select("id, name, payment_gateway")
      .eq("id", club_id)
      .maybeSingle();
    if (!club || club.payment_gateway !== "stitch") {
      return json({ error: "Stitch is not configured for this club" }, 400);
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", club_id)
      .maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const clientId = creds.client_id;
    const clientSecret = creds.client_secret;
    if (!clientId || !clientSecret) {
      return json({ error: "Stitch client_id / client_secret not configured for this club." }, 400);
    }

    // OAuth token (client_credentials) — scope depends on rail
    const scope = rail === "debicheck"
      ? "client_paymentauthorizationrequest"
      : "client_userinitiationrequest";

    const tokenResp = await fetch(STITCH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope,
        audience: "https://secure.stitch.money",
      }),
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !tokenJson.access_token) {
      console.error("Stitch token error", tokenResp.status, tokenJson);
      return json({
        error: `Stitch auth failed [${tokenResp.status}]: ${tokenJson?.error_description || tokenJson?.error || "unknown"}`,
      }, 502);
    }
    const accessToken: string = tokenJson.access_token;

    // Insert pending mandate
    const { data: mandate, error: mErr } = await admin
      .from("stitch_mandates")
      .insert({
        club_id,
        club_member_id,
        user_id: userId,
        rail,
        max_amount_cents: Math.round(amt * 100),
        frequency: "monthly",
        debit_day,
        status: "pending",
        fee_category_id,
      })
      .select()
      .single();
    if (mErr || !mandate) {
      console.error("mandate insert error", mErr);
      return json({ error: "Failed to create mandate record" }, 500);
    }

    // Build the appropriate Stitch GraphQL mutation
    const externalRef = `MND-${mandate.id.slice(0, 8)}`;
    const fullName = member.full_name || "Member";
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ") || firstName;

    let mutation: string;
    let variables: Record<string, unknown>;

    if (rail === "debicheck") {
      mutation = `
        mutation CreateAuth($input: ClientPaymentAuthorizationRequestCreateInput!) {
          clientPaymentAuthorizationRequestCreate(input: $input) {
            authorizationRequest { id url }
          }
        }`;
      variables = {
        input: {
          beneficiary: { bankAccount: { name: club.name?.slice(0, 50) || "Club" } },
          payer: {
            name: fullName.slice(0, 50),
            email: member.email || `${member.id}@noemail.local`,
            mobileNumber: member.cellphone || undefined,
          },
          amount: { quantity: amt.toFixed(2), currency: "ZAR" },
          externalReference: externalRef,
        },
      };
    } else {
      mutation = `
        mutation CreateUserInit($input: UserInitiationRequestCreateInput!) {
          userInitiationRequestCreate(input: $input) {
            userInitiationRequest { id url }
          }
        }`;
      variables = {
        input: {
          fullName,
          email: member.email || `${member.id}@noemail.local`,
          mobileNumber: member.cellphone || undefined,
          externalReference: externalRef,
        },
      };
    }

    const gqlResp = await fetch(STITCH_GRAPHQL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: mutation, variables }),
    });
    const gqlJson = await gqlResp.json().catch(() => ({}));
    if (!gqlResp.ok || gqlJson.errors) {
      console.error("Stitch mandate error", gqlResp.status, gqlJson);
      await admin.from("stitch_mandates").update({ status: "failed" }).eq("id", mandate.id);
      return json({
        error: `Stitch mandate failed [${gqlResp.status}]: ${gqlJson?.errors?.[0]?.message || "unknown"}`,
      }, 502);
    }

    const node =
      gqlJson?.data?.clientPaymentAuthorizationRequestCreate?.authorizationRequest ||
      gqlJson?.data?.userInitiationRequestCreate?.userInitiationRequest;
    const stitchId = node?.id;
    const authUrl = node?.url ? appendParam(node.url, "redirect_uri", sanitizeReturnUrl(return_url)) : null;

    await admin
      .from("stitch_mandates")
      .update({ stitch_mandate_id: stitchId, auth_url: authUrl })
      .eq("id", mandate.id);

    return json({ mandate_id: mandate.id, auth_url: authUrl, stitch_id: stitchId });
  } catch (e) {
    console.error("stitch-create-mandate fatal", e);
    return json({ error: (e as Error).message || "Unexpected error" }, 500);
  }
});

function appendParam(url: string, key: string, value: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set(key, value);
    return u.toString();
  } catch {
    return url + (url.includes("?") ? "&" : "?") + `${key}=${encodeURIComponent(value)}`;
  }
}

function sanitizeReturnUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.origin === PUBLIC_APP_ORIGIN || u.hostname.endsWith("squashhub.co.za") || u.hostname.endsWith("lovable.app") || u.hostname === "localhost") {
      return u.toString();
    }
    return `${PUBLIC_APP_ORIGIN}/account`;
  } catch {
    return `${PUBLIC_APP_ORIGIN}/account`;
  }
}
