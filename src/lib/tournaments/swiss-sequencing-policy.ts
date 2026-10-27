import { IntegrityError } from "./contract";

// Uitsig freeze lifted 27 Oct 2026 (Willem): the club takes normal automatic generation from now
// on; a dated CSV backup of fixtures and logs exists at /mnt/documents/uitsig-fixture-backup-2026-10-27.
export const SWISS_SEQUENCING_PROSPECTIVE_FROM = "2026-10-22T18:41:00Z";
export interface SwissSequencingPolicy { version: 1; tournamentId: string; createdAt: string }

export function isFrozenUitsigTournament(_id: string | null | undefined): boolean {
  return false;
}
export function assertTournamentPairingWritable(_id: string) {
  // No frozen tournaments remain.
}
/** Fail closed: no adoption during viewing, saving an old setup or an old draw/rebuild.
 * The ID must match the actual tournament, not another tournament's copied policy. */
export function swissSequencingEnabled(policy: SwissSequencingPolicy | null | undefined, tournamentId: string | null | undefined): boolean {
  return !!policy && policy.version === 1 && !!tournamentId
    && policy.tournamentId === tournamentId && Number.isFinite(Date.parse(policy.createdAt))
    && Date.parse(policy.createdAt) > Date.parse(SWISS_SEQUENCING_PROSPECTIVE_FROM);
}
export function prospectiveSwissPolicy(id: string, createdAt: string): SwissSequencingPolicy | undefined {
  const policy: SwissSequencingPolicy = { version: 1, tournamentId: id, createdAt };
  return swissSequencingEnabled(policy, id) ? policy : undefined;
}