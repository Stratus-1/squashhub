import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLeagueAssociations, useClubLeagues } from "@/hooks/use-club";
import { toast } from "sonner";

const NO_TEAM = "__none__";

/**
 * Affiliate a single member to a league association later in the season and
 * (optionally) place them in a team and submit them straight away, so the
 * association bills the member exactly once.
 */
export function AffiliateMemberDialog({
  clubId, memberId, memberName, onClose,
}: {
  clubId: string;
  memberId: string;
  memberName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: leagues = [] } = useClubLeagues(clubId);

  const eligible = useMemo(
    () => (associations as any[]).filter((a) => String(a.scope || "") !== "internal"),
    [associations],
  );
  const [associationId, setAssociationId] = useState<string>(eligible[0]?.id || "");
  const [leagueId, setLeagueId] = useState<string>(NO_TEAM);
  const [saving, setSaving] = useState(false);

  const teams = useMemo(
    () => (leagues as any[]).filter((l) => l.association_id === associationId),
    [leagues, associationId],
  );

  const submit = async () => {
    if (!associationId) { toast.error("Choose an association"); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("club_affiliate_member_to_association", {
        _club_id: clubId,
        _club_member_id: memberId,
        _association_id: associationId,
        _league_id: leagueId === NO_TEAM ? null : leagueId,
        _submit: leagueId !== NO_TEAM,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["club-member-affiliations"] });
      qc.invalidateQueries({ queryKey: ["club-association-statement", clubId] });
      toast.success(
        leagueId === NO_TEAM
          ? `${memberName} affiliated — submit with the next roster upload`
          : `${memberName} added to the team and submitted`,
      );
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not affiliate this member");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Affiliate {memberName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Association</Label>
            <Select value={associationId} onValueChange={(v) => { setAssociationId(v); setLeagueId(NO_TEAM); }}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {eligible.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Team</Label>
            <Select value={leagueId} onValueChange={setLeagueId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEAM}>No team yet</SelectItem>
                {teams.map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Choosing a team submits this member to the association right away and adds their fee to the club's bill once.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !associationId}>{saving ? "Saving…" : "Affiliate"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
