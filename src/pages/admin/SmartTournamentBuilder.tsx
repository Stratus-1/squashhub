import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { ArrowLeft, Wand2, Send, Loader2, CheckCircle2, AlertTriangle, XCircle, Info, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useIsSuperAdmin, useSuperAdminStatus } from "@/hooks/use-club";
import { useHostClubs, useOwnerOrganisations } from "@/hooks/use-tournaments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DesignCanvas } from "@/components/smart-builder/DesignCanvas";
import { canUseSmartBuilder, SMART_BUILDER_LABEL, SMART_BUILDER_SUBLABEL } from "@/lib/smart-builder/access";
import { allStages, emptyDefinition, parseDefinition, type TournamentDefinition } from "@/lib/smart-builder/definition";
import { newProblems, validateDefinition, type Issue } from "@/lib/smart-builder/validate";
import { mapToExistingTournament } from "@/lib/smart-builder/to-existing";
import { sanitizeDraftPayload, sanitizeExtrasPayload } from "@/lib/tournaments/draft-payload";
import { cn } from "@/lib/utils";

type ChatMsg = { role: "user" | "assistant"; content: string };
type Proposal = {
  reply: string; understood: string[]; questions: { term: string | null; question: string; options: string[]; kind: string }[];
  notUnderstood: string[]; consequences: string[]; definition: TournamentDefinition; newIssues: Issue[];
};
type Draft = {
  id: string; title: string; mode: "guide" | "describe"; definition: unknown; conversation: ChatMsg[];
  status: string; created_tournament_id: string | null; updated_at: string;
};

const panel = "rounded-xl border border-white/10 bg-white/[0.04]";

export default function SmartTournamentBuilder() {
  const { isLoading } = useSuperAdminStatus();
  const isSuperAdmin = useIsSuperAdmin();
  const { draftId } = useParams();
  if (isLoading) return <div className="p-6 text-white/60 text-sm">Loading…</div>;
  if (!canUseSmartBuilder({ isSuperAdmin })) return <Navigate to="/admin/tournaments" replace />;
  return draftId ? <Workspace draftId={draftId} /> : <DraftList />;
}

function BetaHeader({ back }: { back: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild size="sm" variant="ghost" className="text-white/70"><Link to={back}><ArrowLeft className="w-4 h-4 mr-1" />Back</Link></Button>
      <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Wand2 className="w-5 h-5 text-amber-300" /> {SMART_BUILDER_LABEL}</h2>
      <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[11px] text-amber-200 flex items-center gap-1"><FlaskConical className="w-3 h-3" />{SMART_BUILDER_SUBLABEL}</span>
    </div>
  );
}

