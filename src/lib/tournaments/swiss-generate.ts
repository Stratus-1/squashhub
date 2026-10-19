import { commitStructured, supabaseDb } from "./structured-db";
import { atomically, insertFixtures, loadEntrants, persistStructure, toFixtureRow } from "./structured-persist";
import { nextSwissRound, type TournamentSpec } from "./engine-service";
import { assertNotDiamondTournament } from "./diamond-guard";

/**
 * Creates the next Swiss round for ONE division from the latest results (engine `nextSwissRound`
 * refuses unless the gate is ready). Server-side, `guard_swiss_round_progression` blocks
 * out-of-order/over-limit rounds and `guard_structured_stage_round_once` blocks a duplicate round.
 */
export async function generateNextSwissRound(champId: string, spec: TournamentSpec, divisionIndex: number, stageId: string, matches: any[]) {
  await assertNotDiamondTournament(champId);
  const d = spec.divisions[divisionIndex];
  await atomically(supabaseDb, champId, commitStructured, async (db) => {
    const full = await loadEntrants(db, champId, spec);
    const div = full.divisions[divisionIndex];
    const rows = matches.filter((m) => m.group_number === divisionIndex + 1)
      .map((m) => toFixtureRow(d.divisionId, m, d.stages.find((x) => x.id === m.stage_key)?.kind ?? "swiss"));
    const next = nextSwissRound(champId, div, stageId, rows);
    await insertFixtures(db, champId, full, await persistStructure(db, champId, full), next, rows);
  });
}
