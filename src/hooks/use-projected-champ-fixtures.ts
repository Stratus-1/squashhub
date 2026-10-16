import { useQuery, useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { projectCourtFixtures, type ProjectedCourtFixture } from "@/lib/tournaments/projected-court-fixtures";

export type ProjectedChampFixture = ProjectedCourtFixture & { courtName: string };

/** Read-only next-round Swiss pairings (same projection the court grid shows). Never writes. */
export function useProjectedChampFixtures(champ: any) {
  return useQuery({
    queryKey: ["projected-champ-fixtures", champ?.id],
    enabled: !!champ?.id && !!champ?.club_id,
    staleTime: 60_000,
    queryFn: () => loadProjected(champ),
  });
}

async function loadProjected(champ: any): Promise<ProjectedChampFixture[]> {
  {
      const sb = supabase as any;
      const [courts, arch, entries, matches, rounds] = await Promise.all([
        sb.from("courts").select("id, name, active").eq("club_id", champ.club_id).order("id"),
        sb.from("tournaments").select("builder_architecture,builder_spec,beta_lifecycle,start_time,end_time,match_duration_minutes,default_break_minutes,court_ids").eq("id", champ.id).maybeSingle(),
        sb.from("club_champs_entries").select("*, club_members:club_member_id(id, name)").eq("champ_id", champ.id),
        sb.from("club_champs_matches").select("*, player_a:player_a_member_id(name), player_b:player_b_member_id(name)").eq("champ_id", champ.id),
        sb.from("club_champs_rounds").select("*").eq("champ_id", champ.id),
      ]);
      const active = ((courts.data ?? []) as any[]).filter((c) => c.active !== false);
      const name = (id: number) => active.find((c) => Number(c.id) === id)?.name ?? `Court ${id}`;
      try {
        return projectCourtFixtures({ champ, arch: arch.data, entries: entries.data ?? [], matches: matches.data ?? [], rounds: rounds.data ?? [], courts: active })
          .map((f) => ({ ...f, courtName: name(f.courtId) }))
          .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      } catch { return []; }
  }
}

/** Same projection for several tournaments at once (Tournaments page list). */
export function useProjectedFixturesForChamps(champs: any[]): ProjectedChampFixture[] {
  const results = useQueries({
    queries: (champs ?? []).filter((c) => c?.id && c?.club_id).map((champ) => ({
      queryKey: ["projected-champ-fixtures", champ.id],
      staleTime: 60_000,
      queryFn: () => loadProjected(champ),
    })),
  });
  return results.flatMap((r) => (r.data as ProjectedChampFixture[] | undefined) ?? []);
}
