import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, FlaskConical, Gem, Layers, ListChecks, Trash2, Wand2 } from "lucide-react";
import { SmartTournamentBuilderCore, type BuilderNav } from "@/pages/admin/SmartTournamentBuilder";
import { StepByStepBuilder } from "./StepByStepBuilder";
import { clearDraft, clearTournamentPlan, readDraft } from "@/lib/smart-builder/step-storage";
import { StepTournamentManagement } from "./StepTournamentManagement";
import { TemplatePicker } from "./StepTemplates";
import { loadHandovers, removeHandover, type Handover } from "@/lib/smart-builder/step-handover";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ClubChampsTab } from "@/components/club-admin/ClubChampsTab";
import { fromExt } from "@/lib/supabase-ext";

/**
 * Club-context host for the Tournament Beta.
 *
 * Landing/entry: a single primary entry point — "Build your tournament step
 * by step" — which opens the Step-by-Step Builder directly. The old builder
 * ("Guide me" / "I know what I want" draft list) is NOT deleted: it stays
 * reachable as a fallback via `?legacy=1` on this tab, but is removed from
 * the normal visible Beta entry experience. The production/Current Builder
 * (SmartTournamentBuilder route) is untouched.
 */
export function ClubTournamentBeta({ clubId, clubName, renderList }: {
  clubId: string; clubName?: string;
  /** Consolidated Tournaments home: the normal tournament list rendered under the start section; receives the Step-by-Step Manage opener. */
  renderList?: (manage: (tournamentId: string) => void) => ReactNode;
}) {
  const home = !!renderList;
  const [searchParams] = useSearchParams();
  const legacy = searchParams.get("legacy") === "1";
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [stepByStepOpen, setStepByStepOpen] = useState(false);
  /** Which setup the builder opens: a NEW tournament (null) or an existing tournament's setup. Never inferred. */
  const [editTid, setEditTid] = useState<string | null>(null);
  const [builderKey, setBuilderKey] = useState(0);
  const openNew = (fresh: boolean) => {
    if (fresh) clearDraft(clubId);
    setEditTid(null); setEditAt(null); setManaging(null); setBuilderKey((k) => k + 1); setStepByStepOpen(true);
  };
  const draft = readDraft(clubId);
  const [askDraft, setAskDraft] = useState(false);
  const [editAt, setEditAt] = useState<"Summary" | "Messaging" | null>(null);
  // ?manage=<id> deep-links straight into Manage (e.g. Standings "Review & approve next round").
  const [managing, setManaging] = useState<string | null>(() => searchParams.get("manage"));
  const [picker, setPicker] = useState<"mine" | "prebuilt" | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loadingHandovers, setLoadingHandovers] = useState(true);
  const [handoverError, setHandoverError] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | "draft" | null>(null);
  const refreshHandovers = async () => {
    setLoadingHandovers(true);
    setHandoverError(false);
    const saved = loadHandovers(clubId);
    if (!saved.length) { setHandovers([]); setLoadingHandovers(false); return; }
    try {
      // Local handovers survive a real tournament deletion. The club-scoped server
      // rows, not localStorage, are authoritative for whether a run still exists.
      const { data, error } = await fromExt("tournaments").select("id").eq("club_id", clubId).in("id", saved.map((h) => h.tournamentId));
      if (error) throw error;
      const live = new Set(((data ?? []) as Array<{ id: string }>).map((t) => t.id));
      saved.filter((h) => !live.has(h.tournamentId)).forEach((h) => {
        removeHandover(clubId, h.tournamentId);
        clearTournamentPlan(h.tournamentId);
      });
      setHandovers(loadHandovers(clubId));
    } catch {
      // A network/permissions error is not evidence of deletion; keep saved data.
      setHandovers([]);
      setHandoverError(true);
    } finally { setLoadingHandovers(false); }
  };
  useEffect(() => {
    void refreshHandovers();
    const onVisible = () => { if (document.visibilityState === "visible") void refreshHandovers(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [clubId, managing, stepByStepOpen]);
  const navigate = useNavigate();
  const [diamondOpen, setDiamondOpen] = useState(false);

  if (legacy) return <LegacyBetaHost clubId={clubId} clubName={clubName} open={legacyOpen} setOpen={setLegacyOpen} navigate={navigate} />;

  // Diamond League: the proven compact Diamond setup, data model and engine — never a Beta reinterpretation.
  if (diamondOpen) {
    return (
      <div className="space-y-2" data-field="beta-diamond-league">
        <Button size="sm" variant="ghost" onClick={() => setDiamondOpen(false)}>← Tournaments</Button>
        <ClubChampsTab clubId={clubId} launchDiamond onLaunchExit={() => setDiamondOpen(false)} />
      </div>
    );
  }

  if (managing) {
    return (
      <div className="dark rounded-xl bg-background p-4 text-foreground">
        <StepTournamentManagement key={managing} clubId={clubId} tournamentId={managing}
          onBack={() => { setManaging(null); setEditTid(null); }}
          onEditSetup={(at) => { setEditTid(managing); setManaging(null); setEditAt(at ?? "Summary"); setBuilderKey((k) => k + 1); setStepByStepOpen(true); }} />
      </div>
    );
  }

  if (stepByStepOpen) {
    return (
      <div className="dark rounded-xl bg-background p-4 text-foreground">
        <StepByStepBuilder key={`${editTid ?? "new"}-${builderKey}`} clubId={clubId} clubName={clubName} initialStep={editAt ?? undefined} tournamentId={editTid ?? undefined}
          onCompleted={(tid) => { setStepByStepOpen(false); setEditAt(null); setEditTid(null); setManaging(tid); }} />
      </div>
    );
  }

  if (draftId) {
    const nav: BuilderNav = {
      openDraft: setDraftId,
      backToList: () => setDraftId(null),
      exit: () => setDraftId(null),
      afterCreate: (id: string) => navigate(`/beta-tournament/${id}`),
    };
    return (
      <div className="dark rounded-xl bg-background p-4 text-foreground">
        <SmartTournamentBuilderCore scope={{ kind: "club", clubId, clubName }} draftId={draftId} nav={nav} />
      </div>
    );
  }

  if (picker) {
    return (
      <div className="dark rounded-xl bg-background p-4 text-foreground">
        <TemplatePicker clubId={clubId} mode={picker} onClose={() => setPicker(null)}
          onStartStep={() => { setPicker(null); openNew(false); }}
          onOpenDraft={(id) => { setPicker(null); setDraftId(id); }}
          onStartDiamond={() => { setPicker(null); setDiamondOpen(true); }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
    <div className="dark rounded-xl bg-background p-4 text-foreground">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-amber-300" /> {home ? "Tournaments" : "Tournament Beta"}
        </h2>
        {!home && <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[11px] text-amber-200 flex items-center gap-1">
          <FlaskConical className="w-3 h-3" />Beta testing · {clubName ?? "this club"}
        </span>}
      </div>
      <p className="mt-4 max-w-xl text-xs text-white/60">
        Set up your tournament by answering simple questions, one step at a time. Nothing is fixed until you confirm it.
      </p>
      <div className="mt-4 grid max-w-4xl gap-3 md:grid-cols-[1.4fr_1fr]">
      <button
        onClick={() => (draft ? setAskDraft(true) : openNew(true))}
        className="block w-full rounded-xl border border-amber-300/40 bg-amber-300/10 p-5 text-left transition-colors hover:bg-amber-300/15"
      >
        <div className="flex items-center gap-2 font-semibold text-white">
          <ListChecks className="w-5 h-5 text-amber-300" />
          Build your tournament step by step
          <ArrowRight className="ml-auto w-4 h-4 text-amber-200" />
        </div>
        <div className="mt-1 text-xs text-white/60">
          Walk through the what, who, format, schedule and payment questions in order — then review everything before anything is created.
        </div>
      </button>
      <div className="grid gap-3">
        <button onClick={() => setPicker("mine")} className="rounded-xl border border-white/15 p-4 text-left transition-colors hover:bg-white/5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white"><Layers className="h-4 w-4 text-amber-300" />Use one of my templates<ArrowRight className="ml-auto h-4 w-4 text-amber-200" /></div>
          <div className="mt-1 text-[11px] text-white/60">Start from a setup your club saved before, e.g. last year's Club Championships.</div>
        </button>
        <button onClick={() => setPicker("prebuilt")} className="rounded-xl border border-white/15 p-4 text-left transition-colors hover:bg-white/5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white"><Gem className="h-4 w-4 text-amber-300" />Pre-built templates<ArrowRight className="ml-auto h-4 w-4 text-amber-200" /></div>
          <div className="mt-1 text-[11px] text-white/60">Standard SquashHub formats.</div>
        </button>
      </div>
      </div>
      {askDraft && draft && (
        <div role="alertdialog" className="mt-3 max-w-xl space-y-2 rounded-lg border border-amber-300/40 p-3 text-sm text-white">
          <div>You have an unfinished new tournament draft{draft.name ? ` ("${draft.name}")` : ""} on this device. Start a fresh tournament (the draft is discarded) or continue the draft?</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { setAskDraft(false); openNew(true); }}>Start a new tournament</Button>
            <Button size="sm" variant="outline" onClick={() => { setAskDraft(false); openNew(false); }}>Continue draft</Button>
            <Button size="sm" variant="ghost" onClick={() => setAskDraft(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {draft && (
        <div className="mt-4 max-w-md space-y-1">
          <div className="text-xs text-white/60">Unfinished draft</div>
          <div className="flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1">
            <Button variant="ghost" className="min-w-0 flex-1 justify-between text-white" onClick={() => openNew(false)}>
              <span className="truncate">Continue draft{draft.name ? `: ${draft.name}` : ""}</span><ArrowRight className="h-4 w-4 shrink-0 text-amber-200" />
            </Button>
            <Button variant="ghost" size="icon" title="Remove unfinished draft" aria-label="Remove unfinished draft" onClick={() => setRemoveTarget("draft")}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
      {loadingHandovers && <div className="mt-4 text-xs text-white/60">Checking saved tournaments…</div>}
      {handoverError && <div className="mt-4 text-xs text-white/60">Could not check saved tournaments. <Button size="sm" variant="link" onClick={() => void refreshHandovers()}>Try again</Button></div>}
      {handovers.length > 0 && (
        <div className="mt-4 max-w-md space-y-1">
          <div className="text-xs text-white/60">Continue managing</div>
          {handovers.map((h) => (
            <div key={h.tournamentId} className="flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1">
              <Button variant="ghost" className="min-w-0 flex-1 justify-between text-white" onClick={() => setManaging(h.tournamentId)}>
                <span className="truncate">{h.name}</span><ArrowRight className="h-4 w-4 shrink-0 text-amber-200" />
              </Button>
              <Button variant="ghost" size="icon" title={`Remove build for ${h.name}`} aria-label={`Remove build for ${h.name}`} onClick={() => setRemoveTarget({ id: h.tournamentId, name: h.name })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      )}
      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removeTarget === "draft" ? "Remove unfinished draft?" : "Remove this builder card?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget === "draft"
                ? "This deletes only the unfinished setup saved on this device. No tournament will be deleted."
                : `This removes the Step-by-Step build for ${removeTarget?.name ?? "this tournament"} from this device. The real tournament, its fixtures, results and history will NOT be deleted. To delete the tournament itself, use the separate Delete tournament action in tournament management.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (removeTarget === "draft") clearDraft(clubId);
              else if (removeTarget) {
                removeHandover(clubId, removeTarget.id);
                clearTournamentPlan(removeTarget.id);
                setHandovers(loadHandovers(clubId));
              }
              setRemoveTarget(null);
              setBuilderKey((k) => k + 1);
            }}>{removeTarget === "draft" ? "Remove draft" : "Remove builder card only"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    {renderList?.((id) => { setEditTid(null); setManaging(id); })}
    </div>
  );
}

/**
 * Fallback host for the pre-existing Beta builder (draft list with
 * "Guide me" / "I know what I want"). Kept intact for reference/fallback;
 * only reachable with `?legacy=1`.
 */
function LegacyBetaHost({
  clubId,
  clubName,
  open,
  setOpen,
  navigate,
}: {
  clubId: string;
  clubName?: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const nav: BuilderNav = {
    openDraft: setDraftId,
    backToList: () => { setDraftId(null); setOpen(false); },
    exit: null,
    afterCreate: (id: string) => navigate(`/beta-tournament/${id}`),
  };
  return (
    <div className="dark rounded-xl bg-background p-4 text-foreground">
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Builder path">
        <Button size="sm" variant={open ? "default" : "outline"} onClick={() => setOpen(true)}>
          Current builder
        </Button>
        <Button size="sm" variant={open ? "outline" : "default"} onClick={() => setOpen(false)}>
          Step by Step
        </Button>
      </div>
      {open ? (
        <SmartTournamentBuilderCore scope={{ kind: "club", clubId, clubName }} draftId={draftId} nav={nav} />
      ) : (
        <StepByStepBuilder clubId={clubId} clubName={clubName} />
      )}
    </div>
  );
}
