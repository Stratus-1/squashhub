import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { TournamentDefinition } from "@/lib/smart-builder/definition";
import { DIAMOND_KEY, DIAMOND_TIE, diamondChain, diamondTieStage, poolLetter, poolName, poolRotation, rubberLabel, tieEveningCheck, tieMinutes, tieSlots, toTemplate } from "@/lib/smart-builder/diamond-league";
import { fromExt } from "@/lib/supabase-ext";

type Edit = (mut: (d: TournamentDefinition) => void) => void;
const f = "h-8 bg-white/5 border-white/15 text-white text-xs";

/** Diamond League specifics: dependency chain, 8 pool names, pair source, admission, home courts, open items. */
export function DiamondLeaguePanel({ def, edit, clubId }: { def: TournamentDefinition; edit: Edit; clubId?: string | null }) {
  if (def.templateMeta?.key !== DIAMOND_KEY) return null;
  const open = def.questions.filter((q) => q.id.startsWith("dl_") && !q.resolved);
  const tie = def.divisions.map(diamondTieStage).find(Boolean)?.tieFormat ?? DIAMOND_TIE;
  const setStart = (v: string) => edit((x) => { for (const d of x.divisions) { const st = diamondTieStage(d); if (st?.tieFormat) st.tieFormat.startTime = v || null; } });
  const rounds = poolRotation(4);
  const saveTemplate = async () => {
    if (!clubId) { toast.error("Templates are saved per club — open the builder from a club."); return; }
    const { error } = await fromExt("tournament_templates").insert({ club_id: clubId, template_key: DIAMOND_KEY, name: def.templateMeta?.name ?? "Diamond League", definition: toTemplate(def) });
    if (error) toast.error(`Template not saved: ${error.message}`); else toast.success("Diamond League template saved for this club.");
  };
  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3 space-y-3" data-field="diamond-league">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-white">Diamond League</span>
        <span className="text-white/50">Open category: everyone plays together. The two divisions only split up the draw.</span>
        <Button size="sm" variant="outline" className="ml-auto h-7 bg-transparent border-white/20 text-white/80 text-[11px]" onClick={saveTemplate}>Save as club template</Button>
      </div>
      <ol className="space-y-1">
        {diamondChain(def).map((l, i) => <li key={i} className="flex gap-2"><span className="text-amber-300">{i + 1}.</span><span>{l}</span></li>)}
      </ol>
      <div className="grid sm:grid-cols-3 gap-2">
        <label className="space-y-1 text-[11px] text-white/70"><span>Capacity (accepted players)</span>
          <Input type="number" className={f} value={def.admission?.capacity ?? ""} onChange={(e) => edit((x) => { x.admission = { mode: "first_confirmed", waitlist: true, ...x.admission, capacity: e.target.value ? Number(e.target.value) : null }; })} /></label>
        <label className="space-y-1 text-[11px] text-white/70"><span>Admission</span>
          <select className="smart-builder-select h-8 w-full rounded-md bg-white/5 border border-white/15 text-white px-2 text-xs" value={def.admission?.mode ?? "first_confirmed"} onChange={(e) => edit((x) => { x.admission = { capacity: 48, waitlist: true, ...x.admission, mode: e.target.value as "first_confirmed" | "manual" }; })}>
            <option value="first_confirmed">First confirmed, then waiting list</option><option value="manual">Admin chooses</option>
          </select></label>
        <label className="space-y-1 text-[11px] text-white/70"><span>Tie start time (each evening)</span>
          <Input type="time" className={f} value={tie.startTime ?? ""} onChange={(e) => setStart(e.target.value)} /></label>
      </div>
      <div className="space-y-1" data-field="tie-format">
        <div className="text-white/70">One tie = one court, one evening, in this order ({tieMinutes(tie)} min):</div>
        <div className="flex flex-wrap gap-1">
          {tieSlots(tie, tie.startTime).map((r) => (
            <span key={r.order} className={`rounded px-1.5 py-0.5 text-[11px] ${r.discipline === "doubles" ? "bg-amber-400/15 text-amber-200" : "bg-white/10 text-white/80"}`}>
              {r.discipline === "doubles" ? "D" : "S"} {rubberLabel(r)} · {r.minutes}m{r.start ? ` · ${r.start}` : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-1" data-field="tie-rounds">
        {rounds.map((pairs, r) => {
          const ties = def.divisions.flatMap((d) => pairs.map(([a, b]) => ({ d, a, b, court: (d.poolGroups ?? []).find((g) => g.pools.includes(a) && g.pools.includes(b))?.court ?? null })));
          const chk = tieEveningCheck(ties, tie);
          return (
            <div key={r} className="text-[11px]">
              <span className="text-amber-300">Wednesday {r + 1}:</span>{" "}
              {ties.map((t, i) => <span key={i} className="mr-2">{t.d.name.replace("Division ", "D")} {poolName(t.d, t.a)} v {poolName(t.d, t.b)} ({t.court ?? "no court"})</span>)}
              <span className={chk.state === "feasible" ? "text-emerald-300" : chk.state === "infeasible" ? "text-red-300" : "text-white/50"}>· {chk.detail}</span>
            </div>
          );
        })}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {def.divisions.map((d, di) => (
          <div key={d.id} className="space-y-1">
            <div className="text-white/70">{d.name}: home courts {(d.poolGroups ?? []).map((g) => `${poolLetter(g.pools[0])}+${poolLetter(g.pools[1])} → ${g.court ?? "?"}`).join(", ")}</div>
            <div className="grid grid-cols-2 gap-1">
              {[0, 1, 2, 3].map((pi) => (
                <label key={pi} className="flex items-center gap-1 text-[11px] text-white/60"><span className="w-12 shrink-0">{d.name.replace("Division ", "D")} {poolLetter(pi)}</span>
                  <Input className={f} placeholder={`Pool ${poolLetter(pi)} name`} value={d.poolNames?.[pi] ?? ""} onChange={(e) => edit((x) => { const t = x.divisions[di]; const n = [...(t.poolNames ?? ["", "", "", ""])]; n[pi] = e.target.value; t.poolNames = n; })} /></label>
              ))}
            </div>
          </div>
        ))}
      </div>
      {open.length > 0 && (
        <div className="space-y-1">
          <div className="font-medium text-amber-300">Needs organiser confirmation ({open.length})</div>
          <ul className="list-disc pl-5 space-y-0.5">{open.map((q) => <li key={q.id}>{q.question}</li>)}</ul>
          <div className="text-white/50">Games are only generated for confirmed logic. Semi-finals and finals wait for the organiser\'s rules.</div>
        </div>
      )}
    </div>
  );
}
