import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, FlaskConical, ListChecks, Wand2 } from "lucide-react";
import { SmartTournamentBuilderCore, type BuilderNav } from "@/pages/admin/SmartTournamentBuilder";
import { StepByStepBuilder } from "./StepByStepBuilder";
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
  const navigate = useNavigate();

  if (legacy) return <LegacyBetaHost clubId={clubId} clubName={clubName} open={legacyOpen} setOpen={setLegacyOpen} navigate={navigate} />;

  if (stepByStepOpen) {
    return (
      <div className="dark rounded-xl bg-background p-4 text-foreground">
        <StepByStepBuilder clubId={clubId} clubName={clubName} />
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
      <button
        onClick={() => setStepByStepOpen(true)}
        className="mt-4 block w-full max-w-md rounded-xl border border-amber-300/40 bg-amber-300/10 p-5 text-left transition-colors hover:bg-amber-300/15"
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
