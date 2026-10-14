import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/** One row per category/subcategory (stable unit key, e.g. "Mens::A"). */
export type SwissCategoryRow = {
  key: string; label: string; entrants: number; entrantsGuessed: boolean;
  isSwiss: boolean; formatName: string; selected: number | null; ownSetting: boolean;
};

/** Suggested rounds = enough rounds for one clear winner (ceil log2 N); null without entrants. */
export const suggestedSwissRounds = (n: number) => (n >= 2 ? Math.ceil(Math.log2(n)) : null);

/**
 * Riverside pilot (`tournament_swiss_category_rounds`): see and edit each Swiss category's own
 * round count. Non-Swiss categories are listed read-only and never changed. Saving writes only the
 * category's own setup override (by stable key); it never touches a live draw or results.
 */
export function SwissCategoryRoundsPanel({ rows, onChange, liveDraw }: {
  rows: SwissCategoryRow[]; onChange: (key: string, rounds: number) => void; liveDraw: boolean;
}) {
  if (!rows.some((r) => r.isSwiss)) return null;
  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid="swiss-category-rounds">
      <div className="flex items-center gap-2 text-sm font-semibold">Swiss rounds per category <Badge variant="outline">Pilot</Badge></div>
      <p className="text-xs text-muted-foreground">Each category keeps its own number of rounds.{liveDraw ? " The draw already exists: changing a number here updates the setup only — the live Swiss stage is changed separately in Manage Tournament, and no results are touched." : ""}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2">Category</th><th className="pr-2">Format</th><th className="pr-2">Entrants</th><th className="pr-2">Suggested</th><th className="pr-2">Rounds</th><th className="pr-2">Matches</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const sug = suggestedSwissRounds(r.entrants);
              const max = r.entrants > 1 ? (r.entrants % 2 ? r.entrants : r.entrants - 1) : null;
              const over = r.selected != null && max != null && r.selected > max;
              return (
                <tr key={r.key} className="border-t border-border">
                  <td className="py-1 pr-2 font-medium">{r.label}</td>
                  <td className="pr-2">{r.formatName}</td>
                  <td className="pr-2">{r.entrants || "—"}{r.entrantsGuessed ? " (expected)" : ""}</td>
                  <td className="pr-2">{r.isSwiss ? sug ?? "—" : "—"}</td>
                  <td className="pr-2">
                    {r.isSwiss ? (
                      <Input type="number" min={1} className="h-7 w-20" aria-label={`Swiss rounds for ${r.label}`}
                        value={r.selected ?? ""} placeholder={sug ? String(sug) : ""}
                        onChange={(e) => { const n = Math.floor(Number(e.target.value)); if (n >= 1) onChange(r.key, n); }} />
                    ) : <span className="text-muted-foreground">Not Swiss — unchanged</span>}
                    {over && <div className="text-destructive">Max {max} for {r.entrants} entrants</div>}
                    {r.isSwiss && sug != null && r.selected != null && r.selected > sug && !over && <div className="text-muted-foreground">Above suggestion — repeat opponents more likely</div>}
                  </td>
                  <td className="pr-2">{r.isSwiss && r.selected ? Math.floor(r.entrants / 2) * r.selected || "—" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
