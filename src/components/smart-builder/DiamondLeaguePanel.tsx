import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { TournamentDefinition } from "@/lib/smart-builder/definition";
import { DIAMOND_KEY, diamondCurrent, resizeDiamond, diamondLayout, shapeText, diamondChain, sessionTie, diamondTieStage, poolLetter, poolName, poolRotation, rubberLabel, tieEveningCheck, tieMinutes, tieCourt, tieSlots, toTemplate } from "@/lib/smart-builder/diamond-league";
import { fromExt } from "@/lib/supabase-ext";
import { useEffect, useState } from "react";

type Edit = (mut: (d: TournamentDefinition) => void) => void;
const f = "h-8 bg-white/5 border-white/15 text-white text-xs";

/** Diamond League specifics: dependency chain, 8 pool names, ties, admission, home courts, open items. */
export function DiamondLeaguePanel({ def, edit, clubId }: { def: TournamentDefinition; edit: Edit; clubId?: string | null }) {
  if (def.templateMeta?.key !== DIAMOND_KEY) return null;
  const open = def.questions.filter((q) => q.id.startsWith("dl_") && !q.resolved);
  const tie = sessionTie(def);
  const setStart = (v: string) => edit((x) => { for (const d of x.divisions) { const st = diamondTieStage(d); if (st?.tieFormat) st.tieFormat.startTime = v || null; } });
  // Shape is read from the canonical definition every render — no local copy to drift out of sync.
  const cur = diamondCurrent(def);
  const shape = diamondLayout(cur.divisions || 1, cur.poolsPerDivision || 2, cur.poolSize || 6);
  const cap = shape.capacity;
  const commit = (patch: Partial<typeof cur>) => {
    const next = { ...cur, ...patch };
    if (next.divisions < 1 || next.poolsPerDivision < 2 || next.poolSize < 2) { toast.error("Needs at least 1 division, 2 pools per division and 2 players per pool."); return; }
    if (next.divisions < cur.divisions) {
      const gone = def.divisions.slice(next.divisions).map((d) => d.name).join(", ");
      if (!confirm(`Remove ${gone} and its own stages? The other divisions keep all their settings.`)) return;
    }
    edit((x) => { resizeDiamond(x, next); });
  };
  const rounds = Array.from({ length: Math.max(0, ...def.divisions.map((d) => poolRotation(d.poolNames?.length ?? 0).length)) }, (_, r) => r);
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
        <NumField label="Divisions" value={cur.divisions} onCommit={(v) => commit({ divisions: v })} />
        <NumField label="Players per pool" value={cur.poolSize} onCommit={(v) => commit({ poolSize: v })} />
        <NumField label="Pools per division" value={cur.poolsPerDivision} onCommit={(v) => commit({ poolsPerDivision: v })} />
        <div className="sm:col-span-3 flex flex-wrap items-center gap-2 text-[11px] text-white/60" data-field="diamond-shape">
          {shapeText(shape)}
        </div>
        <label className="space-y-1 text-[11px] text-white/70"><span>Admission</span>
          <select className="smart-builder-select h-8 w-full rounded-md bg-white/5 border border-white/15 text-white px-2 text-xs" value={def.admission?.mode ?? "first_confirmed"} onChange={(e) => edit((x) => { x.admission = { waitlist: true, ...x.admission, capacity: cap, mode: e.target.value as "first_confirmed" | "manual" }; })}>
            <option value="first_confirmed">First confirmed, then waiting list</option><option value="manual">Admin chooses</option>
          </select></label>
        <label className="space-y-1 text-[11px] text-white/70"><span>Session start time (each evening)</span>
          <Input type="time" className={f} value={tie.startTime ?? ""} onChange={(e) => setStart(e.target.value)} /></label>
      </div>
      <div className="space-y-1" data-field="tie-format">
        <div className="text-white/70">One session per tie = one court, one evening: Singles stage, then Doubles stage ({tieMinutes(tie)} min):</div>
        <div className="flex flex-wrap gap-1">
          {tieSlots(tie, tie.startTime).map((r) => (
            <span key={r.order} className={`rounded px-1.5 py-0.5 text-[11px] ${r.discipline === "doubles" ? "bg-amber-400/15 text-amber-200" : "bg-white/10 text-white/80"}`}>
              {r.discipline === "doubles" ? "D" : "S"} {rubberLabel(r)} · {r.minutes}m{r.start ? ` · ${r.start}` : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-1" data-field="tie-rounds">
        {rounds.map((r) => {
          const ties = def.divisions.flatMap((d) => (poolRotation(d.poolNames?.length ?? 0)[r] ?? []).map(([a, b], k) => ({ d, a, b, court: tieCourt(d, a, b, k) })));
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
              {(d.poolNames ?? []).map((_, pi) => (
                <label key={pi} className="flex items-center gap-1 text-[11px] text-white/60"><span className="w-12 shrink-0">{d.name.replace("Division ", "D")} {poolLetter(pi)}</span>
                  <Input className={f} placeholder={`Pool ${poolLetter(pi)} name`} value={d.poolNames?.[pi] ?? ""} onChange={(e) => edit((x) => { const t = x.divisions[di]; const n = [...(t.poolNames ?? [])]; n[pi] = e.target.value; t.poolNames = n; })} /></label>
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

/** Number box bound to the canonical value; the typed text is committed on blur / Enter only. */
function NumField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value || ""));
  useEffect(() => { setText(String(value || "")); }, [value]);
  const go = () => { const v = Number(text); if (v && v !== value) onCommit(v); else setText(String(value || "")); };
  return (
    <label className="space-y-1 text-[11px] text-white/70"><span>{label}</span>
      <Input type="number" className={f} value={text} onChange={(e) => setText(e.target.value)} onBlur={go} onKeyDown={(e) => { if (e.key === "Enter") go(); }} /></label>
  );
}