function DraftList() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: drafts = [] } = useQuery({
    queryKey: ["smart-drafts"],
    queryFn: async () => {
      const { data, error } = await fromExt("smart_tournament_drafts").select("id,title,mode,status,updated_at,created_tournament_id").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Draft[];
    },
  });
  const create = useMutation({
    mutationFn: async (mode: "guide" | "describe") => {
      const { data, error } = await fromExt("smart_tournament_drafts")
        .insert({ mode, title: "Untitled tournament", definition: emptyDefinition(), conversation: [] }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["smart-drafts"] }); nav(`/admin/tournaments/smart/${id}`); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="space-y-5 max-w-5xl py-4">
      <BetaHeader back="/admin/tournaments" />
      <p className="text-xs text-white/60">Describe a tournament, answer only what's unclear, then edit it visually. Nothing becomes a real tournament until you press Create Tournament. The existing setup is unchanged.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <button onClick={() => create.mutate("guide")} className={cn(panel, "p-4 text-left hover:bg-white/[0.08]")}>
          <div className="font-semibold text-white">Guide me</div>
          <div className="text-xs text-white/60">I'm not sure yet — ask me simple questions and help me build the format.</div>
        </button>
        <button onClick={() => create.mutate("describe")} className={cn(panel, "p-4 text-left hover:bg-white/[0.08]")}>
          <div className="font-semibold text-white">I know what I want</div>
          <div className="text-xs text-white/60">I'll describe it in my own words; ask only what's missing.</div>
        </button>
      </div>
      <div className={cn(panel, "divide-y divide-white/10")}>
        {drafts.length === 0 && <div className="p-4 text-xs text-white/50">No drafts yet.</div>}
        {drafts.map((d) => (
          <Link key={d.id} to={`/admin/tournaments/smart/${d.id}`} className="flex items-center justify-between p-3 text-sm text-white/85 hover:bg-white/[0.05]">
            <span>{d.title}</span>
            <span className="text-[11px] text-white/50">{d.status === "created" ? "Created" : "Draft"} · {new Date(d.updated_at).toLocaleString()}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

async function invokeError(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try { const b = await error.context.json(); return b?.error || "Request failed"; } catch { return "Request failed"; }
  }
  return (error as Error)?.message || "Request failed";
}

function Workspace({ draftId }: { draftId: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: draft, isLoading } = useQuery({
    queryKey: ["smart-draft", draftId],
    queryFn: async () => {
      const { data, error } = await fromExt("smart_tournament_drafts").select("*").eq("id", draftId).maybeSingle();
      if (error) throw error;
      return data as Draft | null;
    },
  });
  const [def, setDef] = useState<TournamentDefinition>(emptyDefinition());
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [thinking, setThinking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!draft) return;
    const p = parseDefinition(draft.definition);
    setDef(p.ok ? p.value : emptyDefinition(draft.title));
    setChat(Array.isArray(draft.conversation) ? draft.conversation : []);
  }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const validation = useMemo(() => validateDefinition(def), [def]);

  const save = async (nextDef = def, nextChat = chat) => {
    const { error } = await fromExt("smart_tournament_drafts").update({
      definition: nextDef, conversation: nextChat, title: nextDef.name || "Untitled tournament",
      validation: validateDefinition(nextDef).issues,
    }).eq("id", draftId);
    if (error) toast.error(`Draft not saved: ${error.message}`); else setDirty(false);
  };

  // Autosave manual edits.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => save(), 1200);
    return () => clearTimeout(t);
  }, [def, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    const nextChat = [...chat, { role: "user" as const, content: text }];
    setChat(nextChat); setInput(""); setThinking(true); setProposal(null);
    const { data, error } = await supabase.functions.invoke("smart-tournament-interpret", {
      body: { message: text, mode: draft?.mode ?? "describe", definition: def, history: chat.slice(-20) },
    });
    setThinking(false);
    if (error) {
      const msg = await invokeError(error);
      setChat([...nextChat, { role: "assistant", content: `⚠ ${msg}` }]);
      return;
    }
    const parsed = parseDefinition(data?.definition);
    const reply = String(data?.reply || "");
    const withReply = [...nextChat, { role: "assistant" as const, content: reply }];
    setChat(withReply);
    if (!parsed.ok) {
      setChat([...withReply, { role: "assistant", content: `I couldn't turn that into a valid structure (${"error" in parsed ? parsed.error : ""}). Could you say it another way?` }]);
      return;
    }
    const proposed = parsed.value;
    // Keep the AI's clarification questions on the definition so they block Build until answered.
    if ((data.questions?.length ?? 0) > 0 && proposed.questions.filter((q) => !q.resolved).length === 0) {
      proposed.questions = [
        ...proposed.questions,
        ...data.questions.map((q: any, i: number) => ({ id: `q_${Date.now()}_${i}`, term: q.term ?? undefined, question: q.question, options: q.options, kind: q.kind, resolved: false })),
      ];
    }
    proposed.understood = data.understood?.length ? data.understood : proposed.understood;
    proposed.notUnderstood = data.notUnderstood ?? proposed.notUnderstood;
    setProposal({
      reply, understood: data.understood ?? [], questions: data.questions ?? [], notUnderstood: data.notUnderstood ?? [],
      consequences: data.consequences ?? [], definition: proposed,
      newIssues: newProblems(validation, validateDefinition(proposed)),
    });
    save(def, withReply);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const applyProposal = () => {
    if (!proposal) return;
    setDef(proposal.definition);
    setProposal(null);
    save(proposal.definition, chat);
  };

  if (isLoading) return <div className="p-6 text-white/60 text-sm">Loading…</div>;
  if (!draft) return <div className="p-6 text-white/60 text-sm">Draft not found.</div>;

  const openQs = def.questions.filter((q) => !q.resolved);

  return (
    <div className="space-y-4 py-4">
      <BetaHeader back="/admin/tournaments/smart" />
      {draft.status === "created" && (
        <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-2 text-xs text-emerald-200">This draft has already been created as a tournament. Further edits stay in the draft only.</div>
      )}
      <div className="grid lg:grid-cols-[380px_1fr] gap-4">
        {/* ── Conversation ───────────────────────────────────────────── */}
        <div className={cn(panel, "flex flex-col h-[calc(100svh-180px)] min-h-[480px]")}>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
            {chat.length === 0 && (
              <p className="text-xs text-white/50">
                {draft.mode === "guide"
                  ? "Tell me roughly what you have in mind — e.g. 'a club doubles event over a month'. I'll ask simple questions."
                  : "Describe the tournament in your own words: divisions, pools, how players move on, dates and venues."}
              </p>
            )}
            {chat.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-8 rounded-lg bg-primary text-primary-foreground px-3 py-2" : "text-white/85 whitespace-pre-wrap"}>{m.content}</div>
            ))}
            {thinking && <div className="text-white/50 text-xs flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Thinking…</div>}
            {proposal && (
              <div className="rounded-lg border border-amber-300/40 bg-white/[0.05] p-3 space-y-2 text-xs text-white/85">
                <div className="font-semibold text-white">Here's what I understood</div>
                <ul className="list-disc pl-4 space-y-0.5">{proposal.understood.map((u, i) => <li key={i}>{u}</li>)}</ul>
                {proposal.notUnderstood.length > 0 && (
                  <div><div className="text-amber-200">I didn't understand:</div><ul className="list-disc pl-4">{proposal.notUnderstood.map((u, i) => <li key={i}>{u}</li>)}</ul></div>
                )}
                {proposal.questions.length > 0 && (
                  <div className="space-y-2">
                    {proposal.questions.map((q, i) => (
                      <div key={i}>
                        <div className={q.kind === "structural" ? "text-white" : "text-white/60"}>{q.kind === "operational" && "Later: "}{q.question}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {q.options.map((o) => (
                            <button key={o} onClick={() => { setInput((v) => (v ? `${v}\n` : "") + `${q.term ? `${q.term}: ` : ""}${o}`); inputRef.current?.focus(); }}
                              className="rounded-full border border-white/20 px-2 py-0.5 hover:bg-white/10">{o}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {(proposal.consequences.length > 0 || proposal.newIssues.length > 0) && (
                  <div className="rounded border border-red-400/40 bg-red-500/10 p-2 space-y-1">
                    <div className="font-semibold text-red-200">This change affects later stages</div>
                    {proposal.consequences.map((c, i) => <div key={`c${i}`}>{c}</div>)}
                    {proposal.newIssues.map((c, i) => <div key={`n${i}`}>• {c.message}{c.fix && <span className="text-white/60"> — {c.fix}</span>}</div>)}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={applyProposal}>{proposal.newIssues.length ? "Apply anyway" : "Build structure"}</Button>
                  <Button size="sm" variant="outline" className="bg-transparent border-white/20 text-white/80" onClick={() => { setProposal(null); inputRef.current?.focus(); }}>Change something</Button>
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-white/10 p-2 flex gap-2">
            <Textarea ref={inputRef} autoFocus value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={def.divisions.length ? "Answer, or ask for a change — e.g. 'Change Section 2 to 5 pools'" : "Describe your tournament…"}
              className="min-h-[60px] bg-white/5 border-white/15 text-white text-sm" />
            <Button size="icon" className="self-end h-9 w-9 shrink-0" disabled={thinking || !input.trim()} onClick={send}><Send className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* ── Workspace tabs ─────────────────────────────────────────── */}
        <div className={cn(panel, "p-3 min-w-0")}>
          <Tabs defaultValue="design">
            <TabsList className="bg-white/5">
              {["design", "players", "schedule", "invitations", "review"].map((t) => (
                <TabsTrigger key={t} value={t} className="text-xs uppercase">{t}{t === "review" && !validation.canCreate ? " •" : ""}</TabsTrigger>
              ))}
            </TabsList>
            {openQs.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-300/40 bg-amber-500/10 p-2 text-xs text-amber-100 space-y-1">
                <div className="font-semibold">Still to decide</div>
                {openQs.map((q) => (
                  <div key={q.id} className="flex items-center gap-2">
                    <span className="flex-1">{q.kind === "operational" ? "(later) " : ""}{q.question}</span>
                    <button className="underline text-white/70" onClick={() => { setDef({ ...def, questions: def.questions.map((x) => x.id === q.id ? { ...x, resolved: true, answer: "Resolved in design" } : x) }); setDirty(true); }}>Mark resolved</button>
                  </div>
                ))}
              </div>
            )}
            <TabsContent value="design" className="mt-3">
              <DesignCanvas def={def} validation={validation} onChange={(d) => { setDef(d); setDirty(true); }} />
            </TabsContent>
            <TabsContent value="players" className="mt-3"><PlayersTab def={def} validation={validation} /></TabsContent>
            <TabsContent value="schedule" className="mt-3"><ScheduleTab def={def} onChange={(d) => { setDef(d); setDirty(true); }} /></TabsContent>
            <TabsContent value="invitations" className="mt-3">
              <div className="text-xs text-white/70 space-y-2">
                <p>Invitations, registration and payment use the existing SquashHub flows once the tournament is created. Nothing is sent from the beta builder.</p>
                <ul className="list-disc pl-4">
                  {def.divisions.map((d) => <li key={d.id}>{d.name}: {d.eligibility.replace(/_/g, " ")}, {d.entry === "pairs" ? "players enter as pairs" : "players enter individually"}</li>)}
                </ul>
              </div>
            </TabsContent>
            <TabsContent value="review" className="mt-3">
              <ReviewTab def={def} validation={validation} draftId={draftId} created={draft.status === "created"}
                onCreated={(id) => { qc.invalidateQueries({ queryKey: ["smart-draft", draftId] }); toast.success("Tournament created as a draft in the existing setup."); nav("/admin/tournaments", { state: { openChampId: id } }); }} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function PlayersTab({ def, validation }: { def: TournamentDefinition; validation: ReturnType<typeof validateDefinition> }) {
  const rows = allStages(def);
  if (!rows.length) return <p className="text-xs text-white/50">No stages yet.</p>;
  return (
    <table className="w-full text-xs text-white/80">
      <thead className="text-white/50"><tr className="text-left"><th className="py-1">Stage</th><th>Comes from</th><th>In</th><th>Designed for</th><th>Matches</th><th>Each plays</th><th>Out</th></tr></thead>
      <tbody>
        {rows.map(({ division, section, stage }) => {
          const f = validation.flows[stage.id];
          const src = stage.input.fromStageId ? rows.find((r) => r.stage.id === stage.input.fromStageId)?.stage.name : "Registrations";
          return (
            <tr key={stage.id} className="border-t border-white/10">
              <td className="py-1">{def.divisions.length > 1 ? `${division.name} · ` : ""}{division.sections.length > 1 ? `${section.name} · ` : ""}{stage.name}</td>
              <td>{src}</td>
              <td>{f?.supply ?? "TBD"} {f?.unit}</td>
              <td>{f?.capacity ?? "—"}</td>
              <td>{f?.matches ?? "—"}</td>
              <td>{f?.matchesPerEntrant ?? "—"}</td>
              <td>{f?.outTotal ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ScheduleTab({ def, onChange }: { def: TournamentDefinition; onChange: (d: TournamentDefinition) => void }) {
  const rows = allStages(def).filter((r) => r.stage.kind !== "pair_from_positions" && r.stage.kind !== "split");
  const set = (id: string, p: Record<string, any>) => {
    const next = structuredClone(def);
    allStages(next).forEach((r) => { if (r.stage.id === id) r.stage.schedule = { ...r.stage.schedule, ...p }; });
    onChange(next);
  };
  const f = "h-8 bg-white/5 border-white/15 text-white text-xs";
  if (!rows.length) return <p className="text-xs text-white/50">No stages to schedule yet.</p>;
  return (
    <div className="space-y-2 text-xs text-white/80">
      <p className="text-white/50">Competition structure and scheduling are separate. Each stage can use its own approach.</p>
      {rows.map(({ stage, section, division }) => {
        const s = stage.schedule;
        return (
          <div key={stage.id} className="rounded-lg border border-white/10 p-2 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
            <div className="col-span-2 md:col-span-1 font-semibold text-white">{division.name} · {section.name} · {stage.name}</div>
            <select className="h-8 rounded-md bg-white/5 border border-white/15 text-white px-2" value={s.mode} onChange={(e) => set(stage.id, { mode: e.target.value })}>
              <option value="unset">Not set</option><option value="fixed">Fixed date</option><option value="play_by">Play by date</option>
              <option value="self_booking">Players arrange (booking window)</option><option value="admin">Admin schedules</option>
            </select>
            <Input type="date" className={f} value={s.startDate ?? ""} onChange={(e) => set(stage.id, { startDate: e.target.value || null })} />
            <Input type="date" className={f} value={s.endDate ?? ""} onChange={(e) => set(stage.id, { endDate: e.target.value || null })} />
            <Input className={f} placeholder="Venues (comma)" defaultValue={(s.venueNames ?? []).join(", ")} onBlur={(e) => set(stage.id, { venueNames: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!s.rotateVenues} onChange={(e) => set(stage.id, { rotateVenues: e.target.checked })} />Rotate venues</label>
            <Input className={f} placeholder="Courts per venue" value={s.courtsPerVenue ?? ""} onChange={(e) => set(stage.id, { courtsPerVenue: e.target.value ? Number(e.target.value) : null })} />
            <Input className={f} placeholder="Session minutes" value={s.sessionMinutes ?? ""} onChange={(e) => set(stage.id, { sessionMinutes: e.target.value ? Number(e.target.value) : null })} />
            <Input className={f} placeholder="Match minutes" value={s.matchMinutes ?? ""} onChange={(e) => set(stage.id, { matchMinutes: e.target.value ? Number(e.target.value) : null })} />
            <select className="h-8 rounded-md bg-white/5 border border-white/15 text-white px-2" value={s.weekday ?? ""} onChange={(e) => set(stage.id, { weekday: e.target.value === "" ? null : Number(e.target.value) })}>
              <option value="">Any day</option>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => <option key={d} value={i}>Every {d}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function ReviewTab({ def, validation, draftId, created, onCreated }: {
  def: TournamentDefinition; validation: ReturnType<typeof validateDefinition>; draftId: string; created: boolean; onCreated: (id: string) => void;
}) {
  const { data: clubs = [] } = useHostClubs();
  const { data: orgs = [] } = useOwnerOrganisations();
  const [hostClubId, setHostClubId] = useState("");
  const [ownerOrgId, setOwnerOrgId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const mapping = useMemo(() => mapToExistingTournament(def), [def]);
  const icon = (l: Issue["level"]) => l === "error" ? <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" /> : l === "warning" ? <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" /> : <Info className="w-3.5 h-3.5 text-sky-300 shrink-0 mt-0.5" />;
  const blockers = validation.issues.filter((i) => i.level === "error").length + mapping.unsupported.length;

  const create = async () => {
    setBusy(true);
    try {
      const { data, error } = await fromExt("club_champs")
        .insert(sanitizeDraftPayload({ club_id: hostClubId, owner_org_id: ownerOrgId || undefined, status: "planning", ...mapping.champ }))
        .select("id").single();
      if (error) throw error;
      const { error: exErr } = await fromExt("tournaments").update(sanitizeExtrasPayload(mapping.extras)).eq("id", data.id);
      if (exErr) console.warn("extras", exErr.message);
      await fromExt("smart_tournament_drafts").update({ status: "created", created_tournament_id: data.id }).eq("id", draftId);
      onCreated(data.id);
    } catch (e: any) {
      toast.error(`Create failed: ${e.message}`);
    } finally { setBusy(false); setConfirm(false); }
  };

  return (
    <div className="space-y-4 text-xs text-white/85">
      <div className="flex items-center gap-2 text-sm">
        {validation.canCreate ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
        {validation.canCreate ? "The structure is valid." : "Fix the problems below before creating."}
      </div>
      {validation.facts.length > 0 && (
        <div><div className="font-semibold text-white mb-1">The maths</div><ul className="list-disc pl-4 space-y-0.5">{validation.facts.map((f, i) => <li key={i}>{f}</li>)}</ul></div>
      )}
      <ul className="space-y-1">{validation.issues.map((i, k) => <li key={k} className="flex gap-2">{icon(i.level)}<span>{i.message}{i.fix && <span className="text-white/55"> — {i.fix}</span>}</span></li>)}</ul>
      {mapping.unsupported.length > 0 && (
        <div className="rounded-lg border border-amber-300/40 bg-amber-500/10 p-2 space-y-1">
          <div className="font-semibold text-amber-100">Preview only in this beta</div>
          {mapping.unsupported.map((u, i) => <div key={i}>{u}</div>)}
        </div>
      )}
      <div className="rounded-lg border border-white/10 p-3 space-y-2">
        <div className="font-semibold text-white">Create Tournament</div>
        <p className="text-white/60">Creates a planning-stage tournament in the existing setup. Invitations, players, fees and fixtures are then managed there as usual.</p>
        <div className="grid md:grid-cols-2 gap-2">
          <select className="h-8 rounded-md bg-white/5 border border-white/15 text-white px-2" value={ownerOrgId} onChange={(e) => setOwnerOrgId(e.target.value)}>
            <option value="">Organised by…</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.kind})</option>)}
          </select>
          <select className="h-8 rounded-md bg-white/5 border border-white/15 text-white px-2" value={hostClubId} onChange={(e) => setHostClubId(e.target.value)}>
            <option value="">Host club…</option>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <Button size="sm" disabled={created || blockers > 0 || !hostClubId || busy} onClick={() => setConfirm(true)}>
          {created ? "Already created" : "Create Tournament"}
        </Button>
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create "{def.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This creates a real tournament (planning stage, no invitations sent) in the existing tournament setup.</AlertDialogDescription>
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
