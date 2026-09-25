import { SEEDING_LABELS } from "@/lib/smart-builder/scope";
/**
 * Smart Builder workspace tabs that edit the ONE structured draft:
 * Players settings, Schedule (summary-first), Invitations & messages, and the
 * readiness Review. Every control reads/writes `def` — the same object the AI
 * proposes changes to — so chat, forms and review can never drift apart.
 */
import { atomically, persistStructure, specFromDefinition } from "@/lib/tournaments/structured-persist";
import { commitStructured, supabaseDb } from "@/lib/tournaments/structured-db";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { requiredRounds, roundDatePlan, roundNames, scheduleMaths, scheduleMathsIssues } from "@/lib/smart-builder/schedule-maths";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CircleDot, XCircle, ShieldCheck } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import { syncTournamentVenues, useHostClubs, useHostCourts, useOwnerOrganisations } from "@/hooks/use-tournaments";
import { courtKey, stageCourts, stageMatch } from "@/lib/smart-builder/court-allocation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { stageDetailLines } from "@/lib/smart-builder/stage-builder";
import { allStages, effectiveSchedule, STAGE_LABELS, type Stage, type TournamentDefinition, type CommsChannel } from "@/lib/smart-builder/definition";
import type { ValidationResult } from "@/lib/smart-builder/validate";
import type { ExistingMapping } from "@/lib/smart-builder/to-existing";
import { RESULT_NONE_NOTE, scheduleNeeds, type Readiness, type ItemState, type ReadinessItem } from "@/lib/smart-builder/readiness";
import { normaliseGroupInviteUrl, isGroupInviteUrl } from "@/lib/tournaments/whatsapp-group";
import { StageWindowControl, TournamentDatesDisplay } from "./DateControls";
import { eventVenues, rotationVenueIds, SCOPE_LABEL, selectedCourtPool, venueRowsFromDefinition } from "@/lib/smart-builder/venues";
import { AUDIENCE_OPTIONS, type EventScope } from "@/lib/smart-builder/scope";
import { sanitizeDraftPayload, sanitizeExtrasPayload } from "@/lib/tournaments/draft-payload";
import type { BuilderScope } from "@/pages/admin/SmartTournamentBuilder";
import { cn } from "@/lib/utils";
import { applyPlan, applyStructure } from "@/lib/smart-builder/division-structure";

type Edit = (mut: (d: TournamentDefinition) => void) => void;
const f = "h-8 min-w-0 w-full bg-white/5 border-white/15 text-white text-xs";
const sel = "smart-builder-select h-8 rounded-md bg-white/5 border border-white/15 text-white px-2 text-xs";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CHANNELS: { key: CommsChannel; label: string }[] = [
  { key: "in_app", label: "In-app" }, { key: "email", label: "Email" }, { key: "whatsapp", label: "WhatsApp" }, { key: "sms", label: "SMS" },
];

export function StateBadge({ state }: { state: ItemState }) {
  const m = { complete: ["Complete", "text-emerald-300 border-emerald-400/40"], missing: ["Missing", "text-red-300 border-red-400/50"], warning: ["Optional", "text-amber-200 border-amber-300/40"] }[state];
  return <span className={cn("rounded-full border px-1.5 py-0 text-[10px] uppercase tracking-wide", m[1])}>{m[0]}</span>;
}

/** Label with a clear requirement tag. */
function Field({ label, tag, field, children, className }: { label: string; tag: "Required" | "Optional" | "Inherited" | "Not needed" | "Missing"; field?: string; children: ReactNode; className?: string }) {
  const tone = tag === "Missing" ? "text-red-300" : tag === "Required" ? "text-white/70" : "text-white/40";
  return (
    <label data-field={field} className={cn("block min-w-0 space-y-0.5 rounded", className)}>
      <span className="flex flex-wrap items-center justify-between gap-x-2 text-[11px] text-white/60">{label}<span className={cn("text-[10px]", tone)}>{tag}</span></span>
      {children}
    </label>
  );
}

