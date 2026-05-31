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
  const allowedHttpsHosts = [
    "squashhub.co.za",
    "squashhub.lovable.app",
    "84cdc7bd-c950-4776-9fb1-c29f6232816d.lovableproject.com",
    "id-preview--84cdc7bd-c950-4776-9fb1-c29f6232816d.lovable.app",
  ];

  const isAllowed =
    parsed.protocol === "gbsquash:" ||
    (parsed.protocol === "https:" && allowedHttpsHosts.includes(parsed.hostname));

  if (!isAllowed) throw new Error("Unsafe return target");
  if (sessionId) parsed.searchParams.set("yoco_session", sessionId);
  return parsed.toString();
}