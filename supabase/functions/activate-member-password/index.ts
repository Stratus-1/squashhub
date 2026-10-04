// activate-member-password
// ------------------------------------------------------------
// Personal-activation-link + password route for an EXISTING club member.
// A valid single-use personal link was delivered to the email held on the
// membership, so using it proves control of that address: we create the login
// with the email pre-confirmed (no second verification email). The client then
// signs in and calls claim_member_activation, which links the existing
// club_members row (no new member/person rows are created here).
//
// Body: { token: string, password: string }
// Returns: { status: "created" | "already_registered" | "invalid" | "expired" |
//            "revoked" | "claimed" | "no_email" | "weak_password" | "error" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ status: "error" }, 400); }
  const token = String(body?.token || "");
  const password = String(body?.password || "");
  if (password.length < 8) return json({ status: "weak_password" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: info, error: rErr } = await admin.rpc("resolve_member_activation", { _token: token });
  if (rErr) { console.error("resolve failed", rErr.message); return json({ status: "error" }); }
  const status = (info as any)?.status;
  if (status !== "valid") return json({ status: status || "invalid" });
  const email = String((info as any)?.email || "").trim().toLowerCase();
  if (!email) return json({ status: "no_email" });

  const { error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cErr) {
    if (/already|registered|exists/i.test(cErr.message)) return json({ status: "already_registered" });
    console.error("createUser failed", cErr.message);
    return json({ status: "error", message: cErr.message });
  }
  return json({ status: "created" });
});
