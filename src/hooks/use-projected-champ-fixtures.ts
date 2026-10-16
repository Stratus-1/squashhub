import { useQuery, useQueries } from "@tanstack/react-query";
import { loadProjectedFixtures, type ProjectedChampFixture } from "@/lib/tournaments/decided-swiss";

export type { ProjectedChampFixture };

/** Read-only next-round Swiss pairings (same projection the court grid shows). Never writes. */
export function useProjectedChampFixtures(champ: any) {
  return useQuery({
    queryKey: ["projected-champ-fixtures", champ?.id],
    enabled: !!champ?.id && !!champ?.club_id,
    staleTime: 60_000,
    queryFn: () => loadProjectedFixtures(champ),
  });
}

/** Same projection for several tournaments at once (Tournaments page list). */
export function useProjectedFixturesForChamps(champs: any[]): ProjectedChampFixture[] {
  const results = useQueries({
    queries: (champs ?? []).filter((c) => c?.id && c?.club_id).map((champ) => ({
      queryKey: ["projected-champ-fixtures", champ.id],
      staleTime: 60_000,
      queryFn: () => loadProjectedFixtures(champ),
    })),
  });
  return results.flatMap((r) => (r.data as ProjectedChampFixture[] | undefined) ?? []);
}
