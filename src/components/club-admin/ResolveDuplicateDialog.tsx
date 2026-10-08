import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { GitMerge, Search } from "lucide-react";

type MemberLite = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  club_member_number?: string | null;
  status?: string | null;
  user_id?: string | null;
  profiles?: { name?: string | null; email?: string | null } | null;
};

/**
 * Admin "Resolve duplicate" merge. The selected member is the DUPLICATE:
 * its login and any missing identity details move onto the surviving member,
 * its unpaid fees are cleared with audited reversing entries, and the
 * duplicate record is retired (kept for audit, never hard-deleted).
 */
export function ResolveDuplicateDialog({
  clubId,
  source,
  members,
  onClose,
}: {
  clubId: string;
  source: MemberLite;
  members: MemberLite[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const sourceName = source.name || source.profiles?.name || "this member";

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members
      .filter((m) => m.id !== source.id)
      .filter((m) => {
        if (!q) return true;
        const hay = `${m.name || ""} ${m.profiles?.name || ""} ${m.email || ""} ${m.profiles?.email || ""} ${m.phone || ""} ${m.club_member_number || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [members, search, source.id]);

  const target = members.find((m) => m.id === targetId) || null;
  const targetName = target ? target.name || target.profiles?.name || "Member" : null;

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_resolve_duplicate_member", {
        _source_id: source.id,
        _target_id: target.id,
        _reason: reason.trim() || null,
      });
      if (error) throw error;
      const res = data as { moved_login?: boolean; cleared_unpaid_fees?: number } | null;
      toast.success(
        `Merged ${sourceName} into ${targetName}.` +
          (res?.moved_login ? " Login moved." : "") +
          (res?.cleared_unpaid_fees ? ` ${res.cleared_unpaid_fees} unpaid fee(s) cleared with reversal.` : "")
      );
      qc.invalidateQueries({ queryKey: ["club-members", clubId] });
      qc.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
      qc.invalidateQueries({ queryKey: ["club-stats", clubId] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not resolve duplicate");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <GitMerge className="w-4 h-4" /> Resolve duplicate
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{sourceName}</span> is the duplicate record.
            Choose the surviving member below. The duplicate's login and any missing contact/ID details
            move to the survivor, unpaid duplicate fees are cleared with an audited reversal, and the
            duplicate record is retired — nothing is hard-deleted.
          </p>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search surviving member by name, email, phone or #"
              className="pl-8 h-8 text-xs"
              autoFocus
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {candidates.map((m) => {
              const name = m.name || m.profiles?.name || "Member";
              const selected = m.id === targetId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTargetId(m.id)}
                  className={`w-full text-left px-2 py-1.5 rounded border text-xs transition-colors ${
                    selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span className="font-medium">{name}</span>
                  {m.club_member_number && <span className="text-muted-foreground"> · {m.club_member_number}</span>}
                  <span className="block text-[10px] text-muted-foreground truncate">
                    {(m.email || m.profiles?.email || "no email") + (m.user_id ? " · has login" : " · no login")}
                  </span>
                </button>
              );
            })}
            {candidates.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No matching members</p>
            )}
          </div>

          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional, kept in audit log)"
            className="h-8 text-xs"
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={confirm} disabled={!target || busy}>
              {busy ? "Merging…" : `Merge into ${targetName ?? "…"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
