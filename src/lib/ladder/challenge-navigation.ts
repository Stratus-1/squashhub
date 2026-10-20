type ChallengePlayer = { id: string; club_member_id: string; user_id: string | null };

/** Explicit member identity must win over shared-login compatibility lookup. */
export function resolveChallengeTarget<T extends ChallengePlayer>(players: T[], target: string): T | undefined {
  return players.find((player) => player.club_member_id === target)
    ?? players.find((player) => player.id === target)
    ?? players.find((player) => player.user_id === target);
}