function ChannelPicker({ value, onChange, disabled = [] }: { value: CommsChannel[]; onChange: (v: CommsChannel[]) => void; disabled?: CommsChannel[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {CHANNELS.map((c) => {
        const on = value.includes(c.key), off = disabled.includes(c.key);
        return (
          <button key={c.key} type="button" disabled={off} title={off ? "Not supported for this message yet" : undefined}
            onClick={() => onChange(on ? value.filter((x) => x !== c.key) : [...value, c.key])}
            className={cn("rounded-full border px-2 py-0.5 text-[11px]", on ? "bg-primary text-primary-foreground border-primary" : "border-white/20 text-white/75 hover:bg-white/10", off && "opacity-40 cursor-not-allowed")}>
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Players ─────────────────────────── */
export function PlayersTab({ def, validation, edit }: { def: TournamentDefinition; validation: ValidationResult; edit: Edit }) {
  const p = def.players ?? {};
  const set = (patch: Partial<typeof p>) => edit((d) => { d.players = { ...d.players, ...patch }; });
  const rows = allStages(def);
  return (
    <div className="space-y-4 text-xs text-white/80">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="How players enter" tag={p.entryMethod ? "Required" : "Missing"} field="entryMethod">
          <select className={cn(sel, "w-full")} value={p.entryMethod ?? ""} onChange={(e) => set({ entryMethod: (e.target.value || null) as any })}>
            <option value="">Not decided</option><option value="self_entry">Players enter themselves</option>
            <option value="selected">Selected / invited players only</option><option value="both">Invited + open entry</option>
          </select>
        </Field>
        <Field label="Who is invited" tag={p.entryMethod && p.entryMethod !== "self_entry" ? (p.audience ? "Required" : "Missing") : "Optional"} field="audience">
          <select className={cn(sel, "w-full")} value={p.audience ?? ""} onChange={(e) => set({ audience: (e.target.value || null) as any })}>
            <option value="">Not decided</option><option value="all_club">Whole club</option><option value="leagues">League players</option>
            <option value="clubs">Other clubs</option><option value="individuals">Specific people</option>
          </select>
        </Field>
        <Field label="Seeding source" tag="Optional" field="event.seedingSource">
          <div className="rounded border border-white/10 px-2 py-1.5 text-xs text-white/70">{(def as any).event?.seedingSource ? SEEDING_LABELS[(def as any).event.seedingSource as keyof typeof SEEDING_LABELS] : (p.seedingSource ? `${p.seedingSource} (older setting)` : "Set under Seeding data in the Design tab")}</div>
        </Field>
        <Field label="Division allocation" tag="Optional" field="allocation">
          <select className={cn(sel, "w-full")} value={p.allocation ?? ""} onChange={(e) => set({ allocation: (e.target.value || null) as any })}>
            <option value="">Not decided</option><option value="by_eligibility">By eligibility (men/ladies/open)</option>
            <option value="by_ranking">By ranking / strength</option><option value="admin_allocates">Admin allocates</option>
          </select>
        </Field>
        <Field label="Min / max entries" tag="Optional">
          <div className="flex gap-1">
            <Input className={f} inputMode="numeric" placeholder="Min" value={p.minEntries ?? ""} onChange={(e) => set({ minEntries: e.target.value ? Number(e.target.value) : null })} />
            <Input className={f} inputMode="numeric" placeholder="Max" value={p.maxEntries ?? ""} onChange={(e) => set({ maxEntries: e.target.value ? Number(e.target.value) : null })} />
          </div>
        </Field>
        <label className="flex items-center gap-2 pt-4 text-[11px]" data-field="confirmAvailabilityOnly">
          <input type="checkbox" checked={!!p.confirmAvailabilityOnly} onChange={(e) => set({ confirmAvailabilityOnly: e.target.checked })} />
          Selected players only confirm availability
        </label>
      </div>
      <div data-field="eligibility">
        <div className="font-semibold text-white mb-1">Divisions</div>
        <div className="space-y-2">
          {def.divisions.map((d, di) => {
            const poolCount = Math.max(0, ...d.sections.flatMap((sec) => sec.stages.filter((st) => st.kind === "round_robin" && st.groups > 1).map((st) => st.groups)));
            const setDiv = (mut: (x: typeof d) => void) => edit((dd) => { mut(dd.divisions[di]); });
            return (
              <div key={d.id} className="rounded border border-white/10 p-2 space-y-2" data-field={`division-${d.id}`}>
                <div className="grid sm:grid-cols-3 gap-2">
                  <Field label="Division name" tag={d.name ? "Required" : "Missing"}>
                    <Input className={f} value={d.name} onChange={(e) => setDiv((x) => { x.name = e.target.value; })} />
                  </Field>
                  <Field label="How league membership / teams are used" tag="Optional">
                    <select className={cn(sel, "w-full")} value={d.leagueUse ?? ""} onChange={(e) => setDiv((x) => { x.leagueUse = (e.target.value || null) as any; })}>
                      <option value="">Not decided</option>
                      <option value="division_allocation">Decides who is in this division</option>
                      <option value="pool_seeding">Only used to seed pools</option>
                      <option value="team_allocation">League teams play as teams</option>
                      <option value="manual">Organiser decides</option>
                      <option value="ignore">Not used</option>
                    </select>
                  </Field>
                  <div className="text-[11px] text-white/60 pt-4">{d.eligibility.replace(/_/g, " ")}, {d.entry === "pairs" ? "enter as pairs" : d.entry === "teams" ? "enter as teams" : "enter individually"}</div>
                </div>
                {poolCount > 0 && (
                  <Field label="Pool names" tag="Optional">
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: poolCount }, (_, i) => (
                        <Input key={i} className={cn(f, "w-28")} placeholder={`Pool ${String.fromCharCode(65 + i)}`} value={d.poolLabels?.[i] ?? ""}
                          onChange={(e) => setDiv((x) => { const l = [...(x.poolLabels ?? [])]; l[i] = e.target.value; x.poolLabels = l; })} />
                      ))}
                    </div>
                  </Field>
                )}
                {def.divisions.length > 1 && (
                  <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => {
                    const others = def.divisions.filter((_, k) => k !== di).map((x) => x.id);
                    const plan = applyPlan(def, d.id, others);
                    const conf = plan.filter((p) => p.status === "configured");
                    if (!confirm(`Copy ${d.name}'s stages to the other divisions as independent copies?${conf.length ? `\n\n${conf.map((c) => c.name).join(", ")} already ha${conf.length > 1 ? "ve" : "s"} stages — press OK next to decide whether to replace them.` : ""}`)) return;
                    const replace = conf.length ? confirm(`Replace the existing stages in ${conf.map((c) => c.name).join(", ")}? Cancel keeps them and only fills blank divisions.`) : false;
                    let r = { applied: [] as string[], skipped: [] as { name: string }[] };
                    edit((dd) => {
                      const src = dd.divisions[di];
                      r = applyStructure(dd, src.id, others, { replaceConfigured: replace });
                      dd.divisions.forEach((x) => { if (r.applied.includes(x.id)) { x.leagueUse = src.leagueUse; x.poolLabels = src.poolLabels ? [...src.poolLabels] : undefined; } });
                    });
                    toast.success(`Copied to ${r.applied.length} division(s)${r.skipped.length ? `; kept ${r.skipped.map((s) => s.name).join(", ")}` : ""}`);
                  }}>Apply structure to other divisions</Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <div className="font-semibold text-white mb-1">Player flow</div>
          <table className="w-full min-w-[520px]">
            <thead className="text-white/50"><tr className="text-left"><th className="py-1">Stage</th><th>Comes from</th><th>In</th><th>Designed for</th><th>Matches</th><th>Each plays</th><th>Out</th></tr></thead>
            <tbody>
              {rows.map(({ division, stage }) => {
                const fl = validation.flows[stage.id];
                const src = stage.input.fromStageId ? rows.find((r) => r.stage.id === stage.input.fromStageId)?.stage.name : "Registrations";
                return (
                  <tr key={stage.id} className="border-t border-white/10">
                    <td className="py-1">{def.divisions.length > 1 ? `${division.name} · ` : ""}{stage.name}</td>
                    <td>{src}</td><td>{fl?.supply ?? "TBD"} {fl?.unit}</td><td>{fl?.capacity ?? "—"}</td>
                    <td>{fl?.matches ?? "—"}</td><td>{fl?.matchesPerEntrant ?? "—"}</td><td>{fl?.outTotal ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Schedule ─────────────────────────── */
const MODE_LABEL: Record<string, string> = { unset: "Not set", fixed: "Fixed dates", play_by: "Play by", self_booking: "Players arrange", admin: "Admin schedules" };

/** Short stage label: never the full format description. */
export function shortStageName(stage: Stage) {
  const n = stage.name.split(/[—:(]/)[0].trim();
  return n.length > 38 ? `${n.slice(0, 36)}…` : n || STAGE_LABELS[stage.kind];
}
/** Dates may be saved as "YYYY-MM-DD" or with a time ("YYYY-MM-DDTHH:MM:SS"). */
const datePart = (s?: string | null) => (s ? s.slice(0, 10) : "");
const timePart = (s?: string | null) => (s && s.length > 10 ? s.slice(11, 16) : "");
/** Keep any saved time when the date input changes. */
const withDate = (v: string, prev?: string | null) => (v ? (timePart(prev) ? `${v}T${prev?.slice(11) ?? ""}` : v) : null);
const fmtDate = (s?: string | null) => {
  const d = datePart(s);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const out = new Date(`${d}T00:00:00`);
  return isNaN(out.getTime()) ? (s ?? null) : out.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
};

export function ScheduleTab({ def, edit }: { def: TournamentDefinition; edit: Edit }) {
  const d = def.scheduleDefaults ?? {};
  const setD = (patch: Partial<typeof d>) => edit((x) => { x.scheduleDefaults = { ...x.scheduleDefaults, ...patch }; });
  const setS = (id: string, patch: Record<string, unknown>) => edit((x) => {
    allStages(x).forEach((r) => { if (r.stage.id === id) r.stage.schedule = { ...r.stage.schedule, ...patch }; });
  });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [closedDivs, setClosedDivs] = useState<Set<string>>(new Set());
  // "Go there" from Review opens the offending stage's schedule editor.
  useEffect(() => {
    const on = (e: Event) => { const id = (e as CustomEvent).detail?.stageId; if (id) setOpen((s) => new Set(s).add(id)); };
    window.addEventListener("smart-builder:focus-stage", on);
    return () => window.removeEventListener("smart-builder:focus-stage", on);
  }, []);
  const toggle = (s: Set<string>, k: string) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; };
  const groups = def.divisions.map((div) => ({ div, rows: allStages(def).filter((r) => r.division.id === div.id && r.stage.kind !== "pair_from_positions" && r.stage.kind !== "split") })).filter((g) => g.rows.length);
  const allIds = groups.flatMap((g) => g.rows.map((r) => r.stage.id));
  if (!groups.length) return <p className="text-xs text-white/50">No stages to schedule yet. Build the design first.</p>;

  return (
    <div className="space-y-3 text-xs text-white/80">
      {/* Tournament defaults */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 space-y-2">
        <div className="font-semibold text-white">Shared settings <span className="font-normal text-white/45">— every stage uses these unless it sets its own</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><TournamentDatesDisplay def={def} /></div>
          <Field label="Day" tag="Optional"><select className={cn(sel, "w-full")} value={d.weekday ?? ""} onChange={(e) => setD({ weekday: e.target.value === "" ? null : Number(e.target.value) })}><option value="">Any</option>{DAYS.map((x, i) => <option key={x} value={i}>{x}</option>)}</select></Field>
          <Field label="Start time" tag="Optional"><Input type="time" className={f} value={d.startTime ?? ""} onChange={(e) => setD({ startTime: e.target.value || null })} /></Field>
          <VenuePicker def={def} field="defaults.venues" ids={(d as any).venueClubIds} names={d.venueNames} tag="Optional"
            onChange={(ids, names) => setD({ venueClubIds: ids, venueNames: names } as any)} />
          <CourtPoolSummary def={def} venueIds={(d as any).venueClubIds} />
          <Field label="Match minutes" tag="Optional"><Input className={f} inputMode="numeric" value={d.matchMinutes ?? ""} onChange={(e) => setD({ matchMinutes: e.target.value ? Number(e.target.value) : null })} /></Field>
        </div>
        <div className="flex flex-wrap gap-4 text-[11px]">
          {rotationVenueIds(def).length > 1 && <label className="flex items-center gap-1"><input type="checkbox" checked={!!d.rotateVenues} onChange={(e) => setD({ rotateVenues: e.target.checked })} />Rotate between the {rotationVenueIds(def).length} selected venues</label>}
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!d.provisionalBookings} onChange={(e) => setD({ provisionalBookings: e.target.checked })} />Hold courts provisionally once created</label>
          <label className="flex items-center gap-1">Session minutes <span className="text-white/40">(optional, for capacity)</span>
            <Input className={cn(f, "w-16 h-6")} inputMode="numeric" value={d.sessionMinutes ?? ""} onChange={(e) => setD({ sessionMinutes: e.target.value ? Number(e.target.value) : null })} /></label>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button className="underline text-white/60" onClick={() => { setOpen(new Set(allIds)); setClosedDivs(new Set()); }}>Expand all</button>
        <button className="underline text-white/60" onClick={() => setOpen(new Set())}>Collapse all</button>
      </div>

      {groups.map(({ div, rows }) => {
        const divClosed = closedDivs.has(div.id);
        return (
          <div key={div.id} className="rounded-lg border border-white/10">
            <button className="w-full flex items-center gap-2 px-2 py-1.5 text-left font-semibold text-white" onClick={() => setClosedDivs((s) => toggle(s, div.id))}>
              {divClosed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}{div.name}
              <span className="font-normal text-white/45">{rows.length} stage{rows.length === 1 ? "" : "s"}</span>
            </button>
            {!divClosed && <DivisionCourts def={def} divId={div.id} edit={edit} />}
            {!divClosed && (
              <div className="divide-y divide-white/10">
                {rows.map(({ stage, section }) => {
                  const e = effectiveSchedule(def, stage), need = scheduleNeeds(stage.schedule.mode);
                  const sc = stageCourts(def, div, stage), sm = stageMatch(def, stage);
                  const isOpen = open.has(stage.id);
                  const cell = (v: ReactNode, inherited: boolean, required: boolean) =>
                    v ? <span className={inherited ? "text-white/45" : ""}>{v}{inherited && <span className="text-[9px] ml-1">inh.</span>}</span>
                      : required ? <span className="rounded bg-red-500/20 px-1 text-red-300">Missing</span> : <span className="text-white/30">—</span>;
                  const sameDay = datePart(e.startDate.value) && datePart(e.startDate.value) === datePart(e.endDate.value);
                  const dates = e.startDate.value || e.endDate.value ? `${fmtDate(e.startDate.value) ?? "…"}${e.endDate.value && !sameDay ? ` – ${fmtDate(e.endDate.value) ?? "…"}` : ""}` : stage.schedule.roundDates?.length ? `${stage.schedule.roundDates.length} round dates` : null;
                  const stageTime = timePart(e.startDate.value) ? `${timePart(e.startDate.value)}${timePart(e.endDate.value) ? `–${timePart(e.endDate.value)}` : ""}` : null;
                   const dayIndex = new Date(`${datePart(e.startDate.value)}T00:00:00`).getDay();
                   const dayName = e.weekday.value != null ? DAYS[e.weekday.value] : Number.isNaN(dayIndex) ? null : DAYS[dayIndex];
                  const dayTime = [dayName, stageTime ?? e.startTime.value].filter(Boolean).join(" ") || null;
                  const venue = e.venueNames.value?.length ? `${e.venueNames.value.length > 1 ? `${e.venueNames.value.length} venues` : e.venueNames.value[0]}` : null;
                  return (
                    <div key={stage.id} data-field={`stage.${stage.id}`}>
                      <button className="w-full grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 px-2 py-2 text-left hover:bg-white/[0.04]" onClick={() => setOpen((s) => toggle(s, stage.id))}>
                        <span className="col-span-2 sm:col-span-3 flex min-w-0 items-center gap-1 font-medium text-white">
                          {isOpen ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                          <span className="truncate">{div.sections.length > 1 ? `${section.name} · ` : ""}{shortStageName(stage)}</span>
                        </span>
                        <span className="min-w-0"><span className="text-white/45">How: </span>{stage.schedule.mode === "unset" ? <span className="rounded bg-red-500/20 px-1 text-red-300">Not set</span> : MODE_LABEL[stage.schedule.mode]}</span>
                        <span className="min-w-0"><span className="text-white/45">Dates: </span>{cell(dates, e.startDate.inherited || e.endDate.inherited, need.dates)}</span>
                        <span className="min-w-0"><span className="text-white/45">Time: </span>{cell(dayTime, e.weekday.inherited, false)}</span>
                        <span className="min-w-0 break-words"><span className="text-white/45">Venue: </span>{cell(venue, e.venueNames.inherited, need.venue)}</span>
                        <span className="min-w-0"><span className="text-white/45">Courts: </span>{cell(sc.count ? sc.text : null, sc.source === "tournament" || sc.source === "division", need.courts)}</span>
                        <span className="min-w-0"><span className="text-white/45">Match: </span>{cell(sm.text, !stage.scoring?.mode && !stage.tieFormat && e.matchMinutes.inherited, need.matchMinutes)}</span>
                      </button>
                      {isOpen && <StageScheduleEditor stage={stage} def={def} setS={setS} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Optional: reserve some of the tournament's courts for one division. Empty = the division uses every tournament court. */
function DivisionCourts({ def, divId, edit }: { def: TournamentDefinition; divId: string; edit: Edit }) {
  const pool = selectedCourtPool(def);
  const { data: courts = [] } = useHostCourts(eventVenues(def).clubIds);
  const div = def.divisions.find((d) => d.id === divId)!;
  if (!pool.length) return <p className="px-2 pb-1 text-[11px] text-red-300">No courts chosen yet — pick courts under Venue(s) on Design; every division and stage then uses them.</p>;
  if ((div.poolGroups ?? []).some((g) => g.court)) return <p className="px-2 pb-1 text-[11px] text-white/55">Courts: set per pool pair (home courts) in the stage builder.</p>;
  const keys = new Set(div.courtKeys ?? []);
  const name = (c: { clubId: string; courtId: number }) => courts.find((x: any) => x.club_id === c.clubId && x.court_id === c.courtId)?.name ?? `Court ${c.courtId}`;
  const toggle = (k: string) => edit((x) => { const d = x.divisions.find((y) => y.id === divId)!; const s = new Set(d.courtKeys ?? []); s.has(k) ? s.delete(k) : s.add(k); d.courtKeys = [...s]; });
  return (
    <div className="px-2 pb-2 flex flex-wrap items-center gap-1 text-[11px]" data-field={`division.${divId}.courts`}>
      <span className="text-white/55">Courts for {div.name}:</span>
      {pool.map((c) => { const k = courtKey(c); const on = keys.has(k); return (
        <button key={k} onClick={() => toggle(k)} className={cn("rounded border px-1.5 py-0.5", on ? "border-amber-300/70 text-amber-200" : "border-white/15 text-white/60")}>{name(c)}</button>
      ); })}
      <span className="text-white/40">{keys.size ? `${keys.size} reserved` : "none picked = all tournament courts"}</span>
    </div>
  );
}

/** Courts come from the real court records selected on Design — never typed in here. */
function CourtPoolSummary({ def, venueIds }: { def: TournamentDefinition; venueIds?: string[] | null }) {
  const pool = selectedCourtPool(def).filter((c) => !venueIds?.length || venueIds.includes(c.clubId));
  return (
    <div className="space-y-0.5">
      <span className="text-[11px] text-white/60">Courts</span>
      <p className="text-[11px] text-white/80">{def.event?.noVenue ? "No physical venue" : pool.length ? `${pool.length} court${pool.length === 1 ? "" : "s"} selected on Design` : "Choose courts under Venue(s) on Design"}</p>
    </div>
  );
}

/** Schedule venues come ONLY from the event venue set chosen on Design. */
function VenuePicker({ def, ids, names, tag, field, inheritedNote, onChange }: {
  def: TournamentDefinition; ids?: string[] | null; names?: string[] | null; tag: "Required" | "Optional" | "Inherited" | "Not needed" | "Missing";
  field?: string; inheritedNote?: string; onChange: (ids: string[], names: string[]) => void;
}) {
  const allowed = eventVenues(def);
  const chosen = ids?.length ? ids : allowed.clubIds.filter((id, i) => (names ?? []).some((n) => n.trim().toLowerCase() === allowed.names[i]?.trim().toLowerCase()));
  const strays = ids?.length ? ids.filter((id) => !allowed.clubIds.includes(id)).map((id) => names?.[ids.indexOf(id)] ?? id)
    : (names ?? []).filter((n) => !allowed.names.some((a) => a.trim().toLowerCase() === n.trim().toLowerCase()));
  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    onChange(next, next.map((x) => allowed.names[allowed.clubIds.indexOf(x)] ?? x));
  };
  const tone = tag === "Missing" ? "text-red-300" : tag === "Required" ? "text-white/70" : "text-white/40";
  return (
    <div data-field={field} className="sm:col-span-2 min-w-0 space-y-0.5 rounded">
      <span className="flex flex-wrap items-center justify-between gap-x-2 text-[11px] text-white/60">Venues<span className={cn("text-[10px]", tone)}>{tag}</span></span>
      {def.event?.noVenue ? <p className="text-[11px] text-white/45">No physical venue (set on Design).</p>
        : !allowed.clubIds.length ? <p className="text-[11px] text-amber-200">Choose the tournament's venue(s) on Design first.</p> : (
        <div className="flex flex-wrap gap-1">
          {allowed.clubIds.map((id, i) => {
            const on = chosen.includes(id);
            return <button key={id} type="button" aria-pressed={on} onClick={() => toggle(id)}
              className={cn("rounded-full border px-2 py-0.5 text-[11px]", on ? "border-amber-300 bg-amber-500/15 text-white" : "border-white/15 text-white/70")}>{allowed.names[i]}</button>;
          })}
        </div>
      )}
      {!chosen.length && inheritedNote && <p className="text-[11px] text-white/45">{inheritedNote}</p>}
      {strays.length > 0 && (
        <p className="text-[11px] text-red-300">Not a tournament venue: {strays.join(", ")}. <button type="button" className="underline" onClick={() => onChange(chosen, chosen.map((x) => allowed.names[allowed.clubIds.indexOf(x)] ?? x))}>Remove</button></p>
      )}
    </div>
  );
}

function StageScheduleEditor({ stage, def, setS }: { stage: Stage; def: TournamentDefinition; setS: (id: string, p: Record<string, unknown>) => void }) {
  const s = stage.schedule, e = effectiveSchedule(def, stage), need = scheduleNeeds(s.mode);
  const tag = (needed: boolean, own: unknown, inherited: boolean): "Required" | "Optional" | "Inherited" | "Not needed" | "Missing" =>
    !needed ? "Not needed" : own != null && own !== "" && !(Array.isArray(own) && !own.length) ? "Required" : inherited ? "Inherited" : "Missing";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-white/[0.02] px-3 py-2">
      <Field label="How it's scheduled" tag={s.mode === "unset" ? "Missing" : "Required"}>
        <select className={cn(sel, "w-full")} value={s.mode} onChange={(ev) => setS(stage.id, { mode: ev.target.value })}>
          {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <div data-field={`stage.${stage.id}.window`} className="sm:col-span-2 lg:col-span-2 space-y-0.5 rounded">
        <span className="text-[11px] text-white/60">Stage window</span>
        <StageWindowControl def={def} stage={stage} onChange={(patch) => setS(stage.id, patch)} />
      </div>
      {(s.mode === "fixed" || s.mode === "play_by") && (() => {
        // One date per DERIVED round (fixed = round date; play-by = per-round play-by date).
        const need = requiredRounds(stage, def);
        const plan = roundDatePlan(def).get(stage.id);
        const auto = !!plan?.auto;
        const have = s.roundDates ?? [];
        const ov = s.roundDateOverrides ?? {};
        const count = auto ? need ?? 0 : Math.max(need ?? 0, have.length, s.mode === "fixed" ? 1 : 0);
        const names = roundNames(stage, count);
        const setRound = (i: number, v: string) => {
          if (auto) {
            const next = { ...ov };
            if (v) next[String(i)] = v; else delete next[String(i)];
            setS(stage.id, { roundDateOverrides: Object.keys(next).length ? next : undefined });
            return;
          }
          const next = [...have]; while (next.length < i) next.push("");
          next[i] = v;
          while (next.length && !next[next.length - 1]) next.pop();
          setS(stage.id, { roundDates: next });
        };
        if (!count) return null;
        return (
          <div className="sm:col-span-2 lg:col-span-3 space-y-1">
            <span className="flex flex-wrap items-center justify-between gap-x-2 text-[11px] text-white/60">
              {s.mode === "fixed" ? "Round dates (fixed)" : "Round play-by dates (the stage's last day is the final deadline)"}
              <span className="text-[10px] text-white/50">{need != null ? `${need} round${need === 1 ? "" : "s"} needed (worked out from the ${stage.kind === "swiss" ? "Swiss round count" : stage.kind === "knockout" ? "draw size" : "pool size"})` : "Round count known once the stage size is set"}</span>
            </span>
            <p className="text-[10px] text-white/45">{auto ? `Generated every ${DAYS[(s.weekday ?? def.scheduleDefaults?.weekday) as number]} from ${plan?.anchor}. Change a date to override that round only.` : "Pick a Day below (and a start date) to fill these in automatically."}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {names.map((n, i) => (
                <label key={i} data-field={`stage.${stage.id}.round${i}`} className="block min-w-0 space-y-0.5 rounded">
                  <span className={cn("text-[10px]", s.mode === "fixed" && need != null && i < need && !have[i] ? "text-red-300" : "text-white/50")}>{n}{auto && ov[String(i)] ? " · changed" : ""}</span>
                  <Input type="date" className={f} value={datePart(have[i])} onChange={(ev) => setRound(i, ev.target.value)} />
                </label>
              ))}
            </div>
            {auto && Object.keys(ov).length > 0 && <button type="button" className="text-[10px] underline text-white/60" onClick={() => setS(stage.id, { roundDateOverrides: undefined })}>Reset to generated dates</button>}
          </div>
        );
      })()}
      <Field label="Day" tag={e.weekday.inherited && s.weekday == null ? "Inherited" : "Optional"}>
        <select className={cn(sel, "w-full")} value={s.weekday ?? ""} onChange={(ev) => setS(stage.id, { weekday: ev.target.value === "" ? null : Number(ev.target.value) })}>
          <option value="">{e.weekday.inherited ? `Default (${DAYS[e.weekday.value as number]})` : "Any day"}</option>{DAYS.map((x, i) => <option key={x} value={i}>Every {x}</option>)}
        </select>
      </Field>
      <VenuePicker def={def} ids={s.venueClubIds} names={s.venueNames} tag={tag(need.venue, s.venueNames, e.venueNames.inherited)}
        inheritedNote={e.venueNames.inherited ? `Default: ${(e.venueNames.value ?? []).join(", ")}` : undefined}
        onChange={(ids, names) => setS(stage.id, { venueClubIds: ids, venueNames: names })} />
      <CourtPoolSummary def={def} venueIds={s.venueClubIds?.length ? s.venueClubIds : (def.scheduleDefaults as any)?.venueClubIds} />
      <Field label="Match minutes" tag={tag(need.matchMinutes, s.matchMinutes, e.matchMinutes.inherited)}>
        <Input className={f} inputMode="numeric" placeholder={e.matchMinutes.inherited ? `Default ${e.matchMinutes.value}` : ""} value={s.matchMinutes ?? ""} onChange={(ev) => setS(stage.id, { matchMinutes: ev.target.value ? Number(ev.target.value) : null })} />
      </Field>
      <Field label="Session minutes" tag={need.venue ? (e.sessionMinutes.inherited && s.sessionMinutes == null ? "Inherited" : "Optional") : "Not needed"}>
        <Input className={f} inputMode="numeric" placeholder={e.sessionMinutes.inherited ? `Default ${e.sessionMinutes.value}` : ""} value={s.sessionMinutes ?? ""} onChange={(ev) => setS(stage.id, { sessionMinutes: ev.target.value ? Number(ev.target.value) : null })} />
      </Field>
      {rotationVenueIds(def).length > 1 && <label className="flex items-center gap-1 pt-4 text-[11px]"><input type="checkbox" checked={!!s.rotateVenues} onChange={(ev) => setS(stage.id, { rotateVenues: ev.target.checked })} />Rotate venues</label>}
    </div>
  );
}

/* ─────────────────────── Invitations & messages ─────────────────────── */
export function InvitationsTab({ def, edit }: { def: TournamentDefinition; edit: Edit }) {
  const c = def.comms ?? {}, p = def.players ?? {};
  const set = (patch: Partial<typeof c>) => edit((d) => { d.comms = { ...d.comms, ...patch }; });
  const [link, setLink] = useState(c.whatsappGroupUrl ?? "");
  const linkBad = !!link && !isGroupInviteUrl(link);
  const regCloseRequired = p.entryMethod !== "selected";
  return (
    <div className="space-y-4 text-xs text-white/80">
      <div className="flex items-start gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-2 text-emerald-100">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Nothing is sent from the builder, and creating the tournament sends nothing. Invitations go out only when an admin presses Send on the tournament afterwards.</span>
      </div>

      <section className="space-y-2">
        <div className="font-semibold text-white">Invitations</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Sending" tag={c.inviteSending ? "Required" : "Missing"} field="inviteSending">
            <select className={cn(sel, "w-full")} value={c.inviteSending ?? ""} onChange={(e) => set({ inviteSending: (e.target.value || null) as any })}>
              <option value="">Not decided (stays manual)</option><option value="manual">Manual — admin presses Send</option><option value="automatic">Automatic</option>
            </select>
          </Field>
          <Field label="Channels" tag={c.inviteChannels?.length ? "Required" : "Missing"} field="inviteChannels" className="lg:col-span-2">
            <ChannelPicker value={c.inviteChannels ?? []} onChange={(v) => set({ inviteChannels: v })} disabled={["sms"]} />
          </Field>
          <Field label="Registration opens" tag="Optional" field="registrationOpensAt">
            <Input type="date" className={f} value={c.registrationOpensAt ?? ""} onChange={(e) => set({ registrationOpensAt: e.target.value || null })} />
          </Field>
          <Field label="Registration closes" tag={regCloseRequired ? (c.registrationClosesAt || def.registrationClosesAt ? "Required" : "Missing") : "Optional"} field="registrationClosesAt">
            <Input type="date" className={f} value={c.registrationClosesAt ?? def.registrationClosesAt ?? ""} onChange={(e) => set({ registrationClosesAt: e.target.value || null })} />
          </Field>
          <Field label="Reminders" tag="Optional" field="reminders">
            <select className={cn(sel, "w-full")} value={c.reminders ?? ""} onChange={(e) => set({ reminders: (e.target.value || null) as any })}>
              <option value="">Not set</option><option value="none">No reminders</option><option value="before_close">Before registration closes</option>
              <option value="before_matches">Before matches</option><option value="both">Both</option>
            </select>
          </Field>
        </div>
        {c.inviteSending === "automatic" && <p className="text-amber-200">Automatic sending isn't switched on by the builder. After creation, invitations still need an admin to press Send until automatic sending is confirmed there.</p>}
        <Field label="Invitation wording" tag="Optional" field="inviteMessage">
          <Textarea className="min-h-[56px] bg-white/5 border-white/15 text-white text-xs" value={c.inviteMessage ?? ""} placeholder="Short message shown with the invitation" onChange={(e) => set({ inviteMessage: e.target.value || null })} />
        </Field>
        <p className="text-white/50">Audience: {p.audience ? p.audience.replace(/_/g, " ") : "not decided"}{p.confirmAvailabilityOnly ? " · selected players only confirm availability" : ""} — change this on Players.</p>
      </section>

      <section className="space-y-2">
        <div className="font-semibold text-white">Fees</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Entry fee (R)" tag={c.entryFeeRands != null ? "Required" : "Missing"} field="entryFeeRands">
            <Input className={f} inputMode="decimal" placeholder="0 for free" value={c.entryFeeRands ?? ""} onChange={(e) => set({ entryFeeRands: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
          <Field label="Payment methods" tag={c.entryFeeRands ? "Optional" : "Not needed"} className="sm:col-span-2">
            <div className="flex flex-wrap gap-1">
              {(["card", "eft", "cash", "account"] as const).map((m) => {
                const on = (c.paymentMethods ?? []).includes(m);
                return <button key={m} type="button" disabled={!c.entryFeeRands} onClick={() => set({ paymentMethods: on ? (c.paymentMethods ?? []).filter((x) => x !== m) : [...(c.paymentMethods ?? []), m], paymentRequired: true })}
                  className={cn("rounded-full border px-2 py-0.5 text-[11px]", on ? "bg-primary text-primary-foreground border-primary" : "border-white/20 text-white/75", !c.entryFeeRands && "opacity-40")}>{m === "account" ? "Add to account" : m.toUpperCase()}</button>;
              })}
            </div>
          </Field>
        </div>
      </section>

      <section className="space-y-2" data-field="whatsappGroup">
        <div className="font-semibold text-white">WhatsApp group</div>
        <p>Do you want to add a WhatsApp group for this tournament?</p>
        <div className="flex gap-1">
          {(["yes", "no"] as const).map((v) => (
            <button key={v} type="button" onClick={() => set({ whatsappGroup: v })}
              className={cn("rounded-full border px-3 py-0.5 text-[11px]", c.whatsappGroup === v ? "bg-primary text-primary-foreground border-primary" : "border-white/20 text-white/75")}>{v === "yes" ? "Yes" : "No"}</button>
          ))}
          {!c.whatsappGroup && <span className="text-red-300 text-[11px] self-center ml-2">Not decided</span>}
        </div>
        {c.whatsappGroup === "yes" && (
          <Field label="Group invite link" tag={link ? (linkBad ? "Missing" : "Optional") : "Optional"}>
            <Input className={f} placeholder="https://chat.whatsapp.com/…" value={link} onChange={(e) => setLink(e.target.value)}
              onBlur={() => { const n = normaliseGroupInviteUrl(link); if (n) setLink(n); set({ whatsappGroupUrl: n ?? (link.trim() || null) }); }} />
            {linkBad && <span className="text-red-300 text-[11px]">That isn't a WhatsApp group invite link (it should start with https://chat.whatsapp.com/).</span>}
            <span className="text-white/45 text-[11px]">Create the group on your phone (admin-only posting), then paste its invite link. You can also add it later on the tournament.</span>
          </Field>
        )}
      </section>

      <section className="space-y-2" data-field="resultNotify">
        <div className="font-semibold text-white">After each match</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Result / congratulations messages" tag={c.resultNotify ? "Required" : "Missing"}>
            <select className={cn(sel, "w-full")} value={c.resultNotify ?? ""} onChange={(e) => set({ resultNotify: (e.target.value || null) as any })}>
              <option value="">Not decided</option><option value="none">None</option><option value="all">Every match</option><option value="playoffs">Play-offs only</option>
            </select>
          </Field>
          <Field label="Channels" tag={c.resultNotify && c.resultNotify !== "none" ? "Optional" : "Not needed"} className="sm:col-span-2">
            {c.resultNotify && c.resultNotify !== "none"
              ? <ChannelPicker value={c.resultChannels ?? ["email"]} onChange={(v) => set({ resultChannels: v })} />
              : <span className="text-white/40">No messages will be sent after matches.</span>}
          </Field>
        </div>
      </section>
    </div>
  );
}

/* ─────────────────────────── Review ─────────────────────────── */
export function ReviewTab({ scope, def, readiness, mapping, validation, draftId, created, onCreated, onJump }: {
  scope: BuilderScope; def: TournamentDefinition; readiness: Readiness; mapping: ExistingMapping; validation: ValidationResult;
  draftId: string; created: boolean; onCreated: (id: string) => void; onJump: (item: ReadinessItem) => void;
}) {
  const { data: clubs = [] } = useHostClubs();
  const { data: orgs = [] } = useOwnerOrganisations();
  const ev = def.event ?? {};
  // Owner and venues are decided on Design; the first event venue hosts the tournament record.
  const hostClubId = eventVenues(def).clubIds[0] ?? orgs.find((o) => o.id === ev.ownerId)?.club_id ?? (scope.kind === "club" ? scope.clubId : "");
  const ownerOrgId = ev.scope && ev.scope !== "club" ? ev.ownerId ?? "" : "";
  const [confirm, setConfirm] = useState(false);
  const [ackPartial, setAckPartial] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = def.comms ?? {};
  const requiredMissing = readiness.missing.filter((m) => m.id !== "exec");
  const exec = readiness.executability;
  const schedMaths = useMemo(() => scheduleMaths(def), [def]);
  const canPress = !created && exec !== "blocked" && requiredMissing.length === 0 && !!hostClubId && !busy && (exec === "ready" || ackPartial);

  const summary = useMemo(() => {
    const sd = def.scheduleDefaults ?? {}, p = def.players ?? {};
    return [
      ["Owner", ev.scope ? `${SCOPE_LABEL[ev.scope as EventScope]} — ${ev.ownerName ?? "owner not chosen"}` : "—"],
      ["Who may enter", ev.scope && ev.audience ? AUDIENCE_OPTIONS[ev.scope as EventScope].find((o) => o.value === ev.audience)?.label ?? "—" : "—"],
      ["Event venues", ev.noVenue ? "No physical venue" : eventVenues(def).names.length ? `${eventVenues(def).names.join(", ")} · ${selectedCourtPool(def).length} court(s)` : "—"],
      ["Stages", def.divisions.map((d) => `${d.name}: ${d.sections.flatMap((x) => x.stages).map((st, i) => `${i + 1}. ${st.name} — ${stageDetailLines(st, def).join("; ")}`).join(" | ")}`).join(" || ") || "—"],
      ["Flow", def.divisions.map((d) => `${d.name}: ${d.sections.flatMap((s) => s.stages.map((st) => shortStageName(st))).join(" → ")}`).join(" | ") || "—"],
      ["Entry", p.entryMethod ? p.entryMethod.replace(/_/g, " ") + (p.confirmAvailabilityOnly ? " (confirm availability only)" : "") : "—"],
      ["Dates", sd.startDate ? `${sd.startDate} → ${sd.endDate ?? "?"}${sd.weekday != null ? `, ${DAYS[sd.weekday]}s` : ""}${sd.startTime ? ` from ${sd.startTime}` : ""}` : "—"],
      ["Scheduled venues", sd.venueNames?.length ? `${sd.venueNames.join(", ")}${sd.rotateVenues ? " (rotating)" : ""}` : "—"],
      ["Invitations", `${c.inviteSending === "automatic" ? "Automatic" : "Manual"} via ${(c.inviteChannels ?? []).map((x) => CHANNELS.find((k) => k.key === x)?.label).join(", ") || "—"}`],
      ["Fee", c.entryFeeRands == null ? "—" : c.entryFeeRands === 0 ? "Free" : `R${c.entryFeeRands.toFixed(2)}`],
      ["WhatsApp group", c.whatsappGroup === "yes" ? (c.whatsappGroupUrl ? "Yes, link saved" : "Yes, link to add") : c.whatsappGroup === "no" ? "No" : "—"],
      ["After matches", c.resultNotify === "none" ? "No messages" : c.resultNotify ? `${c.resultNotify === "all" ? "Every match" : "Play-offs"} via ${(c.resultChannels ?? ["email"]).join(", ")}` : "—"],
    ];
  }, [def, c]);

  const create = async () => {
    setBusy(true);
    let createdId: string | null = null;
    try {
      // Validate structure + schedule maths BEFORE anything is written.
      const sched = scheduleMathsIssues(def)[0];
      if (sched) throw new Error(sched.message);
      const { data, error } = await fromExt("club_champs")
        .insert(sanitizeDraftPayload({ club_id: hostClubId, owner_org_id: ownerOrgId || undefined, status: "planning", ...mapping.champ }))
        .select("id").single();
      if (error) throw error;
      // Structured architecture: persist the spec, then divisions/stages/pools, before any game exists.
      let structuredSpec: ReturnType<typeof specFromDefinition> | null = null;
      try { structuredSpec = specFromDefinition(def); } catch (e: any) {
        // A multi-stage design must never silently fall back to half a tournament.
        if (mapping.structured || def.divisions.some((d) => d.sections.some((s) => s.stages.length > 1))) throw e;
        toast.warning(`${e.message} This tournament uses the current engine instead.`);
      }
      createdId = data.id;
      const { error: exErr } = await fromExt("tournaments").update({
        ...sanitizeExtrasPayload(mapping.extras),
        ...(structuredSpec ? { builder_architecture: "structured", builder_spec: structuredSpec, builder_spec_version: 1 } : {}),
      }).eq("id", data.id);
      if (exErr) console.warn("extras", exErr.message);
      if (structuredSpec && exErr) throw exErr;
      // Every division, every stage (later ones Pending), pools and transition rules — one transaction.
      if (structuredSpec) await atomically(supabaseDb, data.id, commitStructured, (db) => persistStructure(db, data.id, structuredSpec));
      // Host venues + selected court IDs go into the existing authoritative venue table.
      const venueRows = venueRowsFromDefinition(def, hostClubId);
      if (venueRows.length) {
        try {
          await syncTournamentVenues({ tournamentId: data.id, rows: venueRows });
          await fromExt("tournaments").update({ participating_club_ids: venueRows.map((r) => r.club_id), court_ids: venueRows.flatMap((r) => r.court_ids) }).eq("id", data.id);
        } catch (vErr: any) { toast.warning(`Tournament created, but its venues weren't saved: ${vErr.message}`); }
      }
      if (mapping.whatsappGroupUrl) {
        // Link only — the existing group card handles sharing. Nothing is sent here.
        const { error: wgErr } = await fromExt("tournament_whatsapp_groups").insert({ champ_id: data.id, club_id: hostClubId, provider: "manual", invite_url: mapping.whatsappGroupUrl, group_name: def.name, status: "active" });
        if (wgErr) toast.warning(`Tournament created, but the WhatsApp link wasn't saved: ${wgErr.message}`);
      }
      await fromExt("smart_tournament_drafts").update({ status: "created", created_tournament_id: data.id }).eq("id", draftId);
      onCreated(data.id);
    } catch (e: any) {
      // No half-created tournament: remove the shell if structure didn't commit.
      if (createdId) {
        const { error: delErr } = await fromExt("tournaments").delete().eq("id", createdId);
        if (delErr) toast.error(`Create failed, and the partial tournament couldn't be removed automatically: ${delErr.message}`);
      }
      toast.error(`Create failed — nothing was created: ${e.message}`);
    } finally { setBusy(false); setConfirm(false); }
  };

  const icon = (s: ItemState) => s === "complete" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : s === "missing" ? <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />;

  return (
    <div className="space-y-4 text-xs text-white/85">
      <div className="grid md:grid-cols-2 gap-2">
        {readiness.sections.map((s) => (
          <div key={s.key} className="rounded-lg border border-white/10 p-2 space-y-1">
            <div className="flex items-center justify-between"><span className="font-semibold text-white">{s.title}</span><StateBadge state={s.state} /></div>
            {s.items.map((i) => (
              <button key={i.id} onClick={() => onJump(i)} className="w-full flex items-start gap-1.5 text-left rounded px-1 py-0.5 hover:bg-white/[0.05]">
                {icon(i.state)}<span><span className="text-white/90">{i.label}:</span> <span className="text-white/60">{i.detail}</span></span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-white/10 p-2">
        <div className="font-semibold text-white mb-1">Saved settings</div>
        <dl className="grid sm:grid-cols-[120px_1fr] gap-x-2 gap-y-0.5">
          {summary.map(([k, v]) => <Fragment key={k}><dt className="text-white/50">{k}</dt><dd>{v}</dd></Fragment>)}
        </dl>
      </div>

      <div className="rounded-lg border border-white/10 p-3 space-y-1.5" data-field="review-stages">
        <div className="font-semibold text-white">Stages and match scoring</div>
        {def.divisions.map((d) => (
          <div key={d.id}>
            {def.divisions.length > 1 && <div className="text-white/60">{d.name}</div>}
            {d.sections.flatMap((x) => x.stages).map((st, i) => (
              <div key={st.id} className="pl-2">
                <div className="text-white">Stage {i + 1} — {st.name}</div>
                {stageDetailLines(st, def).map((l, k) => <div key={k} className={/not set|Needs confirmation/.test(l) ? "pl-3 text-red-300" : "pl-3 text-white/65"}>{l}</div>)}
              </div>
            ))}
          </div>
        ))}
      </div>

      {schedMaths.sessions.length > 0 && (
        <div className="rounded-lg border border-white/10 p-3 space-y-1.5" data-field="review-sessions">
          <div className="font-semibold text-white">Schedule (sessions)</div>
          {schedMaths.sessions.map((x, i) => (
            <div key={i}>
              <div className={x.state === "infeasible" ? "text-red-300" : "text-white"}>{x.label}{x.divisionIds.length > 1 ? ` · ${x.divisionIds.length} divisions` : ""}</div>
              {x.parts.length > 1 && x.parts.map((p, k) => (
                <div key={k} className="pl-3 text-white/65">{k + 1}. {p.name}{p.start && p.end ? ` ${p.start}–${p.end}` : ""} · {p.detail}</div>
              ))}
            </div>
          ))}
        </div>
      )}

      <details className="rounded-lg border border-white/10 p-2"><summary className="cursor-pointer font-semibold text-white">The maths</summary>
        <div className="mt-1 font-semibold text-white/80">Structure maths</div>
        {validation.facts.length ? <ul className="list-disc pl-4 mt-0.5 space-y-0.5">{validation.facts.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-white/50">Nothing to calculate yet.</p>}
        <div className="mt-2 font-semibold text-white/80">Schedule maths</div>
        <div className="grid sm:grid-cols-2 gap-2 mt-0.5">
          {schedMaths.facts.map((x, i) => (
            <div key={i} className="rounded border border-white/10 p-1.5">
              <div className="font-medium text-white">{x.where}</div>
              {x.lines.map((l, k) => <div key={k} className="text-white/65">{l}</div>)}
              <div className={x.ok ? "text-emerald-300" : "text-red-300"}>Result: {x.result}</div>
            </div>
          ))}
        </div>
        <p className="mt-1 text-white/55">{schedMaths.capacityNote}.</p>
      </details>

      <div className="rounded-lg border border-white/10 p-3 space-y-2">
        <div className="font-semibold text-white">Create Tournament</div>
        {exec === "ready" && <p className="flex gap-1.5 text-emerald-200"><CheckCircle2 className="w-4 h-4 shrink-0" />{mapping.structured && allStages(def).length > def.divisions.length
          ? "Every division and every stage is created. Opening games are made when you generate them; each later stage shows as Pending and starts when the stage before it finishes."
          : "Every stage can run on today's tournament engine."}</p>}
        {exec === "partial" && (
          <div className="rounded border border-amber-300/40 bg-amber-500/10 p-2 space-y-1 text-amber-100">
            <div className="font-semibold">Can be created as a planning-stage tournament — some later stages can't run yet</div>
            <p>The opening stages are created. These stages need the new multi-stage engine and are <b>not</b> created; they stay saved in this draft:</p>
            <ul className="list-disc pl-4">{mapping.deferredStages.map((d, i) => <li key={i}>{d.division}: {d.stage} — {d.reason}</li>)}</ul>
            <label className="flex items-center gap-1.5 pt-1"><input type="checkbox" checked={ackPartial} onChange={(e) => setAckPartial(e.target.checked)} />I understand these stages won't be created now</label>
          </div>
        )}
        {exec === "blocked" && (
          <div className="rounded border border-red-400/40 bg-red-500/10 p-2 space-y-1 text-red-100">
            <div className="font-semibold">Can't be created yet</div>
            {mapping.unsupported.map((u, i) => <div key={i}>{u}</div>)}
            <p className="text-white/60">The design stays saved in this draft for preview.</p>
          </div>
        )}
        {requiredMissing.length > 0 && (
          <div className="space-y-0.5">
            <div className="text-red-200">Still missing ({requiredMissing.length}):</div>
            {requiredMissing.map((m) => <button key={m.id} onClick={() => onJump(m)} className="flex items-center gap-1 underline text-white/75"><CircleDot className="w-3 h-3" />{m.label}</button>)}
          </div>
        )}
        <p className="font-semibold text-white">{RESULT_NONE_NOTE}</p>
        <p className="text-white/55">Invitations are sent only later, when an admin presses Send on the tournament. No emails, WhatsApp messages, SMS or bookings are sent by creating it.</p>
        <p className="text-white/60">Owner: <span className="text-white">{ev.ownerName ?? "not chosen"}</span> · Host venue: <span className="text-white">{clubs.find((c) => c.id === hostClubId)?.name ?? "not chosen"}</span> <span className="text-white/45">— change these at the top of Design.</span></p>
        <Button size="sm" disabled={!canPress} onClick={() => setConfirm(true)}>{created ? "Already created" : "Create Tournament"}</Button>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create "{def.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates the tournament with all its divisions and stages. {RESULT_NONE_NOTE}
              {exec === "partial" && ` ${mapping.deferredStages.length} later stage(s) are not created and stay in the draft.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={create} disabled={busy}>Create Tournament</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
