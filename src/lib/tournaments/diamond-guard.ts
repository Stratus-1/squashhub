import { fromExt } from "@/lib/supabase-ext";

/** A Diamond event retains its own fixtures, results, standings and management. */
export async function isDiamondTournament(tournamentId: string): Promise<boolean> {
  const { data, error } = await fromExt("team_league_events")
    .select("id").eq("tournament_id", tournamentId).limit(1).maybeSingle();
  if (error) throw error; // Fail closed: never run a generic generator if the lookup failed.
  return !!data;
}

export async function assertNotDiamondTournament(tournamentId: string): Promise<void> {
  if (await isDiamondTournament(tournamentId)) {
    throw new Error("Diamond League uses its existing tournament management and standings.");
  }
}