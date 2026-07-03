import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import getLadderTool from "./tools/get-ladder";
import listUpcomingBookingsTool from "./tools/list-upcoming-bookings";
import listRecentMatchesTool from "./tools/list-recent-matches";

// The OAuth issuer MUST be the direct Supabase host, built from the project ref.
// See @lovable.dev/mcp-js docs — SUPABASE_URL is the Cloud proxy and would be rejected.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "squashhub-mcp",
  title: "SquashHub",
  version: "0.1.0",
  instructions:
    "Tools for a SquashHub club: read the signed-in user's profile and clubs, view a club's ladder, list upcoming bookings, and list recent matches. All queries run under the user's row-level security scope.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, getLadderTool, listUpcomingBookingsTool, listRecentMatchesTool],
});
