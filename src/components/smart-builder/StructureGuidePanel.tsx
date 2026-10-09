import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, Lightbulb } from "lucide-react";
import { guideCountText, type GuideEntryCount } from "./guide-entry-counts";
import { evaluateStructures, poolStageText, guideCapacity, shareSlots, capacityFit, DEFAULT_MATCH_MINUTES, STRUCTURE_LABEL, type CapacityFit, type GuideAnswers, type GuideOutcome, type GuideStrength, type StructureOption } from "@/lib/smart-builder/structure-guide";

const FIT_TEXT: Record<CapacityFit, string> = { fits: "Fits", tight: "Tight", exceeds: "Exceeds capacity" };
const fitClass = (f: CapacityFit) => f === "fits" ? "text-primary" : "text-destructive";
const LEGACY_TIME: Record<string, string> = { plenty: "Plenty / flexible", some: "Some limitations", tight: "Very limited" };

/** Per-category recommendations sharing one tournament capacity (actual field when known, else the estimate). */
export function guideRecommendations(cats: string[], guide: GuideAnswers, isChamps: boolean, fieldOf: (c: string) => number) {
  const cap = guideCapacity(guide);
  const fields = Object.fromEntries(cats.map((c) => [c, fieldOf(c)]));
  const shares = cap ? shareSlots(fields, cap.slots) : {};
  const mm = cap?.matchMinutes ?? (Number(guide.matchMinutes) || DEFAULT_MATCH_MINUTES);
  const byCat: Record<string, { n: number; options: StructureOption[]; share: number | null }> = {};
  for (const c of cats) {
    const n = fields[c];
    if (n < 2) continue;
    byCat[c] = { n, share: cap ? shares[c] : null, options: evaluateStructures({ n, outcome: guide.outcome, strength: guide.strength, time: guide.time, isChamps, slots: cap ? shares[c] : null, matchMinutes: mm }) };
  }
  return { cap, byCat, mm };
}

