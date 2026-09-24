import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { ArrowLeft, Wand2, Send, Loader2, FlaskConical, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useIsSuperAdmin, useSuperAdminStatus } from "@/hooks/use-club";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VoiceInputButton } from "@/components/smart-builder/VoiceInputButton";
import { DesignCanvas } from "@/components/smart-builder/DesignCanvas";
import { QuickSetup } from "@/components/smart-builder/QuickSetup";
import { TournamentDatesCard } from "@/components/smart-builder/DateControls";
import { EventSetupSection } from "@/components/smart-builder/EventSetupSection";
import { StageBuilder } from "@/components/smart-builder/StageBuilder";
import { QUICK_PATHS, presetDefinition, type QuickPath } from "@/lib/smart-builder/quick-path";
import { InvitationsTab, PlayersTab, ReviewTab, ScheduleTab } from "@/components/smart-builder/BuilderTabs";
import { canUseSmartBuilder, SMART_BUILDER_LABEL, SMART_BUILDER_SUBLABEL } from "@/lib/smart-builder/access";
import { emptyDefinition, isBellsDefinition, parseDefinition, type TournamentDefinition } from "@/lib/smart-builder/definition";
import { newProblems, validateDefinition, type Issue } from "@/lib/smart-builder/validate";
import { mapToExistingTournament } from "@/lib/smart-builder/to-existing";
import { assessReadiness, type ReadinessItem, type ReadinessTab } from "@/lib/smart-builder/readiness";
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

/**
 * Where the builder is running. One implementation, two contexts:
 * - platform: Super Admin panel (federation/association drafts, any host club)
 * - club: a beta club's admin area, locked to that club's ownership and courts
 */
export type BuilderScope = { kind: "platform" } | { kind: "club"; clubId: string; clubName?: string };

export interface BuilderNav {
  openDraft: (id: string) => void;
  backToList: () => void;
  /** Back from the draft list (null = no back button) */
  exit: (() => void) | null;
  afterCreate: (tournamentId: string) => void;
}

export default function SmartTournamentBuilder() {
  const { isLoading } = useSuperAdminStatus();
  const isSuperAdmin = useIsSuperAdmin();
  const { draftId } = useParams();
  const navigate = useNavigate();
  if (isLoading) return <div className="p-6 text-white/60 text-sm">Loading…</div>;
  if (!canUseSmartBuilder({ isSuperAdmin })) return <Navigate to="/admin/tournaments" replace />;
  const nav: BuilderNav = {
    openDraft: (id) => navigate(`/admin/tournaments/smart/${id}`),
    backToList: () => navigate("/admin/tournaments/smart"),
    exit: () => navigate("/admin/tournaments"),
    afterCreate: (id) => navigate("/admin/tournaments", { state: { openChampId: id } }),
  };
  return <SmartTournamentBuilderCore scope={{ kind: "platform" }} draftId={draftId ?? null} nav={nav} />;
}

export function SmartTournamentBuilderCore({ scope, draftId, nav }: { scope: BuilderScope; draftId: string | null; nav: BuilderNav }) {
  return draftId ? <Workspace draftId={draftId} scope={scope} nav={nav} /> : <DraftList scope={scope} nav={nav} />;
}

function BetaHeader({ onBack, scope }: { onBack: (() => void) | null; scope: BuilderScope }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {onBack && <Button size="sm" variant="ghost" className="text-white/70" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>}
      <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Wand2 className="w-5 h-5 text-amber-300" /> {scope.kind === "club" ? "Tournament Beta" : SMART_BUILDER_LABEL}</h2>
      <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[11px] text-amber-200 flex items-center gap-1"><FlaskConical className="w-3 h-3" />{scope.kind === "club" ? `Beta testing · ${scope.clubName ?? "this club"}` : SMART_BUILDER_SUBLABEL}</span>
    </div>
  );
}

