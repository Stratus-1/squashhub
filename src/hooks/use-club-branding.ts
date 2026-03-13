import { useMyClub } from "@/hooks/use-club";

/**
 * Returns the club name for use in page titles (browser tabs).
 * Falls back to "SquashHub" when no club is found.
 */
export function useClubName(): string {
  const { data } = useMyClub();
  return data?.club?.name || "SquashHub";
}
