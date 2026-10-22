import { IntegrityError } from "./contract";

export const EXISTING_UITSIG_TOURNAMENT_IDS: ReadonlySet<string> = new Set(["f954222a-0f0a-4d8c-ac7b-9c74042cc69e"]);
export const SWISS_SEQUENCING_PROSPECTIVE_FROM = "2026-10-22T18:41:00Z";
export interface SwissSequencingPolicy { version: 1; tournamentId: string; createdAt: string }

export function isFrozenUitsigTournament(id: string | null | undefined): boolean {
  return !!id && EXISTING_UITSIG_TOURNAMENT_IDS.has(id);
}
export function assertTournamentPairingWritable(id: string) {
  if (isFrozenUitsigTournament(id)) throw new IntegrityError("uitsig_frozen", "This existing Uitsig tournament is protected. Pairings, stages and fixtures must remain unchanged.");
}
/** Fail closed: no adoption during viewing, saving an old setup or an old draw/rebuild.
 * The ID must match the actual tournament, not another tournament's copied policy. */
export function swissSequencingEnabled(policy: SwissSequencingPolicy | null | undefined, tournamentId: string | null | undefined): boolean {
  return !!policy && policy.version === 1 && !!tournamentId && !isFrozenUitsigTournament(tournamentId)
    && policy.tournamentId === tournamentId && Number.isFinite(Date.parse(policy.createdAt))
    && Date.parse(policy.createdAt) > Date.parse(SWISS_SEQUENCING_PROSPECTIVE_FROM);
}
export function prospectiveSwissPolicy(id: string, createdAt: string): SwissSequencingPolicy | undefined {
  const policy: SwissSequencingPolicy = { version: 1, tournamentId: id, createdAt };
  return swissSequencingEnabled(policy, id) ? policy : undefined;
}