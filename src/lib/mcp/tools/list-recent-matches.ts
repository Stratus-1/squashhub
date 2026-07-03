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
  name: "list_recent_matches",
  title: "List recent matches",
  description:
    "List the signed-in user's most recent SquashHub matches with scores and opponents.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Max rows (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = clientFor(ctx);
    const userId = ctx.getUserId()!;

    // Resolve member rows for this user, then look up matches by member id
    const { data: members } = await supabase
      .from("club_members")
      .select("id, club_id")
      .eq("user_id", userId);
    const memberIds = (members ?? []).map((m: any) => m.id);
    if (memberIds.length === 0) {
      return {
        content: [{ type: "text", text: JSON.stringify({ matches: [] }) }],
        structuredContent: { matches: [] },
      };
    }

    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .or(memberIds.map((id) => `player_a_id.eq.${id},player_b_id.eq.${id}`).join(","))
      .order("played_at", { ascending: false })
      .limit(limit ?? 10);

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ matches: data }, null, 2) }],
      structuredContent: { matches: data ?? [] },
    };
  },
});
