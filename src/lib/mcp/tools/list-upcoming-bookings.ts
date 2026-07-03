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
  name: "list_upcoming_bookings",
  title: "List upcoming bookings",
  description:
    "List the signed-in user's upcoming court bookings on SquashHub, ordered by start time.",
  inputSchema: {
    days_ahead: z.number().int().min(1).max(90).optional().describe("How many days ahead to look (default 14)."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days_ahead, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = clientFor(ctx);
    const userId = ctx.getUserId()!;
    const now = new Date();
    const until = new Date(now.getTime() + (days_ahead ?? 14) * 86_400_000);

    const { data, error } = await supabase
      .from("bookings")
      .select("id, club_id, court_id, start_time, end_time, status, booked_by, opponent_name, courts(name)")
      .eq("booked_by", userId)
      .gte("start_time", now.toISOString())
      .lte("start_time", until.toISOString())
      .order("start_time", { ascending: true })
      .limit(limit ?? 25);

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ bookings: data }, null, 2) }],
      structuredContent: { bookings: data ?? [] },
    };
  },
});
