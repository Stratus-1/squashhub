import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, FlaskConical, Gem, Layers, ListChecks, Wand2 } from "lucide-react";
import { SmartTournamentBuilderCore, type BuilderNav } from "@/pages/admin/SmartTournamentBuilder";
import { StepByStepBuilder } from "./StepByStepBuilder";
import { clearDraft, readDraft } from "@/lib/smart-builder/step-storage";
import { StepTournamentManagement } from "./StepTournamentManagement";
import { TemplatePicker } from "./StepTemplates";
import { loadHandovers } from "@/lib/smart-builder/step-handover";
import { Button } from "@/components/ui/button";

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
export function ClubTournamentBeta({ clubId, clubName }: { clubId: string; clubName?: string }) {
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
  const [managing, setManaging] = useState<string | null>(null);
  const [picker, setPicker] = useState<"mine" | "prebuilt" | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const handovers = loadHandovers(clubId);
  const navigate = useNavigate();

  if (legacy) return <LegacyBetaHost clubId={clubId} clubName={clubName} open={legacyOpen} setOpen={setLegacyOpen} navigate={navigate} />;

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
          onOpenDraft={(id) => { setPicker(null); setDraftId(id); }} />
      </div>
    );
  }

  return (
    <div className="dark rounded-xl bg-background p-4 text-foreground">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-amber-300" /> Tournament Beta
        </h2>
        <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[11px] text-amber-200 flex items-center gap-1">
          <FlaskConical className="w-3 h-3" />Beta testing · {clubName ?? "this club"}
        </span>
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
          <div className="mt-1 text-[11px] text-white/60">Standard SquashHub formats, including Diamond League.</div>
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
          <button onClick={() => openNew(false)} className="flex w-full items-center justify-between rounded-lg border border-white/15 px-3 py-2 text-left text-sm text-white hover:bg-white/5">
            Continue draft{draft.name ? `: ${draft.name}` : ""}<ArrowRight className="h-4 w-4 text-amber-200" />
          </button>
        </div>
      )}
      {handovers.length > 0 && (
        <div className="mt-4 max-w-md space-y-1">
          <div className="text-xs text-white/60">Continue managing</div>
          {handovers.map((h) => (
            <button key={h.tournamentId} onClick={() => setManaging(h.tournamentId)} className="flex w-full items-center justify-between rounded-lg border border-white/15 px-3 py-2 text-left text-sm text-white hover:bg-white/5">
              {h.name}<ArrowRight className="h-4 w-4 text-amber-200" />
            </button>
          ))}
        </div>
      )}
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
