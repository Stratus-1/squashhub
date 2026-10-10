import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, FlaskConical, Gem, Layers, ListChecks, Trash2, Wand2 } from "lucide-react";
import { SmartTournamentBuilderCore, type BuilderNav } from "@/pages/admin/SmartTournamentBuilder";
import { StepByStepBuilder } from "./StepByStepBuilder";
import { clearDraft, readDraft } from "@/lib/smart-builder/step-storage";
import { StepTournamentManagement } from "./StepTournamentManagement";
import { TemplatePicker } from "./StepTemplates";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ClubChampsTab } from "@/components/club-admin/ClubChampsTab";

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
  const [stepByStepOpen, setStepByStepOpen] = useState(() => !!searchParams.get("setup"));
  /** Which setup the builder opens: a NEW tournament (null) or an existing tournament's setup. Never inferred. */
  // ?setup=<id>&step=Courts deep-links into an existing tournament's setup (e.g. from "Assign courts & times").
  const [editTid, setEditTid] = useState<string | null>(() => searchParams.get("setup"));
  const [builderKey, setBuilderKey] = useState(0);
  const openNew = (fresh: boolean) => {
    if (fresh) clearDraft(clubId);
    setEditTid(null); setEditAt(null); setManaging(null); setBuilderKey((k) => k + 1); setStepByStepOpen(true);
  };
  const draft = readDraft(clubId);
  const [askDraft, setAskDraft] = useState(false);
  const [editAt, setEditAt] = useState<"Summary" | "Messaging" | "Courts" | "Guide" | "Schedule" | null>(() => (searchParams.get("setup") && searchParams.get("step") === "Courts" ? "Courts" : null));
  // ?manage=<id> deep-links straight into Manage (e.g. Standings "Review & approve next round").
  const [managing, setManaging] = useState<string | null>(() => searchParams.get("manage"));
  const [picker, setPicker] = useState<"mine" | "prebuilt" | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<"draft" | null>(null);
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
      <div className="rounded-xl bg-background p-4 text-foreground">
        <StepTournamentManagement key={managing} clubId={clubId} tournamentId={managing}
          onBack={() => { setManaging(null); setEditTid(null); }}
          onEditSetup={(at) => { setEditTid(managing); setManaging(null); setEditAt(at ?? "Summary"); setBuilderKey((k) => k + 1); setStepByStepOpen(true); }} />
      </div>
    );
  }

  if (stepByStepOpen) {
    return (
      <div className="rounded-xl bg-background p-4 text-foreground">
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
      <div className="rounded-xl bg-background p-4 text-foreground">
        <TemplatePicker clubId={clubId} mode={picker} onClose={() => setPicker(null)}
          onStartStep={() => { setPicker(null); openNew(false); setEditAt("Summary"); }}
          onOpenDraft={(id) => { setPicker(null); setDraftId(id); }}
          onStartDiamond={() => { setPicker(null); setDiamondOpen(true); }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
    <div className="rounded-xl bg-background p-4 text-foreground">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-amber-600 dark:text-amber-300" /> Tournaments
        </h2>
        {!home && <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-200 flex items-center gap-1">
          {clubName ?? "this club"}
        </span>}
      </div>
      <p className="mt-4 max-w-xl text-xs text-muted-foreground">
        Set up your tournament by answering simple questions, one step at a time. Nothing is fixed until you confirm it.
      </p>
      <div className="mt-4 grid max-w-4xl gap-3 md:grid-cols-[1.4fr_1fr]">
      <button
        onClick={() => (draft ? setAskDraft(true) : openNew(true))}
        className="block w-full rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-left transition-colors hover:bg-amber-500/15"
      >
        <div className="flex items-center gap-2 font-semibold">
          <ListChecks className="w-5 h-5 text-amber-600 dark:text-amber-300" />
          Build your tournament step by step
          <ArrowRight className="ml-auto w-4 h-4 text-amber-600 dark:text-amber-200" />
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Walk through the what, who, format, schedule and payment questions in order — then review everything before anything is created.
        </div>
      </button>
      <div className="grid gap-3">
        <button onClick={() => setPicker("mine")} className="rounded-xl border p-4 text-left transition-colors hover:bg-muted/50">
          <div className="flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4 text-amber-600 dark:text-amber-300" />Use one of my templates<ArrowRight className="ml-auto h-4 w-4 text-amber-600 dark:text-amber-200" /></div>
          <div className="mt-1 text-[11px] text-muted-foreground">Start from a setup your club saved before, e.g. last year's Club Championships.</div>
        </button>
        <button onClick={() => setPicker("prebuilt")} className="rounded-xl border p-4 text-left transition-colors hover:bg-muted/50">
          <div className="flex items-center gap-2 text-sm font-semibold"><Gem className="h-4 w-4 text-amber-600 dark:text-amber-300" />Pre-built templates<ArrowRight className="ml-auto h-4 w-4 text-amber-600 dark:text-amber-200" /></div>
          <div className="mt-1 text-[11px] text-muted-foreground">Standard SquashHub formats.</div>
        </button>
      </div>
      </div>
      {askDraft && draft && (
        <div role="alertdialog" className="mt-3 max-w-xl space-y-2 rounded-lg border border-amber-500/40 p-3 text-sm">
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
          <div className="text-xs text-muted-foreground">Unfinished draft</div>
          <div className="flex items-center gap-1 rounded-lg border px-2 py-1">
            <Button variant="ghost" className="min-w-0 flex-1 justify-between" onClick={() => openNew(false)}>
              <span className="truncate">Continue draft{draft.name ? `: ${draft.name}` : ""}</span><ArrowRight className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-200" />
            </Button>
            <Button variant="ghost" size="icon" title="Remove unfinished draft" aria-label="Remove unfinished draft" onClick={() => setRemoveTarget("draft")}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove unfinished draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes only the unfinished setup saved on this device. No tournament will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              clearDraft(clubId);
              setRemoveTarget(null);
              setBuilderKey((k) => k + 1);
            }}>Remove draft</AlertDialogAction>
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
