import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeftRight, Loader2, Search, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  champId: string;
  champName: string;
  clubId: string;
  gender: string;
  isDoubles: boolean;
}

type Slot = "player_a" | "player_b" | "partner_a" | "partner_b";

const SLOT_LABEL: Record<Slot, string> = {
  player_a: "Player A",
  player_b: "Player B",
  partner_a: "Partner A",
  partner_b: "Partner B",
};

export function FinalizeTournamentSetupDialog({
  open, onOpenChange, champId, champName, clubId, gender, isDoubles,
}: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [pendingSwap, setPendingSwap] = useState<{ matchId: string; slot: Slot } | null>(null);

  // Upcoming scheduled matches for this tournament
  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["finalize-tournament-matches", champId],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await fromExt("club_champs_matches")
        .select("id, scheduled_date, scheduled_time, group_number, round_number, status, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, player_a:player_a_member_id(id,name), player_b:player_b_member_id(id,name), partner_a:partner_a_member_id(id,name), partner_b:partner_b_member_id(id,name)")
        .eq("champ_id", champId)
        .eq("status", "scheduled")
        .gte("scheduled_date", today)
        .order("scheduled_date")
        .order("scheduled_time");
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!champId,
  });

  // Eligible replacement players: all club members (any gender) — admin can swap freely
  const { data: candidates = [] } = useQuery({
    queryKey: ["finalize-tournament-candidates", clubId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("club_members")
        .select("id, name, gender")
        .eq("club_id", clubId)
        .order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string; gender: string | null }[];
    },
    enabled: open && !!clubId,
  });

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? candidates.filter((c) => (c.name || "").toLowerCase().includes(q)) : candidates;
  }, [candidates, search]);

  const handleSwap = async (newMemberId: string, newName: string) => {
    if (!pendingSwap) return;
    const { matchId, slot } = pendingSwap;
    try {
      const { error } = await (supabase as any)
        .from("club_champs_matches")
        .update({ [`${slot}_member_id`]: newMemberId })
        .eq("id", matchId);
      if (error) throw error;
      toast.success(`Swapped in ${newName}`);
      qc.invalidateQueries({ queryKey: ["finalize-tournament-matches", champId] });
      qc.invalidateQueries({ queryKey: ["tournaments-upcoming-matches"] });
      qc.invalidateQueries({ queryKey: ["club-champs-matches"] });
      setPendingSwap(null);
      setSearch("");
    } catch (err: any) {
      toast.error(err.message || "Swap failed");
    }
  };

  const renderSlot = (m: any, slot: Slot, current: { id?: string; name?: string } | null) => {
    if (!isDoubles && (slot === "partner_a" || slot === "partner_b")) return null;
    return (
      <Popover
        key={`${m.id}-${slot}`}
        open={pendingSwap?.matchId === m.id && pendingSwap?.slot === slot}
        onOpenChange={(o) => {
          if (!o) { setPendingSwap(null); setSearch(""); }
          else setPendingSwap({ matchId: m.id, slot });
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1 max-w-[150px] truncate justify-between"
            title={`Swap ${SLOT_LABEL[slot]}`}
          >
            <span className="truncate">{current?.name || <span className="italic text-muted-foreground">empty</span>}</span>
            <ArrowLeftRight className="w-3 h-3 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder={`Replace ${SLOT_LABEL[slot]}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 h-8 text-xs"
              />
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto divide-y">
            {filteredCandidates.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-4">No players found</p>
            ) : (
              filteredCandidates.map((c) => {
                const isCurrent = c.id === current?.id;
                return (
                  <button
                    key={c.id}
                    disabled={isCurrent}
                    onClick={() => handleSwap(c.id, c.name)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-40 flex items-center justify-between"
                  >
                    <span className="truncate">{c.name}</span>
                    {isCurrent && <Badge variant="secondary" className="text-[9px]">current</Badge>}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <UserCheck className="w-4 h-4" /> Finalize Setup · {champName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Swap players in upcoming matches before the next round is played. Click any player name to replace them.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : matches.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-8">
            No upcoming scheduled matches to finalize.
          </p>
        ) : (
          <div className="space-y-2">
            {matches.map((m: any) => (
              <div key={m.id} className="border rounded-md p-2 text-xs space-y-1.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {m.scheduled_date ? format(new Date(m.scheduled_date), "EEE dd MMM") : "TBD"}
                    {m.scheduled_time ? ` · ${m.scheduled_time.slice(0, 5)}` : ""}
                  </span>
                  {m.group_number != null && (
                    <Badge variant="outline" className="text-[10px]">G{m.group_number}</Badge>
                  )}
                  {m.round_number != null && (
                    <Badge variant="outline" className="text-[10px]">R{m.round_number}</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {renderSlot(m, "player_a", m.player_a)}
                  {isDoubles && renderSlot(m, "partner_a", m.partner_a)}
                  <span className="text-muted-foreground px-1">vs</span>
                  {renderSlot(m, "player_b", m.player_b)}
                  {isDoubles && renderSlot(m, "partner_b", m.partner_b)}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
