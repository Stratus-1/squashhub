import { SEEDING_LABELS } from "@/lib/smart-builder/scope";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TournamentDefinition } from "@/lib/smart-builder/definition";
import { QUICK_PATHS, derivePoolShape, hasPlayoffs, hasPools, quickFormat, quickQuestions, setPlayoffs, setPools, syncDivisions, tournamentMapBlocks } from "@/lib/smart-builder/quick-path";
import { cn } from "@/lib/utils";

type Edit = (mut: (d: TournamentDefinition) => void) => void;
const f = "h-8 min-w-0 w-full bg-white/5 border-white/15 text-white text-xs";
const sel = "smart-builder-select h-8 w-full rounded-md bg-white/5 border border-white/15 text-white px-2 text-xs";

function Q({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <label className={cn("block space-y-1 text-[11px] text-white/70", className)}><span>{label}</span>{children}</label>;
}

/** Fast path: only the questions that apply to the chosen format. Edits the same definition as the full builder. */
export function QuickSetup({ def, edit }: { def: TournamentDefinition; edit: Edit }) {
  const q = quickQuestions(def);
  const d0 = def.divisions[0];
  const stages = d0?.sections[0]?.stages ?? [];
  const first = stages[0];
  const po = stages[1];
  const fmt = quickFormat(def);
  const path = QUICK_PATHS.find((p) => p.key === fmt);
  // Structure edits go to division 1, then are copied to every division so all stay identical.
  const editStruct = (mut: (d: TournamentDefinition) => void) => edit((d) => { mut(d); syncDivisions(d); });
  if (!d0 || !first) return null;

  return (
    <div className="rounded-lg border border-white/15 bg-white/[0.03] p-3 space-y-3 text-xs text-white/80" data-field="quick-setup">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-white">{path?.label}</span>
        <span className="text-white/50">Match format. Pools and play-offs are asked separately below.</span>
        <Button size="sm" variant="outline" className="ml-auto h-7 bg-transparent border-white/20 text-white/80 text-[11px]"
          onClick={() => edit((d) => { d.quickPath = null; })}>Open full builder</Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <Q label="Tournament name"><Input className={f} value={def.name} onChange={(e) => edit((d) => { d.name = e.target.value; })} /></Q>
        <Q label="Singles or doubles">
          <select className={sel} value={d0.entry} onChange={(e) => edit((d) => d.divisions.forEach((x) => { x.entry = e.target.value as any; }))}>
            <option value="individual">Singles</option><option value="pairs">Doubles (pairs)</option>
          </select>
        </Q>
        <Q label="Seeding source">
          <div className="rounded border border-white/10 px-2 py-1.5 text-white/70" data-field="event.seedingSource">{def.event?.seedingSource ? SEEDING_LABELS[def.event.seedingSource] : (def.players?.seedingSource ? `${def.players.seedingSource} (older setting)` : "Set under Seeding data above")}<span className="block text-[10px] text-white/40">Set once for the whole tournament</span></div>
        </Q>
        {fmt === "round_robin" && (
          <Q label={q.pools ? "In each pool, play each other" : "Play each other"}>
            <select className={sel} value={first.legs ?? 1} onChange={(e) => editStruct((d) => { d.divisions[0].sections[0].stages[0].legs = Number(e.target.value) === 2 ? 2 : 1; })}>
              <option value={1}>Once</option><option value={2}>Twice</option>
            </select>
          </Q>
        )}
        {q.thirdPlace && (
          <Q label="3rd / 4th place match">
            <select className={sel} value={first.thirdPlace ? "yes" : "no"} onChange={(e) => editStruct((d) => { d.divisions[0].sections[0].stages[0].thirdPlace = e.target.value === "yes"; })}>
              <option value="no">No</option><option value="yes">Yes — losing semi-finalists play off</option>
            </select>
          </Q>
        )}
        {q.swiss && (
          <Q label="Tie-breaks (after wins)">
            <select className={sel} value={(first.tieBreaks ?? []).join(",")} onChange={(e) => editStruct((d) => { d.divisions[0].sections[0].stages[0].tieBreaks = e.target.value ? (e.target.value.split(",") as any) : []; })}>
              <option value="">Seed only</option>
              <option value="buchholz">Opponents' wins (Buchholz)</option>
              <option value="buchholz,sonneborn_berger">Buchholz, then wins over stronger opponents (Sonneborn-Berger)</option>
              <option value="sonneborn_berger,buchholz">Sonneborn-Berger, then Buchholz</option>
            </select>
          </Q>
        )}
        {q.swiss && (
          <Q label="Number of Swiss rounds">
            <Input className={f} inputMode="numeric" value={first.swissRounds ?? ""} onChange={(e) => editStruct((d) => { d.divisions[0].sections[0].stages[0].swissRounds = e.target.value ? Number(e.target.value) : null; })} />
          </Q>
        )}
      </div>

      <div className="space-y-1">
        <div className="font-semibold text-white">Divisions</div>
        {def.divisions.map((d, i) => (
          <div key={d.id} className="grid grid-cols-[1fr_140px_110px_auto] gap-2 items-end">
            <Q label={i === 0 ? "Name" : ""}><Input className={f} value={d.name} onChange={(e) => edit((x) => { x.divisions[i].name = e.target.value; })} /></Q>
            <Q label={i === 0 ? "Who" : ""}>
              <select className={sel} value={d.eligibility} onChange={(e) => edit((x) => { x.divisions[i].eligibility = e.target.value as any; })}>
                <option value="open">Open</option><option value="men">Men</option><option value="ladies">Ladies</option><option value="mixed">Mixed (1M+1F)</option><option value="open_any_pair">Any pair</option>
              </select>
            </Q>
            <Q label={i === 0 ? "Expected entries" : ""}>
              <Input className={f} inputMode="numeric" value={d.sections[0]?.stages[0]?.input?.entrants ?? ""}
                onChange={(e) => edit((x) => { const s = x.divisions[i].sections[0]?.stages[0]; if (s) s.input = { ...s.input, entrants: e.target.value ? Number(e.target.value) : null }; })} />
            </Q>
            {i > 0 ? <Button size="sm" variant="ghost" className="h-8 text-white/50" onClick={() => edit((x) => { x.divisions.splice(i, 1); })}>Remove</Button> : <span />}
          </div>
        ))}
        <Button size="sm" variant="outline" className="h-7 bg-transparent border-white/20 text-white/80 text-[11px]" onClick={() => editStruct((x) => {
          const id = `div${x.divisions.length + 1}_${Date.now().toString(36)}`;
          x.divisions.push({ ...JSON.parse(JSON.stringify(x.divisions[0])), id, name: `Division ${x.divisions.length + 1}` });
        })}>Add division (same format)</Button>
      </div>

      {q.poolsToggle && (
        <Q label="Divide the players into pools / groups?" className="max-w-sm">
          <select className={sel} value={def.quickAnswers?.pools === null && !hasPools(def) ? "" : hasPools(def) ? "yes" : "no"}
            onChange={(e) => e.target.value && editStruct((d) => setPools(d, e.target.value === "yes"))}>
            <option value="">Choose…</option><option value="no">No — one field</option><option value="yes">Yes — divide into pools</option>
          </select>
        </Q>
      )}

      {q.pools && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 rounded border border-white/10 p-2">
          <Q label="Number of pools"><Input className={f} inputMode="numeric" value={first.groups} onChange={(e) => editStruct((d) => {
            const s = d.divisions[0].sections[0].stages[0]; const g = Math.max(2, Number(e.target.value) || 2);
            s.groups = g; s.groupSize = derivePoolShape(s.input?.entrants, g, null).size ?? s.groupSize;
          })} /></Q>
          <Q label="Or players per pool"><Input className={f} inputMode="numeric" value={first.groupSize ?? ""} onChange={(e) => editStruct((d) => {
            const s = d.divisions[0].sections[0].stages[0]; const size = e.target.value ? Number(e.target.value) : null;
            s.groupSize = size; const g = derivePoolShape(s.input?.entrants, null, size).groups; if (g) s.groups = g;
          })} /></Q>
          <Q label="Pool names (optional)" className="lg:col-span-2">
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: first.groups }, (_, i) => (
                <Input key={i} className={cn(f, "w-24")} placeholder={`Pool ${String.fromCharCode(65 + i)}`} value={d0.poolLabels?.[i] ?? ""}
                  onChange={(e) => editStruct((d) => { const l = [...(d.divisions[0].poolLabels ?? [])]; l[i] = e.target.value; d.divisions[0].poolLabels = l; })} />
              ))}
            </div>
          </Q>
          <div className="lg:col-span-4 text-[11px] text-white/50">Players are spread across pools by seeding (strongest separated). Matches inside each pool are round robin.</div>
        </div>
      )}
      {fmt === "swiss" && <div className="text-[11px] text-white/50">Swiss is played as one field. Separate Swiss groups aren't supported yet — use Custom / mixed or separate divisions.</div>}

      {q.playoffToggle && (
        <Q label="Will there be play-offs after this stage?" className="max-w-xs">
          <select className={sel} value={def.quickAnswers?.playoffs === null && !hasPlayoffs(def) ? "" : hasPlayoffs(def) ? "yes" : "no"} onChange={(e) => e.target.value && editStruct((d) => setPlayoffs(d, e.target.value === "yes"))}>
            <option value="">Choose…</option><option value="no">No — final table decides</option><option value="yes">Yes</option>
          </select>
        </Q>
      )}

      {q.playoffs && po && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 rounded border border-white/10 p-2">
          <Q label={q.pools ? "Qualify from each pool" : "How many qualify"}>
            <Input className={f} inputMode="numeric" value={first.advance?.perGroup ?? ""} onChange={(e) => editStruct((d) => { const s = d.divisions[0].sections[0].stages[0]; s.advance = { ...s.advance, role: "qualify", perGroup: e.target.value ? Number(e.target.value) : null }; })} />
          </Q>
          <Q label="Play-off format"><div className="h-8 flex items-center text-white/80">Knockout{first.advance?.perGroup ? ` · ${(first.advance.perGroup) * Math.max(1, first.groups)} qualifiers` : ""}</div></Q>
          <Q label="How qualifiers are placed">
            <select className={sel} value={po.qualifierMapping ?? ""} onChange={(e) => editStruct((d) => { d.divisions[0].sections[0].stages[1].qualifierMapping = (e.target.value || null) as any; })}>
              <option value="">Not decided</option>
              {q.pools && <option value="cross_pool">Cross-pool (A1 v B2)</option>}
              <option value="reseed">Re-seed by finishing position</option>
              {q.pools && <option value="same_pool">Within the same pool</option>}
            </select>
          </Q>
          <Q label="Create play-off games">
            <select className={sel} value={po.generation ?? ""} onChange={(e) => editStruct((d) => { d.divisions[0].sections[0].stages[1].generation = (e.target.value || null) as any; })}>
              <option value="">Not decided</option><option value="owner_approval">After I preview and confirm</option><option value="automatic">Automatically when results are in</option>
            </select>
          </Q>
          <Q label="3rd / 4th place match">
            <select className={sel} value={po.thirdPlace ? "yes" : "no"} onChange={(e) => editStruct((d) => { d.divisions[0].sections[0].stages[1].thirdPlace = e.target.value === "yes"; })}>
              <option value="no">No</option><option value="yes">Yes</option>
            </select>
          </Q>
          <Q label="Play-off courts & times">
            <select className={sel} value={po.playoffScheduling ?? ""} onChange={(e) => editStruct((d) => { d.divisions[0].sections[0].stages[1].playoffScheduling = (e.target.value || null) as any; })}>
              <option value="">Not decided</option><option value="owner">I'll schedule them</option><option value="automatic">Allocate automatically</option>
            </select>
          </Q>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <Q label="How games are scheduled">
          <select className={sel} value={first.schedule.mode === "fixed" || first.schedule.mode === "play_by" ? first.schedule.mode : ""}
            onChange={(e) => editStruct((d) => { d.divisions[0].sections[0].stages.forEach((s) => { s.schedule = { ...s.schedule, mode: (e.target.value || "unset") as any }; }); })}>
            <option value="">Not decided</option><option value="fixed">Fixed dates & times</option><option value="play_by">Play by a deadline</option>
          </select>
        </Q>
        <div className="text-[11px] text-white/55 self-end">Dates: the tournament dates at the top of Design. A stage can get its own narrower dates on Schedule.</div>
        <Q label="Courts available">
          <Input className={f} inputMode="numeric" value={first.schedule.courtsPerVenue ?? ""} onChange={(e) => editStruct((d) => { d.divisions[0].sections[0].stages.forEach((s) => { s.schedule = { ...s.schedule, courtsPerVenue: e.target.value ? Number(e.target.value) : null }; }); })} />
        </Q>
      </div>

      <div className="rounded border border-white/10 bg-white/[0.03] p-2">
        <div className="font-semibold text-white mb-1">Tournament map</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {tournamentMapBlocks(def).map((b, i) => (
            <div key={i}><div className="font-medium text-white/90">{b.division}</div>
              {b.lines.map((l, j) => <div key={j} className="whitespace-pre text-white/70">{l}</div>)}</div>
          ))}
        </div>
        <div className="text-white/50 mt-1">Who can enter, invitations and scoring are on the other tabs. The same checks run before anything is created.</div>
      </div>
    </div>
  );
}
