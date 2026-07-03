import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function clientFor(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description:
    "Return the signed-in SquashHub user's basic profile and club memberships.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = clientFor(ctx);
    const userId = ctx.getUserId();

    const [{ data: profile }, { data: members }] = await Promise.all([
      supabase.from("profiles").select("id, first_name, last_name, email").eq("id", userId!).maybeSingle(),
      supabase
        .from("club_members")
        .select("id, club_id, first_name, last_name, role, ladder_position, clubs(name)")
        .eq("user_id", userId!),
    ]);

    const payload = {
      user_id: userId,
      email: ctx.getUserEmail(),
      profile,
      clubs: members ?? [],
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
