import type { DiamondTeam } from "@/lib/tournaments/team-league";

export const participantFields = ["player_a_member_id", "player_b_member_id", "partner_a_member_id", "partner_b_member_id"] as const;
export type ParticipantField = typeof participantFields[number];
export type ParticipantIds = Record<ParticipantField, string | null>;

/** A changed team slot is a substitution, not a retroactive change to played games. */
export function diamondSlotReplacements(previous: DiamondTeam[], current: DiamondTeam[]): Map<string, string | null> {
  const changed = new Map<string, string | null>();
  for (const team of current) {
    const old = previous.find((item) => item.id === team.id);
    old?.players.forEach((id, index) => {
      if (id && id !== (team.players[index] ?? null)) changed.set(id, team.players[index] ?? null);
    });
  }
  return changed;
}

/** Preserve a started tie's singles and seeded doubles order; replace only its departing players in pending rows. */
export function diamondPendingParticipantPatch(
  saved: ParticipantIds,
  expected: ParticipantIds,
  startedTie: boolean,
  replacements: Map<string, string | null>,
): Partial<ParticipantIds> {
  const patch: Partial<ParticipantIds> = {};
  for (const field of participantFields) {
    const next = startedTie ? (saved[field] && replacements.has(saved[field]) ? replacements.get(saved[field]) ?? null : saved[field]) : expected[field];
    if (saved[field] !== next) patch[field] = next;
  }
  return patch;
}