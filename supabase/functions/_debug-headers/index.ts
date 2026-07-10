// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

Deno.serve((req) => {
  const dump: Record<string, string> = {};
  req.headers.forEach((v, k) => { dump[k] = k.toLowerCase().includes("auth") || k.toLowerCase()==="apikey" ? v.slice(0,20)+"..." : v; });
  return new Response(JSON.stringify({ headers: dump }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
