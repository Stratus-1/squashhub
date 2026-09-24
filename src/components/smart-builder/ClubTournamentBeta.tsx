import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SmartTournamentBuilderCore, type BuilderNav } from "@/pages/admin/SmartTournamentBuilder";

/**
 * Club-context host for the ONE Smart Tournament Builder implementation.
 * Drafts and created tournaments are owned by this club. The legacy
 * Tournaments tile stays untouched alongside it.
 */
export function ClubTournamentBeta({ clubId, clubName }: { clubId: string; clubName?: string }) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const navigate = useNavigate();
  const nav: BuilderNav = {
    openDraft: setDraftId,
    backToList: () => setDraftId(null),
    exit: null,
    afterCreate: () => navigate("/club-admin?tab=champs"),
  };
  return (
    <div className="dark rounded-xl bg-background p-4 text-foreground">
      <SmartTournamentBuilderCore scope={{ kind: "club", clubId, clubName }} draftId={draftId} nav={nav} />
    </div>
  );
}
