/**
 * Confirm Draw — the gate between a proposed bracket and real fixtures.
 *
 * Fixtures are only inserted when the organiser confirms this board, and the
 * confirmed draw (plus every manual override) is written to
 * `tournament_draw_versions` so it is always clear which draw produced the
 * fixtures and who was moved.
 *
 * Completed matches are never read-modified here: for a later round the dialog
 * only reads the winners of the finished round and creates the NEXT round.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { DrawBoard } from "./DrawBoard";
import {
  drawAuditSnapshot,
  drawToMatchRows,
  validateDrawBoard,
  type DrawBoard as DrawBoardModel,
  type DrawEntrant,
} from "@/lib/tournaments/draw-board";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  champId: string;
  /** The suggested draw the engine produced — also the Reset target. */
  suggested: DrawBoardModel;
  entrants: DrawEntrant[];
  title: string;
  description?: string;
  divisionLabel?: string | null;
  multiSection?: boolean;
  playBy?: string | null;
  roundId?: string | null;
  /** Persist the fixtures yourself (wizard preview) instead of inserting here. */
  onConfirm?: (board: DrawBoardModel) => void | Promise<void>;
  onConfirmed?: (count: number) => void;
}

export function ConfirmDrawDialog({
  open,
  onOpenChange,
  champId,
  suggested,
  entrants,
  title,
  description,
  divisionLabel,
  multiSection,
  playBy,
  roundId,
  onConfirm,
  onConfirmed,
}: Props) {
  const qc = useQueryClient();
  const [history, setHistory] = useState<DrawBoardModel[]>([]);
  const [board, setBoard] = useState<DrawBoardModel>(suggested);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setBoard(suggested);
      setHistory([]);
    }
  }, [open, suggested]);

  const validation = useMemo(() => validateDrawBoard(board, entrants), [board, entrants]);

  const change = (next: DrawBoardModel) => {
    setHistory((h) => [...h.slice(-19), board]);
    setBoard(next);
  };

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setBoard(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };

  const confirm = async () => {
    if (!validation.ok) return;
    setSaving(true);
    try {
      if (onConfirm) {
        await onConfirm(board);
      } else {
        const rows = drawToMatchRows({
          champId,
          board,
          entrants,
          multiSection,
          playBy,
          roundId,
        });
        if (rows.length === 0) throw new Error("This draw has nothing to generate");
        // Idempotency: never create the same round twice if another tab (or a
        // double click) already generated it.
        const { data: existing, error: exErr } = await fromExt("club_champs_matches")
          .select("id")
          .eq("champ_id", champId)
          .eq("group_number", board.groupNumber)
          .eq("round_number", board.round)
          .in("section_number", Array.from(new Set(rows.map((r) => r.section_number))))
          .limit(1);
        if (exErr) throw exErr;
        if (existing && existing.length > 0) throw new Error("This round already exists");
        const { error } = await fromExt("club_champs_matches").insert(rows as any);
        if (error) throw error;
        onConfirmed?.(rows.length);

      }

      // Audit: what was confirmed and who was moved.
      try {
        const { data: auth } = await supabase.auth.getUser();
        const { data: champ } = await fromExt("tournaments")
          .select("draw_version")
          .eq("id", champId)
          .maybeSingle();
        const version = (champ?.draw_version ?? 0) + 1;
        await fromExt("tournament_draw_versions").insert({
          tournament_id: champId,
          version,
          created_by: auth?.user?.id ?? null,
          note: `Confirmed draw — ${divisionLabel || `division ${board.groupNumber}`}, round ${board.round}`,
          match_count: validation.playable + validation.byes,
          snapshot: drawAuditSnapshot({ board, suggested, entrants, divisionLabel }) as any,
        });
        await fromExt("tournaments").update({ draw_version: version }).eq("id", champId);
      } catch {
        // The audit row must never block a valid draw.
      }

      qc.invalidateQueries({ queryKey: ["club-champ-matches", champId] });
      qc.invalidateQueries({ queryKey: ["champ-draw-versions", champId] });
      toast.success("Draw confirmed — fixtures created");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not confirm this draw");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ||
              "Drag players between slots to set the pairings you want. Empty a slot to give a bye. No fixtures are created until you confirm."}
          </DialogDescription>
        </DialogHeader>

        <DrawBoard
          board={board}
          entrants={entrants}
          onChange={change}
          onUndo={undo}
          canUndo={history.length > 0}
          onReset={() => change(suggested)}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!validation.ok || saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
            Confirm draw &amp; create fixtures
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
