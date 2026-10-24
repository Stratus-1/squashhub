/** Unknown availability must never enable a new application. */
export function mayApplyForMembership(availability: unknown): boolean {
  return availability === true;
}