const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("target") || "gbsquash://my-account";
    const sessionId = url.searchParams.get("yoco_session");
    const redirectTo = buildSafeRedirect(target, sessionId);

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: redirectTo,
      },
    });
  } catch (e) {
    console.error("yoco-payment-return error:", e);
    return new Response("Could not return to app", { status: 400, headers: corsHeaders });
  }
});

function buildSafeRedirect(target: string, sessionId: string | null) {
  const parsed = new URL(target);
  const allowedSuffixes = [
    "squashhub.co.za",
    "squashhub.lovable.app",
    "lovableproject.com",
    "lovable.app",
  ];
  const host = parsed.hostname.toLowerCase();
  const hostAllowed = allowedSuffixes.some(
    (s) => host === s || host.endsWith("." + s),
  );

  const isAllowed =
    parsed.protocol === "gbsquash:" ||
    (parsed.protocol === "https:" && hostAllowed);

  if (!isAllowed) {
    console.error("yoco-payment-return rejected target", { target, host, protocol: parsed.protocol });
    throw new Error("Unsafe return target");
  }
  if (sessionId) parsed.searchParams.set("yoco_session", sessionId);
  return parsed.toString();
}