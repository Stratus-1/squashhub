import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

let internalSecretCache: string | null = null;

async function getInternalSecret() {
  if (internalSecretCache) return internalSecretCache;

  const envSecret = Deno.env.get("PUSH_INTERNAL_SECRET");
  if (envSecret) {
    internalSecretCache = envSecret;
    return envSecret;
  }

  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "push_private_internal_secret")
    .single();

  internalSecretCache = data?.value ?? null;
  return internalSecretCache;
}

async function sendFcmToUser(args: {
  targetUserId: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}) {
  const serverKey = Deno.env.get("FCM_SERVER_KEY");
  if (!serverKey) return { sent: 0, failed: 0, skipped: true };

  const { data: tokens } = await supabaseAdmin
    .from("device_push_tokens")
    .select("id, token")
    .eq("user_id", args.targetUserId);

  const registrationIds = (tokens || []).map((t) => t.token).filter(Boolean);
  if (registrationIds.length === 0) return { sent: 0, failed: 0, skipped: false };

  // FCM legacy API supports up to 1000 registration_ids per request.
  const batches: string[][] = [];
  for (let i = 0; i < registrationIds.length; i += 1000) {
    batches.push(registrationIds.slice(i, i + 1000));
  }

  let sent = 0;
  let failed = 0;
  const invalidTokenIds: string[] = [];

  for (const batch of batches) {
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        Authorization: `key=${serverKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        registration_ids: batch,
        priority: "high",
        notification: {
          title: args.title,
          body: args.body,
        },
        data: {
          url: args.url || "/notifications",
          tag: args.tag || "gb-squash-notification",
          title: args.title,
          body: args.body,
        },
      }),
    });

    if (!res.ok) {
      failed += batch.length;
      continue;
    }

    const payload = await res.json().catch(() => null);
    if (!payload || !Array.isArray(payload.results)) {
      failed += batch.length;
      continue;
    }

    // payload.results aligns with registration_ids ordering.
    for (let i = 0; i < payload.results.length; i++) {
      const r = payload.results[i];
      if (r?.message_id) {
        sent += 1;
      } else {
        failed += 1;
      }

      const err = r?.error;
      if (err === "NotRegistered" || err === "InvalidRegistration") {
        const tokenValue = batch[i];
        const tokenRow = (tokens || []).find((t) => t.token === tokenValue);
        if (tokenRow?.id) invalidTokenIds.push(tokenRow.id);
      }
    }
  }

  if (invalidTokenIds.length > 0) {
    await supabaseAdmin.from("device_push_tokens").delete().in("id", invalidTokenIds);
  }

  return { sent, failed, skipped: false };
}

async function getOrCreateVapidKeys() {
  // Check if keys already exist
  const { data: existingPublic } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "vapid_public_key")
    .single();

  if (existingPublic) {
    const { data: existingPrivate } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "vapid_private_key")
      .single();
    return {
      publicKey: existingPublic.value,
      privateKey: existingPrivate!.value,
    };
  }

  // Generate new VAPID keys
  const vapidKeys = webpush.generateVAPIDKeys();

  await supabaseAdmin.from("app_settings").upsert([
    { key: "vapid_public_key", value: vapidKeys.publicKey },
    { key: "vapid_private_key", value: vapidKeys.privateKey },
  ]);

  return { publicKey: vapidKeys.publicKey, privateKey: vapidKeys.privateKey };
}

async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(token);
  return user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Get VAPID public key - no auth required
    if (action === "vapid-public-key") {
      const keys = await getOrCreateVapidKeys();
      return new Response(JSON.stringify({ publicKey: keys.publicKey }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send notification to specific user (internal use)
    // Used by a Postgres trigger on `public.notifications` to deliver web push while the app is closed.
    if (action === "send") {
      const internalHeader = req.headers.get("x-internal-secret") ?? "";
      const expected = await getInternalSecret();
      if (!expected || internalHeader !== expected) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { targetUserId, title, body, url: notifUrl, icon, tag } = await req.json();

      const keys = await getOrCreateVapidKeys();
      webpush.setVapidDetails(
        "mailto:admin@gordonsbaysquash.co.za",
        keys.publicKey,
        keys.privateKey
      );

      const { data: subscriptions } = await supabaseAdmin
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", targetUserId);

      const payload = JSON.stringify({
        title,
        body,
        icon: icon || "/pwa-192x192.png",
        url: notifUrl || "/notifications",
        badge: "/pwa-192x192.png",
        tag: tag || "gb-squash-notification",
      });

      const results = await Promise.allSettled(
        (subscriptions || []).map((sub) =>
          webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          )
        )
      );

      // Clean up expired subscriptions
      const expired = results
        .map((r, i) => (r.status === "rejected" ? subscriptions![i] : null))
        .filter(Boolean);

      for (const sub of expired) {
        if (sub) {
          await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id);
        }
      }

      const fcm = await sendFcmToUser({
        targetUserId,
        title,
        body,
        url: notifUrl || "/notifications",
        tag,
      });

      return new Response(
        JSON.stringify({
          sent: results.filter((r) => r.status === "fulfilled").length,
          failed: expired.length,
          native_sent: fcm.sent,
          native_failed: fcm.failed,
          native_skipped: fcm.skipped,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All other actions require auth
    const user = await getUserFromRequest(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store a native push token (FCM/APNS) for this user/device.
    if (action === "native-subscribe") {
      const { token, platform } = await req.json();

      if (!token || typeof token !== "string") {
        return new Response(JSON.stringify({ error: "Missing token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (platform !== "android" && platform !== "ios") {
        return new Response(JSON.stringify({ error: "Invalid platform" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("device_push_tokens").upsert(
        {
          user_id: user.id,
          token,
          platform,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" }
      );

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "native-unsubscribe") {
      const { token } = await req.json();
      if (!token || typeof token !== "string") {
        return new Response(JSON.stringify({ error: "Missing token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin
        .from("device_push_tokens")
        .delete()
        .eq("user_id", user.id)
        .eq("token", token);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "subscribe") {
      const { subscription } = await req.json();
      const { endpoint, keys: subKeys } = subscription;

      await supabaseAdmin.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh: subKeys.p256dh,
          auth: subKeys.auth,
        },
        { onConflict: "user_id,endpoint" }
      );

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unsubscribe") {
      const { endpoint } = await req.json();
      await supabaseAdmin
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("endpoint", endpoint);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Push notification error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
