import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Slot = "player_a" | "player_b" | "partner_a" | "partner_b";

export interface ReplaceCandidate {
  id: string;
  name: string;
  member_number?: string | number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId?: string | null;
  match: any | null;
  isDoubles?: boolean;
  /** Players still in the competition — offered first. */
  candidates?: ReplaceCandidate[];
  /** Display name for a member id already in the fixture. */
  getName: (memberId?: string | null) => string;
  onSaved?: () => void;
}

/**
 * Organiser correction of WHO is playing a fixture that has not been played.
 *
 * The date, time and court booking are untouched — only the participant
 * changes. The backend refuses the change once the match has points, a score
 * or a winner, and notifies everyone involved.
 */
export function ReplacePlayerDialog({ open, onOpenChange, clubId, match, isDoubles = false, candidates, getName, onSaved }: Props) {
  const [slot, setSlot] = useState<Slot>("player_a");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const hasCandidates = (candidates?.length ?? 0) > 0;

  useEffect(() => {
    if (open) { setSlot("player_a"); setSearch(""); setPicked(null); setShowAll(false); }
  }, [open, match?.id]);

  const useClubList = showAll || !hasCandidates;

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["replace-player-members", clubId],
    enabled: open && !!clubId && useClubList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_members")
        .select("id, name, member_number, status")
        .eq("club_id", clubId!)
        .order("name");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const inMatch = useMemo(
    () => new Set([
      match?.player_a_member_id,
      match?.player_b_member_id,
      match?.partner_a_member_id,
      match?.partner_b_member_id,
    ].filter(Boolean) as string[]),
    [match],
  );

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const source: any[] = useClubList ? members : (candidates || []);
    return source
      .filter((m) => !inMatch.has(m.id))
      .filter((m) => (m.status || "active") !== "resigned")
      .filter((m) => !q || String(m.name || "").toLowerCase().includes(q) || String(m.member_number || "").includes(q))
      .slice(0, 60);
  }, [members, candidates, useClubList, search, inMatch]);

  const slots: { key: Slot; label: string; memberId?: string | null }[] = [
    { key: "player_a", label: "Side A player", memberId: match?.player_a_member_id },
    ...(isDoubles ? [{ key: "partner_a" as Slot, label: "Side A partner", memberId: match?.partner_a_member_id }] : []),
    { key: "player_b", label: "Side B player", memberId: match?.player_b_member_id },
    ...(isDoubles ? [{ key: "partner_b" as Slot, label: "Side B partner", memberId: match?.partner_b_member_id }] : []),
  ];

  const save = async () => {
    if (!match?.id || !picked) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("admin_replace_champ_player", {
        p_match_id: match.id,
        p_slot: slot,
        p_new_member_id: picked,
      });
      if (error) throw error;
      toast.success("Player replaced — the court and time stay the same, and everyone involved has been told.");
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not replace the player");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserCog className="w-4 h-4" /> Replace a player
          </DialogTitle>
          <DialogDescription className="text-xs">
            Fix the wrong name on this fixture. The date, time and court booking stay exactly as they are, and both
            sides are notified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Who is being replaced?</Label>
            <div className="grid gap-1.5">
              {slots.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSlot(s.key)}
                  className={cn(
                    "text-left text-xs rounded-md border px-2.5 py-2",
                    slot === s.key ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted/60",
                  )}
                >
                  <span className="text-muted-foreground">{s.label}: </span>
                  {getName(s.memberId) || "TBD"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Who should be playing instead?</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or member number"
              className="h-8 text-sm"
            />
            <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
              {isLoading && (
                <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading players…
                </div>
              )}
              {!isLoading && results.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">No matching player.</div>
              )}
              {results.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPicked(m.id)}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 text-xs",
                    picked === m.id ? "bg-primary/10 font-medium" : "hover:bg-muted/60",
                  )}
                >
                  {m.name}
                  {m.member_number ? <span className="text-muted-foreground"> · #{m.member_number}</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!picked || busy} onClick={save}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
            Replace player
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
