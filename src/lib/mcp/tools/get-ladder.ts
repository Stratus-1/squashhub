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
  name: "get_ladder",
  title: "Get club ladder",
  description:
    "Return the current ladder standings for a SquashHub club. If no club_id is provided, the signed-in user's first club is used.",
  inputSchema: {
    club_id: z.string().uuid().optional().describe("Club UUID. Defaults to the user's club."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ club_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = clientFor(ctx);

    let clubId = club_id;
    if (!clubId) {
      const { data: my } = await supabase
        .from("club_members")
        .select("club_id")
        .eq("user_id", ctx.getUserId()!)
        .limit(1)
        .maybeSingle();
      clubId = my?.club_id;
    }
    if (!clubId) {
      return { content: [{ type: "text", text: "No club found for user." }], isError: true };
    }

    const { data, error } = await supabase
      .from("club_members")
      .select("id, first_name, last_name, ladder_position, skill_rating, gender")
      .eq("club_id", clubId)
      .not("ladder_position", "is", null)
      .order("ladder_position", { ascending: true })
      .limit(limit ?? 50);

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ club_id: clubId, ladder: data }, null, 2) }],
      structuredContent: { club_id: clubId, ladder: data ?? [] },
    };
  },
});
