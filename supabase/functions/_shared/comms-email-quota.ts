export const NOMINATION_EMAILS_PER_HOUR = 30;
export function nominationQuotaApplies(clubId: string, purpose: unknown): boolean {
  return clubId === "e41098d4-9b19-4fc0-a082-d43ac13ff32b" && purpose === "agm_nominations";
}
export function emailQuotaDecision(attempts: number[], now: number) {
  const recent = attempts.filter((at) => at > now - 3_600_000);
  return recent.length < NOMINATION_EMAILS_PER_HOUR
    ? { allowed: true, retryAt: null }
    : { allowed: false, retryAt: Math.min(...recent) + 3_600_000 };
}