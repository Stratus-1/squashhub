import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SmartTournamentBuilderCore, type BuilderNav } from "@/pages/admin/SmartTournamentBuilder";
import { StepByStepBuilder } from "./StepByStepBuilder";
import { Button } from "@/components/ui/button";

/**
 * Club-context host for the ONE Smart Tournament Builder implementation.
 * Drafts and created tournaments are owned by this club. The legacy
 * Tournaments tile stays untouched alongside it. "Step by Step" is a
 * separate guided path; the current builder is unchanged.
 */
export function ClubTournamentBeta({ clubId, clubName }: { clubId: string; clubName?: string }) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [path, setPath] = useState<"builder" | "steps">("builder");
  const navigate = useNavigate();
  const nav: BuilderNav = {
    openDraft: setDraftId,
    backToList: () => setDraftId(null),
    exit: null,
    afterCreate: (id: string) => navigate(`/beta-tournament/${id}`),
  };
  return (
    <div className="dark rounded-xl bg-background p-4 text-foreground">
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Builder path">
        <Button size="sm" variant={path === "builder" ? "default" : "outline"} onClick={() => setPath("builder")}>
          Current builder
        </Button>
        <Button size="sm" variant={path === "steps" ? "default" : "outline"} onClick={() => setPath("steps")}>
          Step by Step
        </Button>
      </div>
      {path === "builder" ? (
        <SmartTournamentBuilderCore scope={{ kind: "club", clubId, clubName }} draftId={draftId} nav={nav} />
      ) : (
        <StepByStepBuilder clubId={clubId} clubName={clubName} />
      )}
    </div>
  );
}
