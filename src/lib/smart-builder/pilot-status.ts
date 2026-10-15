/** The retired Riverside row/canvas pilot must not be revived by stale flags. */
export const retiredStructurePilotFlag = (clubId: string, enabled: boolean): boolean =>
  clubId !== "11111111-1111-1111-1111-111111111111" && enabled;