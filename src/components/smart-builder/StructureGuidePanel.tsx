import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Lightbulb } from "lucide-react";
import { evaluateStructures, type GuideAnswers, type GuideOutcome, type GuideStrength, type GuideTime, type StructureOption } from "@/lib/smart-builder/structure-guide";

function Pick({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("rounded-lg border p-3 text-left transition-colors", active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50")}>
      <div className="text-sm font-semibold">{title}</div><div className="text-xs text-muted-foreground">{desc}</div>
    </button>
  );
}
const H = ({ n, t, h }: { n: number; t: string; h: string }) => <div><h3 className="text-sm font-semibold">{n}. {t}</h3><p className="text-xs text-muted-foreground">{h}</p></div>;

export function RecommendationCard({ cat, n, unit, options, applied, current, onUse, onOther, note }: {
  cat: string; n: number; unit: string; options: StructureOption[]; applied: boolean; current?: string; onUse: (o: StructureOption) => void; onOther: () => void; note?: string;
}) {
  const [best, alt] = options;
  if (!best) return null;
  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid={`guide-card-${cat}`}>
      <div className="text-sm font-semibold">{cat} — {note ?? "expected"} {n} {unit}</div>
      <div className="text-sm"><span className="text-muted-foreground">Recommended: </span><span className="font-semibold">{best.title}</span></div>
      <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Why: </span>{best.why}</p>
      <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Approximate demand: </span>
        {best.rounds} preliminary round{best.rounds === 1 ? "" : "s"}{best.playoffRounds ? ` + ${best.playoffRounds} playoff round${best.playoffRounds === 1 ? "" : "s"}` : ""} · about {best.matches} matches · {best.perPlayer}</p>
      {alt && <p className="text-xs text-muted-foreground">Next best: {alt.title} — {alt.rounds + alt.playoffRounds} rounds, about {alt.matches} matches.</p>}
      {current && <p className="text-xs text-muted-foreground">Currently planned: {current}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" size="sm" variant={applied ? "secondary" : "default"} onClick={() => onUse(best)}>{applied ? "Recommendation in use" : "Use recommendation"}</Button>
        <Button type="button" size="sm" variant="outline" onClick={onOther}>Choose another format</Button>
      </div>
    </div>
  );
}

export function StructureGuidePanel({ cats, guide, onChange, isChamps, unitOf, currentOf, onUse, onOther }: {
  cats: string[]; guide: GuideAnswers; onChange: (g: GuideAnswers) => void; isChamps: boolean;
  unitOf: (cat: string) => string; currentOf: (cat: string) => string | undefined;
  onUse: (cat: string, o: StructureOption) => void; onOther: () => void;
}) {
  const set = (p: Partial<GuideAnswers>) => onChange({ ...guide, ...p });
  const ready = guide.knowsEntries === true && cats.some((c) => Number(guide.expected?.[c]) >= 2);
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Let's plan a sensible competition structure</h3>
        <p className="text-sm text-muted-foreground">A few quick questions so SquashHub can suggest how each category could be run. This is guidance only — nothing is fixed, and match format (how a single match is scored) stays separate.</p>
      </div>

      <div className="space-y-2">
        <H n={1} t="Do you have a fair idea of how many entries to expect?" h="An estimate, not a commitment — you'll review it once real entries are known." />
        <div className="grid gap-2 sm:grid-cols-2">
          <Pick active={guide.knowsEntries === true} onClick={() => set({ knowsEntries: true })} title="Yes, roughly" desc="Enter an approximate number per category." />
          <Pick active={guide.knowsEntries === false} onClick={() => set({ knowsEntries: false })} title="Not yet" desc="Skip — we'll recommend once entries come in." />
        </div>
        {guide.knowsEntries === true && <div className="space-y-2">{cats.map((c) => (
          <div key={c} className="flex items-center gap-2">
            <span className="w-48 truncate text-sm">{c}</span>
            <Input type="number" min={2} className="max-w-[110px]" aria-label={`Approximate entries for ${c}`} placeholder="e.g. 12" value={guide.expected?.[c] ?? ""}
              onChange={(e) => set({ expected: { ...(guide.expected ?? {}), [c]: e.target.value } })} />
            <span className="text-xs text-muted-foreground">~ {unitOf(c)} (estimate)</span>
          </div>))}</div>}
      </div>

      <div className="space-y-2">
        <H n={2} t="What do you want from the competition?" h={isChamps ? "For Club Championships, ranking the field meaningfully is often the main goal." : "This shapes how many matches people get."} />
        <div className="grid gap-2 sm:grid-cols-3">
          {([["winner", "Find a champion efficiently", "Fewest matches to a clear winner."], ["rank", "Rank the field meaningfully", "Every finishing position means something afterwards."], ["balanced", "Balanced", "A winner, plus meaningful competitive matches for everyone."]] as [GuideOutcome, string, string][])
            .map(([k, t, d]) => <Pick key={k} active={guide.outcome === k} onClick={() => set({ outcome: k })} title={t} desc={d} />)}
        </div>
      </div>

      <div className="space-y-2">
        <H n={3} t="Who should players mostly play against?" h="Broad play gives a fairer overall table; similar-strength matching gives closer, more competitive games." />
        <div className="grid gap-2 sm:grid-cols-2">
          {([["broad", "Many / most of the group", "Players meet a wide range of opponents."], ["similar", "Opponents of similar strength", "As the event goes on, players meet others on similar results."]] as [GuideStrength, string, string][])
            .map(([k, t, d]) => <Pick key={k} active={guide.strength === k} onClick={() => set({ strength: k })} title={t} desc={d} />)}
        </div>
      </div>

      <div className="space-y-2">
        <H n={4} t="How much time / match capacity do you have?" h="Broad planning only — actual dates, rounds and courts are set later in scheduling. Think about how often a player can reasonably play." />
        <div className="grid gap-2 sm:grid-cols-3">
          {([["plenty", "Plenty / flexible", "Players can play many matches."], ["some", "Some limitations", "A moderate number of rounds."], ["tight", "Very limited", "Need fewer matches per player."]] as [GuideTime, string, string][])
            .map(([k, t, d]) => <Pick key={k} active={guide.time === k} onClick={() => set({ time: k })} title={t} desc={d} />)}
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-primary" />Recommendations (advisory)</div>
        {!ready
          ? <p className="text-xs text-muted-foreground">{guide.knowsEntries === false ? "No estimate yet — SquashHub will suggest a structure once players are picked or registered. You can still plan a format yourself in the next steps." : "Enter approximate entries above to see a recommendation for each category."}</p>
          : <>
            {cats.map((c) => {
              const n = Number(guide.expected?.[c]) || 0;
              if (n < 2) return null;
              const opts = evaluateStructures({ n, outcome: guide.outcome, strength: guide.strength, time: guide.time, isChamps });
              return <RecommendationCard key={c} cat={c} n={n} unit={unitOf(c)} options={opts} applied={!!guide.applied?.[c] && guide.applied[c] === opts[0]?.kind} current={currentOf(c)} onUse={(o) => onUse(c, o)} onOther={onOther} />;
            })}
            <p className="text-xs text-muted-foreground">If pools are recommended, the next step lets you split categories into subcategories (e.g. A/B/C by strength), and Planned format lets you set pools within each group. Nothing is generated until real entries are confirmed.</p>
          </>}
      </div>
    </div>
  );
}