function Pick({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <Button variant="outline" type="button" onClick={onClick} aria-pressed={active} className={cn("h-auto items-start justify-start gap-2 whitespace-normal rounded-lg border p-3 text-left transition-colors hover:bg-muted", active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50")}>
      <span aria-hidden="true" className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", active ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{active && <Check />}</span>
      <span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">{desc}</span></span>
    </Button>
  );
}
const H = ({ n, t, h }: { n: number; t: string; h: string }) => <div><h3 className="text-sm font-semibold">{n}. {t}</h3><p className="text-xs text-muted-foreground">{h}</p></div>;

export function RecommendationCard({ cat, n, unit, options, applied, current, onUse, onOther, note, share, change }: {
  cat: string; n: number; unit: string; options: StructureOption[]; applied: boolean; current?: string; onUse: (o: StructureOption) => void; onOther: () => void; note?: string;
  share?: number | null; change?: string;
}) {
  const [best, alt] = options;
  if (!best) return null;
  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid={`guide-card-${cat}`}>
      <div className="text-sm font-semibold">{cat} — {note ?? "expected"} {n} {unit}</div>
      <div className="text-sm"><span className="text-muted-foreground">Recommended: </span><span className="font-semibold">{best.title}</span></div>
      <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Why: </span>{best.why}</p>
      {change && <p className="rounded bg-primary/10 px-2 py-1 text-xs font-medium">{change}</p>}
      {best.kind === "pools" ? (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p><span className="font-medium text-foreground">{poolStageText(best)}</span> · {best.prelimMatches} pool matches</p>
          <p><span className="font-medium text-foreground">Playoff stage: </span>{best.playoff === "placement" ? "positional playoffs (same finishing place across pools)" : "semifinals & final for qualifiers"} — {best.playoffMatches} matches over {best.playoffRounds} round{best.playoffRounds === 1 ? "" : "s"}</p>
          <p><span className="font-medium text-foreground">Total: </span>about {best.matches} matches · ~{best.courtHours} court-hours · {best.perPlayer}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Approximate demand: </span>
          {best.rounds} round{best.rounds === 1 ? "" : "s"} · about {best.matches} matches · ~{best.courtHours} court-hours · {best.perPlayer}</p>
      )}
      {best.fit && <p className="text-xs"><span className={cn("font-semibold", fitClass(best.fit))}>{FIT_TEXT[best.fit]}</span><span className="text-muted-foreground"> — this category's share is about {share} match slots of the tournament total.</span></p>}
      {alt && <p className="text-xs text-muted-foreground">Next best: {alt.title} — {alt.pools ? `pools of ${alt.pools.join("/")}, ${alt.rounds} rounds per pool + ${alt.playoffRounds} playoff,` : `${alt.rounds} rounds,`} about {alt.matches} matches, ~{alt.courtHours} court-hours{alt.fit ? ` (${FIT_TEXT[alt.fit].toLowerCase()})` : ""}.</p>}
      {current && <p className="text-xs text-muted-foreground">Currently planned: {current}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" size="sm" variant={applied ? "secondary" : "default"} onClick={() => onUse(best)}>{applied ? "Recommendation in use" : "Use recommendation"}</Button>
        <Button type="button" size="sm" variant="outline" onClick={onOther}>Choose another format</Button>
      </div>
    </div>
  );
}

export function StructureGuidePanel({ cats, guide, onChange, isChamps, unitOf, currentOf, onUse, onOther, entryCounts = {}, subcats = {}, countState = "ready", actualOf, review }: {
  cats: string[]; guide: GuideAnswers; onChange: (g: GuideAnswers) => void; isChamps: boolean;
  unitOf: (cat: string) => string; currentOf: (cat: string) => string | undefined;
  onUse: (cat: string, o: StructureOption) => void; onOther: () => void;
  entryCounts?: Record<string, GuideEntryCount>; subcats?: Record<string, string[]>; countState?: "ready" | "loading" | "error";
  /** Actual entries per category (players, or pairs for doubles); 0 when none yet. */
  actualOf?: (cat: string) => number;
  /** Reopened from management to finalise structure against actual entries. */
  review?: { onDone: () => void };
}) {
  const set = (p: Partial<GuideAnswers>) => onChange({ ...guide, ...p });
  const actual = (c: string) => (actualOf?.(c) ?? 0);
  const fieldOf = (c: string) => actual(c) >= 2 ? actual(c) : Number(guide.expected?.[c]) || 0;
  const { cap, byCat, mm } = guideRecommendations(cats, guide, isChamps, fieldOf);
  const ready = Object.keys(byCat).length > 0;
  const plannedOf = (c: string) => { const r = byCat[c]; if (!r) return undefined; return r.options.find((o) => o.kind === guide.applied?.[c]) ?? r.options[0]; };
  const totalDemand = Object.keys(byCat).reduce((t, c) => t + (plannedOf(c)?.matches ?? 0), 0);
  const totalFit = cap ? capacityFit(totalDemand, cap.slots) : null;
  const changeFor = (c: string) => {
    const est = Number(guide.expected?.[c]) || 0, act = actual(c);
    if (act < 2 || !est || est === act) return undefined;
    const fromEst = evaluateStructures({ n: est, outcome: guide.outcome, strength: guide.strength, time: guide.time, isChamps, slots: byCat[c]?.share, matchMinutes: mm })[0];
    const now = byCat[c]?.options[0];
    if (!now) return undefined;
    const tail = fromEst && fromEst.kind === now.kind && (fromEst.pools?.length ?? 0) === (now.pools?.length ?? 0) ? `same structure still recommended (${now.title}).` : `${now.title} now recommended${fromEst ? ` (was ${fromEst.title})` : ""}.`;
    return `Expected ${est}; actual ${act} — ${tail}`;
  };
  const num = (k: "courts" | "hoursPerCourt" | "sessionDays" | "matchMinutes", label: string, ph: string) => (
    <label className="space-y-1 text-xs"><span className="block text-muted-foreground">{label}</span>
      <Input type="number" min={k === "matchMinutes" ? 5 : 0} step={k === "hoursPerCourt" ? 0.5 : 1} aria-label={label} placeholder={ph} value={guide[k] ?? ""} onChange={(e) => set({ [k]: e.target.value })} /></label>
  );
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
        <div className="space-y-2">{cats.map((c) => (
          <div key={c} className="space-y-1" data-testid={`guide-count-${c}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-48 break-words text-sm">{c}</span>
            {guide.knowsEntries === true && <>
            <Input type="number" min={2} className="max-w-[110px]" aria-label={`Approximate entries for ${c}`} placeholder="e.g. 12" value={guide.expected?.[c] ?? ""}
              onChange={(e) => set({ expected: { ...(guide.expected ?? {}), [c]: e.target.value } })} />
            <span className="text-xs text-muted-foreground">~ {unitOf(c)} (estimate)</span>
            </>}
            <span className="text-xs text-muted-foreground">{guideCountText(entryCounts[c], countState)}</span>
          </div>
          {(subcats[c] ?? []).filter((s) => s.trim()).map((s) => <div key={s} className="flex flex-wrap items-center gap-2 pl-4 text-xs">
            <span className="break-words">{s.trim()}</span>
            <span className="text-muted-foreground">{guideCountText(entryCounts[`${c}::${s.trim()}`], countState)}</span>
          </div>)}
          </div>))}</div>
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
        <H n={4} t="How much court time do you have available?" h="Include all preliminary matches, pool/round-robin matches and playoffs. Broad planning only — exact dates, courts and rounds are still set later in Stages & Scheduling." />
        <div className="grid gap-2 sm:grid-cols-4">
          {num("courts", "Courts available", "e.g. 3")}
          {num("hoursPerCourt", "Hours per court per session day", "e.g. 4")}
          {num("sessionDays", "Playing / session days", "e.g. 6")}
          {num("matchMinutes", "Average match duration (min)", String(DEFAULT_MATCH_MINUTES))}
        </div>
        {cap
          ? <p className="text-sm" data-testid="guide-capacity"><span className="font-semibold">{cap.courtHours} court-hours</span> available · about <span className="font-semibold">{cap.slots} match slots</span> at {cap.matchMinutes} min per match.</p>
          : <p className="text-xs text-muted-foreground">Enter courts, hours and days to see total court-hours and match slots.{guide.time ? ` Earlier answer kept for now: "${LEGACY_TIME[guide.time] ?? guide.time}".` : ""}</p>}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-primary" />Recommendations (advisory)</div>
        {!ready
          ? <p className="text-xs text-muted-foreground">{guide.knowsEntries === false ? "No estimate yet — SquashHub will suggest a structure once players are picked or registered. You can still plan a format yourself in the next steps." : "Enter approximate entries above to see a recommendation for each category."}</p>
          : <>
            {cats.map((c) => {
              const r = byCat[c];
              if (!r) return null;
              const isActual = actual(c) >= 2;
              return <RecommendationCard key={c} cat={c} n={r.n} unit={unitOf(c)} note={isActual ? "actual" : "expected"} options={r.options} share={r.share} change={changeFor(c)}
                applied={!!guide.applied?.[c] && guide.applied[c] === r.options[0]?.kind} current={currentOf(c)} onUse={(o) => onUse(c, o)} onOther={onOther} />;
            })}
            <div className="rounded-lg border border-border p-3 text-xs" data-testid="guide-total">
              <div className="font-semibold text-sm">Whole tournament</div>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">{Object.keys(byCat).map((c) => { const o = plannedOf(c)!; return <li key={c}>{c}: {guide.applied?.[c] ? STRUCTURE_LABEL[guide.applied[c]] : `${o.title} (recommended)`} — about {o.matches} matches, ~{o.courtHours} court-hours</li>; })}</ul>
              <p className="mt-1">Combined: about <span className="font-semibold">{totalDemand} matches</span> (~{Math.round((totalDemand * mm) / 6) / 10} court-hours)
                {cap ? <> of {cap.slots} slots ({cap.courtHours} court-hours) — <span className={cn("font-semibold", fitClass(totalFit!))}>{FIT_TEXT[totalFit!]}</span></> : " — enter court time above to compare against capacity"}.</p>
              {totalFit === "exceeds" && <p className="mt-1 text-destructive">Together these structures need more court time than you have. Consider smaller pools, fewer playoff matches, shorter matches or more court time.</p>}
            </div>
            {review && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3"><span className="text-xs">Happy with the structure? Save it and return to finalise entries and generate the draw.</span><Button type="button" size="sm" onClick={review.onDone}>Save & return to finalise</Button></div>}
            <p className="text-xs text-muted-foreground">If pools are recommended, the next step lets you split categories into subcategories (e.g. A/B/C by strength), and Planned format lets you set pools within each group. Nothing is generated until real entries are confirmed.</p>
          </>}
      </div>
    </div>
  );
}
