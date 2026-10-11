import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AssignStageSlotsDialog } from "@/components/tournaments/AssignStageSlotsDialog";
import { DrawNoticeDialog } from "./DrawNoticeDialog";
import { applyStageSlotAssignments, planStageSlotAssignments } from "@/lib/tournaments/stage-slot-assign";
import { drawNoticeKey, drawNoticeSent, drawNotifyOn, type DrawScope } from "@/lib/smart-builder/draw-notice";
import { fromExt } from "@/lib/supabase-ext";

/**
 * After a stage draw is generated: (1) give its games the saved session's courts & times — automatically
 * when every game fits cleanly, otherwise a preview that needs the organiser's confirmation; (2) ask
 * "Send draw to players now?" (Later = nothing sent). Never sends anything by itself.
 */
export function PostDrawActions({ champId, stageKey, stageName, groupNumber, label, onFinished }: {
  champId: string; stageKey: string; stageName: string; groupNumber?: number; label?: string; onFinished: () => void;
}) {
  const [phase, setPhase] = useState<"scheduling" | "review" | "notice" | "done">("scheduling");
  const [ids, setIds] = useState<string[]>([]);
  const [t, setT] = useState<any>(null);
  useEffect(() => {
    (async () => {
      const [{ data: tour }, { data: rows }] = await Promise.all([
        fromExt("tournaments").select("club_id, name, beta_lifecycle").eq("id", champId).maybeSingle(),
        fromExt("club_champs_matches").select("id, group_number").eq("champ_id", champId).eq("stage_key", stageKey),
      ]);
      setT(tour);
      const mine = ((rows ?? []) as any[]).filter((m) => groupNumber == null || Number(m.group_number) === groupNumber).map((m) => m.id);
      setIds(mine);
      try {
        const plan = await planStageSlotAssignments(champId, mine);
        const unplaced = plan.stages.some((s) => s.unplaced.length);
        if (plan.total > 0 && !unplaced && !plan.diagnostics.length) {
          const r = await applyStageSlotAssignments(plan, mine);
          toast.success(`${stageName}: ${r.scheduled} game${r.scheduled === 1 ? "" : "s"} given courts and start times from the saved session.`);
          setPhase("notice");
        } else if (plan.total > 0 || plan.diagnostics.length) setPhase("review");
        else setPhase("notice");
      } catch (e: any) {
        toast.error(`Courts & times weren't assigned: ${e?.message ?? e}`);
        setPhase("review");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toNotice = () => setPhase(drawNotifyOn(t?.beta_lifecycle) ? "notice" : "done");
  useEffect(() => { if (phase === "notice" && t && !drawNotifyOn(t.beta_lifecycle)) setPhase("done"); if (phase === "done") onFinished(); }, [phase, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const scope: DrawScope = { round: 1, groupNumber, label, stageKey, stageName };
  return <>
    <AssignStageSlotsDialog open={phase === "review"} champId={champId} matchIds={ids} onClose={toNotice} onDone={() => {}} />
    {t && <DrawNoticeDialog open={phase === "notice"} onClose={() => setPhase("done")} clubId={t.club_id} tournamentId={champId} tournamentName={t.name ?? "Tournament"}
      scope={scope} sentBefore={drawNoticeSent(t.beta_lifecycle, drawNoticeKey(scope))} />}
  </>;
}