function DraftList({ scope, nav }: { scope: BuilderScope; nav: BuilderNav }) {
  const qc = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<Draft | null>(null);
  const [pickPath, setPickPath] = useState(false);
  const scopeKey = scope.kind === "club" ? scope.clubId : "platform";
  const { data: drafts = [] } = useQuery({
    queryKey: ["smart-drafts", scopeKey],
    queryFn: async () => {
      let q = fromExt("smart_tournament_drafts").select("id,title,mode,status,updated_at,created_tournament_id");
      q = scope.kind === "club" ? q.eq("owner_kind", "club").eq("owner_id", scope.clubId) : q.neq("owner_kind", "club");
      const { data, error } = await q.order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Draft[];
    },
  });
  const create = useMutation({
    mutationFn: async ({ mode, path }: { mode: "guide" | "describe"; path?: QuickPath }) => {
      const owner = scope.kind === "club" ? { owner_kind: "club", owner_id: scope.clubId } : {};
      const { data, error } = await fromExt("smart_tournament_drafts")
        .insert({ mode, title: "Untitled tournament", definition: path ? presetDefinition(path) : emptyDefinition(), conversation: [], ...owner }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["smart-drafts"] }); nav.openDraft(id); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (draft: Draft) => {
      if (draft.status === "created") throw new Error("This draft already created a real tournament and can't be deleted here.");
      const { error } = await fromExt("smart_tournament_drafts").delete().eq("id", draft.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["smart-drafts"] }); setPendingDelete(null); toast.success("Draft deleted"); },
    onError: (e: any) => { setPendingDelete(null); toast.error(e.message); },
  });
  return (
    <div className="space-y-5 max-w-5xl py-4">
      <BetaHeader onBack={nav.exit} scope={scope} />
      <p className="text-xs text-white/60">Describe a tournament, answer only what's unclear, then edit it visually. Nothing becomes a real tournament until you press Create Tournament. The existing setup is unchanged.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <button onClick={() => create.mutate({ mode: "guide" })} className={cn(panel, "p-4 text-left hover:bg-white/[0.08]")}>
          <div className="font-semibold text-white">Guide me</div>
          <div className="text-xs text-white/60">I'm not sure yet — ask me simple questions and help me build the format.</div>
        </button>
        <button onClick={() => setPickPath((v) => !v)} className={cn(panel, "p-4 text-left hover:bg-white/[0.08]", pickPath && "ring-1 ring-amber-300/60")}>
          <div className="font-semibold text-white">I know what I want</div>
          <div className="text-xs text-white/60">Pick how matches are played; pools and play-offs are asked next, only if relevant.</div>
        </button>
      </div>
      {pickPath && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {QUICK_PATHS.map((p) => (
            <button key={p.key} disabled={create.isPending} onClick={() => create.mutate({ mode: "describe", path: p.key })} className={cn(panel, "p-3 text-left hover:bg-white/[0.08]")}>
              <div className="font-semibold text-white text-sm">{p.label}</div>
              <div className="text-[11px] text-white/60">{p.hint}</div>
            </button>
          ))}
        </div>
      )}
      <div className={cn(panel, "divide-y divide-white/10")}>
        {drafts.length === 0 && <div className="p-4 text-xs text-white/50">No drafts yet.</div>}
        {drafts.map((d) => (
          <div key={d.id} className="flex w-full items-center hover:bg-white/[0.05]">
            <button onClick={() => nav.openDraft(d.id)} className="flex flex-1 items-center justify-between p-3 text-left text-sm text-white/85">
              <span>{d.title}</span>
              <span className="text-[11px] text-white/50">{d.status === "created" ? "Created" : "Draft"} · {new Date(d.updated_at).toLocaleString()}</span>
            </button>
            {d.status !== "created" && (
              <button
                aria-label={`Delete ${d.title}`}
                onClick={() => setPendingDelete(d)}
                className="p-3 text-white/40 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title}” will be permanently removed. This only deletes the builder draft — no real tournament exists for it yet. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && remove.mutate(pendingDelete)}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Deleting…" : "Delete draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

async function invokeError(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try { const b = await error.context.json(); return b?.error || "Request failed"; } catch { return "Request failed"; }
  }
  return (error as Error)?.message || "Request failed";
}

function Workspace({ draftId, scope, nav }: { draftId: string; scope: BuilderScope; nav: BuilderNav }) {
  const qc = useQueryClient();
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
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  // Text already in the box when a voice transcript starts — the transcript is appended to it.
  const voiceBase = useRef<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    const p = parseDefinition(draft.definition);
    setDef(p.ok ? p.value : emptyDefinition(draft.title));
    setChat(Array.isArray(draft.conversation) ? draft.conversation : []);
  }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const validation = useMemo(() => validateDefinition(def), [def]);
  const mapping = useMemo(() => mapToExistingTournament(def), [def]);
  const readiness = useMemo(() => assessReadiness(def, validation, mapping), [def, validation, mapping]);
  const [tab, setTab] = useState<ReadinessTab>("design");
  const tabsRef = useRef<HTMLDivElement>(null);
  /** Every form edit goes through here: one draft, autosaved. */
  const edit = (mut: (d: TournamentDefinition) => void) => {
    setDef((prev) => { const next = structuredClone(prev); mut(next); return next; });
    setDirty(true);
  };
  const jump = (item: ReadinessItem) => {
    setTab(item.tab);
    if (!item.field) return;
    setTimeout(() => {
      const el = tabsRef.current?.querySelector<HTMLElement>(`[data-field="${item.field}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-amber-300");
      setTimeout(() => el.classList.remove("ring-2", "ring-amber-300"), 2200);
    }, 80);
  };

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
      body: {
        message: text, mode: draft?.mode ?? "describe", definition: def, history: chat.slice(-20),
        clubId: scope.kind === "club" ? scope.clubId : undefined,
        // Deterministic readiness: the AI asks for the next required item instead of the organiser discovering it later.
        missing: readiness.missing.slice(0, 8).map((m) => ({ section: m.tab, item: m.label, question: m.ask ?? m.detail })),
      },
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
      <BetaHeader onBack={nav.backToList} scope={scope} />
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
            <div className="flex-1 space-y-1">
              <Textarea ref={inputRef} autoFocus value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={def.divisions.length ? "Answer, or ask for a change — e.g. 'Change Section 2 to 5 pools'" : "Describe your tournament — type, or tap the mic and speak…"}
                className="min-h-[60px] bg-white/5 border-white/15 text-white text-sm" />
              {voiceNote && <p className="text-[11px] text-amber-200">{voiceNote}</p>}
              {voiceErr && <p className="text-[11px] text-red-300" role="alert">{voiceErr}</p>}
            </div>
            <div className="flex flex-col items-end justify-end gap-1">
              <VoiceInputButton clubId={scope.kind === "club" ? scope.clubId : undefined} disabled={thinking}
                onError={(m) => { if (m) voiceBase.current = null; setVoiceErr(m); }}
                onTranscript={(t, final) => {
                  if (voiceBase.current === null) voiceBase.current = input.trim() ? `${input.trim()} ` : "";
                  setInput(voiceBase.current + t);
                  if (final) { voiceBase.current = null; setVoiceNote("Check the transcript, fix anything, then press Send."); inputRef.current?.focus(); }
                }} />
              <Button size="icon" className="h-9 w-9 shrink-0" disabled={thinking || !input.trim()} onClick={() => { setVoiceNote(null); send(); }}><Send className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>

        {/* ── Workspace tabs ─────────────────────────────────────────── */}
        <div ref={tabsRef} className={cn(panel, "p-3 min-w-0")}>
          <Tabs value={tab} onValueChange={(v) => setTab(v as ReadinessTab)}>
            <TabsList className="bg-white/5 flex-wrap h-auto">
              {(["design", "players", "schedule", "invitations", "review"] as const).map((t) => {
                const st = t === "review" ? (readiness.missing.length ? "missing" : "complete") : readiness.sections.find((s) => s.key === t)?.state;
                return (
                  <TabsTrigger key={t} value={t} className="text-xs uppercase gap-1">
                    {t}{st === "missing" && <span className="h-1.5 w-1.5 rounded-full bg-red-400" aria-label="missing information" />}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {readiness.nextMissing && draft.status !== "created" && (
              <button onClick={() => jump(readiness.nextMissing!)} className="mt-3 w-full text-left rounded-lg border border-amber-300/40 bg-amber-500/10 p-2 text-xs text-amber-100">
                <span className="font-semibold">Next to decide ({readiness.missing.length} left): </span>
                {readiness.nextMissing.ask ?? readiness.nextMissing.label} <span className="underline text-white/70">Go there</span>
              </button>
            )}
            {openQs.length > 0 && (
              <div data-field="questions" className="mt-3 rounded-lg border border-amber-300/40 bg-amber-500/10 p-2 text-xs text-amber-100 space-y-1">
                <div className="font-semibold">Still to decide</div>
                {openQs.map((q) => (
                  <div key={q.id} className="flex items-center gap-2">
                    <span className="flex-1">{q.kind === "operational" ? "(later) " : ""}{q.question}</span>
                    <button className="underline text-white/70" onClick={() => edit((d) => { d.questions = d.questions.map((x) => x.id === q.id ? { ...x, resolved: true, answer: "Resolved in design" } : x); })}>Mark resolved</button>
                  </div>
                ))}
              </div>
            )}
            <TabsContent value="design" className="mt-3 space-y-3">
              <TournamentDatesCard def={def} edit={edit} />
              <EventSetupSection def={def} edit={edit} scope={scope} />
              {def.quickPath && def.quickPath !== "custom" && <QuickSetup def={def} edit={edit} />}
              {def.quickPath === "custom" && <StageBuilder def={def} edit={edit} />}
              <ScoringRow def={def} edit={edit} />
              <div data-field="canvas" className={def.quickPath ? "hidden" : undefined}><DesignCanvas def={def} validation={validation} onChange={(d) => { setDef(d); setDirty(true); }} /></div>
            </TabsContent>
            <TabsContent value="players" className="mt-3"><PlayersTab def={def} validation={validation} edit={edit} /></TabsContent>
            <TabsContent value="schedule" className="mt-3"><ScheduleTab def={def} edit={edit} /></TabsContent>
            <TabsContent value="invitations" className="mt-3"><InvitationsTab def={def} edit={edit} /></TabsContent>
            <TabsContent value="review" className="mt-3">
              <ReviewTab scope={scope} def={def} readiness={readiness} mapping={mapping} validation={validation} draftId={draftId} created={draft.status === "created"} onJump={jump}
                onCreated={(id) => { qc.invalidateQueries({ queryKey: ["smart-draft", draftId] }); toast.success("Tournament created in the existing setup. No invitations were sent."); nav.afterCreate(id); }} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function ScoringRow({ def, edit }: { def: TournamentDefinition; edit: (m: (d: TournamentDefinition) => void) => void }) {
  const s = def.scoring ?? {};
  const bells = isBellsDefinition(def);
  const set = (p: Partial<typeof s>) => edit((d) => { d.scoring = { ...d.scoring, ...p }; });
  const sel = "smart-builder-select h-7 rounded-md bg-white/5 border border-white/15 text-white px-2 text-xs";
  return (
    <div data-field="scoring" className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 p-2 text-xs text-white/75">
      <span className="font-semibold text-white">Scoring</span>
      <select aria-label="Scoring format" className={sel} value={bells ? "time_capped_points" : "standard"} onChange={(e) => set({ mode: e.target.value as "standard" | "time_capped_points" })}>
        <option value="standard">Standard games</option><option value="time_capped_points">Bells — timed points</option>
      </select>
      {bells ? <span className="text-white/70">Timed points · match length on Schedule</span> : <>
      <select className={sel} value={s.pointsPerGame ?? ""} onChange={(e) => set({ pointsPerGame: e.target.value ? (Number(e.target.value) as 11 | 15) : null })}>
        <option value="">PAR — default 11</option><option value="11">PAR 11</option><option value="15">PAR 15</option>
      </select>
      <select className={sel} value={s.bestOf ?? ""} onChange={(e) => set({ bestOf: e.target.value ? (Number(e.target.value) as 3 | 5) : null })}>
        <option value="">Best of — default 5</option><option value="3">Best of 3</option><option value="5">Best of 5</option>
      </select>
      <select className={sel} value={s.winCondition ?? ""} onChange={(e) => set({ winCondition: (e.target.value || null) as any })}>
        <option value="">Win by 2 (default)</option><option value="win_by_2">Win by 2</option><option value="sudden_death">Sudden death</option>
      </select>
      <label className="flex items-center gap-1"><input type="checkbox" checked={!!s.playAllGames} onChange={(e) => set({ playAllGames: e.target.checked })} />Play all games</label>
      </>}
    </div>
  );
}
