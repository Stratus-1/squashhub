import { useProjectedChampFixtures } from "@/hooks/use-projected-champ-fixtures";
import { getGroupLabel } from "@/lib/tournament-formats/group-labels";

/** Read-only next-round Swiss pairings (same as Court Bookings) for one tournament. */
function ChampProjected({ champ }: { champ: any }) {
  const { data = [] } = useProjectedChampFixtures(champ);
  if (!data.length) return null;
  const rounds = [...new Set(data.map((f) => f.round))].sort((a, b) => a - b);
  return (
    <>
      {rounds.map((rd) => (
        <section key={`${champ.id}-${rd}`} className="space-y-1.5" data-testid="projected-upcoming-fixtures">
          <div className="flex items-center justify-between border-b pb-1">
            <h4 className="text-sm font-semibold">{champ.name} · Round {rd}</h4>
            <span className="text-xs text-muted-foreground">Pairings set by results</span>
          </div>
          {data.filter((f) => f.round === rd).map((f) => (
            <div key={f.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
              <span className="font-medium">{f.title}<span className="ml-2 text-xs text-muted-foreground">{getGroupLabel(champ, f.group)}</span></span>
              <span className="text-xs text-muted-foreground tabular-nums">{f.date} {f.time} · {f.courtName}</span>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

export function ProjectedSwissFixtures({ champs }: { champs: any[] }) {
  return <div className="mt-4 space-y-4">{champs.map((c) => <ChampProjected key={c.id} champ={c} />)}</div>;
}
