import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Lock, Unlock, History, Loader2, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  champId: string;
  /** Called after the lock state changes so the parent can refresh its own state. */
  onLockChange?: (locked: boolean) => void;
}

interface DrawVersion {
  id: string;
  version: number;
  note: string | null;
  match_count: number;
  created_at: string;
}

interface CorrectionRequest {
  id: string;
  match_id: string;
  reason: string;
  proposed_score: string | null;
  status: string;
  created_at: string;
}

/**
 * Phase 3b — Draw lock & versioning.
 *
 * Locking a draw freezes the fixture list: rebuilding the schedule is refused
 * while locked. Every lock takes an immutable snapshot of the current fixtures
 * so an admin can always see what the published draw looked like.
 *
 * Also surfaces pending result-correction requests for this tournament.
 */
export function DrawLockCard({ champId, onLockChange }: Props) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");

  const { data: champ } = useQuery({
    queryKey: ["champ-draw-lock", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs")
        .select("id, draw_locked, draw_locked_at, draw_version")
        .eq("id", champId)
        .maybeSingle();
      if (error) throw error;
      return data as { draw_locked: boolean; draw_locked_at: string | null; draw_version: number } | null;
    },
    enabled: !!champId,
  });

  const { data: versions = [] } = useQuery({
    queryKey: ["champ-draw-versions", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("tournament_draw_versions")
        .select("id, version, note, match_count, created_at")
        .eq("tournament_id", champId)
        .order("version", { ascending: false });
      if (error) throw error;
      return (data || []) as DrawVersion[];
    },
    enabled: !!champId,
  });

  const { data: corrections = [] } = useQuery({
    queryKey: ["champ-corrections", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("match_correction_requests")
        .select("id, match_id, reason, proposed_score, status, created_at")
        .eq("tournament_id", champId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CorrectionRequest[];
    },
    enabled: !!champId,
  });

  const locked = !!champ?.draw_locked;

  const toggleLock = useMutation({
    mutationFn: async (nextLocked: boolean) => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;

      if (nextLocked) {
        // Snapshot the fixtures before freezing them.
        const { data: matches, error: mErr } = await fromExt("club_champs_matches")
          .select("id, group_number, pool_number, round_number, stage, stage_label, scheduled_date, scheduled_time, court_id, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, status")
          .eq("champ_id", champId);
        if (mErr) throw mErr;

        const nextVersion = (champ?.draw_version ?? 0) + 1;
        const { error: vErr } = await fromExt("tournament_draw_versions").insert({
          tournament_id: champId,
          version: nextVersion,
          note: note.trim() || null,
          snapshot: matches || [],
          match_count: (matches || []).length,
          created_by: uid,
        });
        if (vErr) throw vErr;

        const { error } = await fromExt("club_champs")
          .update({ draw_locked: true, draw_locked_at: new Date().toISOString(), draw_locked_by: uid, draw_version: nextVersion })
          .eq("id", champId);
        if (error) throw error;
      } else {
        const { error } = await fromExt("club_champs")
          .update({ draw_locked: false, draw_locked_at: null, draw_locked_by: null })
          .eq("id", champId);
        if (error) throw error;
      }
      return nextLocked;
    },
    onSuccess: (nextLocked) => {
      setNote("");
      toast.success(nextLocked ? "Draw locked — fixtures are frozen" : "Draw unlocked — fixtures can be rebuilt");
      qc.invalidateQueries({ queryKey: ["champ-draw-lock", champId] });
      qc.invalidateQueries({ queryKey: ["champ-draw-versions", champId] });
      onLockChange?.(nextLocked);
    },
    onError: (e: any) => toast.error(e.message || "Could not change the draw lock"),
  });

  const reviewCorrection = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await fromExt("match_correction_requests")
        .update({ status, reviewed_by: userRes.user?.id ?? null, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Correction request updated");
      qc.invalidateQueries({ queryKey: ["champ-corrections", champId] });
    },
    onError: (e: any) => toast.error(e.message || "Could not update the request"),
  });

  const pending = corrections.filter((c) => c.status === "pending");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {locked ? <Lock className="w-4 h-4 text-amber-600" /> : <Unlock className="w-4 h-4 text-muted-foreground" />}
          Draw lock &amp; versions
          {locked && <Badge variant="outline" className="ml-1">v{champ?.draw_version}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Locking the draw freezes the fixture list and takes a snapshot. While locked, the schedule cannot be rebuilt.
        </p>

        {!locked && (
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for this version (e.g. published draw)"
            className="h-8 text-sm"
          />
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={locked ? "outline" : "default"}
            onClick={() => toggleLock.mutate(!locked)}
            disabled={toggleLock.isPending}
          >
            {toggleLock.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : locked ? <Unlock className="w-4 h-4 mr-1" /> : <Lock className="w-4 h-4 mr-1" />}
            {locked ? "Unlock draw" : "Lock draw"}
          </Button>
          {locked && champ?.draw_locked_at && (
            <span className="text-xs text-muted-foreground">
              Locked {format(new Date(champ.draw_locked_at), "dd MMM yyyy HH:mm")}
            </span>
          )}
        </div>

        {versions.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs font-medium flex items-center gap-1"><History className="w-3.5 h-3.5" /> Version history</p>
              {versions.map((v) => (
                <div key={v.id} className="flex items-center gap-2 text-xs rounded bg-muted/40 px-2 py-1">
                  <Badge variant="outline" className="text-[10px]">v{v.version}</Badge>
                  <span className="text-muted-foreground">{format(new Date(v.created_at), "dd MMM HH:mm")}</span>
                  <span>{v.match_count} fixtures</span>
                  {v.note && <span className="truncate text-muted-foreground">— {v.note}</span>}
                </div>
              ))}
            </div>
          </>
        )}

        {pending.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs font-medium">Result corrections awaiting review ({pending.length})</p>
              {pending.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs rounded border px-2 py-1">
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{c.reason}</p>
                    {c.proposed_score && <p className="text-muted-foreground">Proposed: {c.proposed_score}</p>}
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => reviewCorrection.mutate({ id: c.id, status: "approved" })}>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => reviewCorrection.mutate({ id: c.id, status: "rejected" })}>
                    <X className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default DrawLockCard;
