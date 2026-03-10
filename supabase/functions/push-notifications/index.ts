import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import webpush from "web-push";

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
  data?: Record<string, unknown>;
}) {
  const serverKey = Deno.env.get("FCM_SERVER_KEY");
  if (!serverKey) return { sent: 0, failed: 0, skipped: true };

  const { data: tokens } = await supabaseAdmin
    .from("device_push_tokens")
    .select("id, token")
    .eq("user_id", args.targetUserId)
    .eq("platform", "android");

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
          android_channel_id: "gb_alerts",
        },
        data: {
          url: args.url || "/notifications",
          tag: args.tag || "gb-squash-notification",
          title: args.title,
          body: args.body,
          ...(args.data || {}),
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

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textToBase64Url(s: string) {
  return toBase64Url(new TextEncoder().encode(s));
}

function pemToArrayBuffer(pem: string) {
  const cleaned = pem
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "")
    .trim();
  const raw = atob(cleaned);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

// WebCrypto ECDSA signatures are typically DER encoded; JWT expects JOSE (raw r|s).
function derToJose(derSig: Uint8Array, keySizeBits = 256) {
  const keySizeBytes = Math.ceil(keySizeBits / 8);
  if (derSig[0] !== 0x30) throw new Error("Invalid DER signature");

  let offset = 2;
  if (derSig[1] & 0x80) {
    const lenBytes = derSig[1] & 0x7f;
    offset = 2 + lenBytes;
  }

  if (derSig[offset] !== 0x02) throw new Error("Invalid DER signature");
  const rLen = derSig[offset + 1];
  const rStart = offset + 2;
  const r = derSig.slice(rStart, rStart + rLen);
  offset = rStart + rLen;

  if (derSig[offset] !== 0x02) throw new Error("Invalid DER signature");
  const sLen = derSig[offset + 1];
  const sStart = offset + 2;
  const s = derSig.slice(sStart, sStart + sLen);

  const rOut = new Uint8Array(keySizeBytes);
  const sOut = new Uint8Array(keySizeBytes);

  // Left-pad with zeros; if longer, trim leading zeros.
  rOut.set(r.slice(Math.max(0, r.length - keySizeBytes)), Math.max(0, keySizeBytes - r.length));
  sOut.set(s.slice(Math.max(0, s.length - keySizeBytes)), Math.max(0, keySizeBytes - s.length));

  const out = new Uint8Array(keySizeBytes * 2);
  out.set(rOut, 0);
  out.set(sOut, keySizeBytes);
  return out;
}

let apnsKeyCache: CryptoKey | null = null;
let apnsJwtCache: { token: string; iat: number } | null = null;

async function getApnsJwt() {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const privateKeyPem = Deno.env.get("APNS_PRIVATE_KEY");
  if (!keyId || !teamId || !privateKeyPem) return null;

  const now = Math.floor(Date.now() / 1000);
  if (apnsJwtCache && now - apnsJwtCache.iat < 50 * 60) return apnsJwtCache.token;

  if (!apnsKeyCache) {
    apnsKeyCache = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(privateKeyPem),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  }

  const header = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: now };
  const unsigned = `${textToBase64Url(JSON.stringify(header))}.${textToBase64Url(JSON.stringify(payload))}`;
  const sigDer = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, apnsKeyCache, new TextEncoder().encode(unsigned))
  );
  const sigJose = derToJose(sigDer, 256);
  const jwt = `${unsigned}.${toBase64Url(sigJose)}`;

  apnsJwtCache = { token: jwt, iat: now };
  return jwt;
}

async function sendApnsToUser(args: {
  targetUserId: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}) {
  const bundleId = Deno.env.get("APNS_BUNDLE_ID");
  const useSandbox = (Deno.env.get("APNS_USE_SANDBOX") || "").toLowerCase() === "true";
  if (!bundleId) return { sent: 0, failed: 0, skipped: true };

  const jwt = await getApnsJwt();
  if (!jwt) return { sent: 0, failed: 0, skipped: true };

  const { data: tokens } = await supabaseAdmin
    .from("device_push_tokens")
    .select("id, token")
    .eq("user_id", args.targetUserId)
    .eq("platform", "ios");

  const deviceTokens = (tokens || []).map((t) => ({ id: t.id as string, token: String(t.token || "").replace(/\s+/g, "") })).filter((t) => t.token);
  if (deviceTokens.length === 0) return { sent: 0, failed: 0, skipped: false };

  const host = useSandbox ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  let sent = 0;
  let failed = 0;
  const invalidIds: string[] = [];

  for (const t of deviceTokens) {
    const res = await fetch(`${host}/3/device/${t.token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        aps: {
          alert: { title: args.title, body: args.body },
          sound: "default",
        },
        url: args.url || "/notifications",
        tag: args.tag || "gb-squash-notification",
        ...(args.data || {}),
      }),
    });

    if (res.status === 200) {
      sent += 1;
      continue;
    }

    failed += 1;
    if (res.status === 410 || res.status === 400) {
      const body = await res.json().catch(() => null);
      const reason = body?.reason as string | undefined;
      if (res.status === 410 || reason === "BadDeviceToken" || reason === "Unregistered") {
        invalidIds.push(t.id);
      }
    }
  }

  if (invalidIds.length > 0) {
    await supabaseAdmin.from("device_push_tokens").delete().in("id", invalidIds);
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

      const { targetUserId, title, body, url: notifUrl, icon, tag, data: extraData } = await req.json();

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
        data: extraData || {},
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
        data: extraData || {},
      });

      const apns = await sendApnsToUser({
        targetUserId,
        title,
        body,
        url: notifUrl || "/notifications",
        tag,
        data: extraData || {},
      });

      return new Response(
        JSON.stringify({
          sent: results.filter((r) => r.status === "fulfilled").length,
          failed: expired.length,
          native_sent: fcm.sent,
          native_failed: fcm.failed,
          native_skipped: fcm.skipped,
          ios_sent: apns.sent,
          ios_failed: apns.failed,
          ios_skipped: apns.skipped,
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
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
