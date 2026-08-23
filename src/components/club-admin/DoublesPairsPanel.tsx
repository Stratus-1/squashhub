import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { fetchOrganiserPairs, setPairingLocked, type PairStatus } from "@/lib/tournaments/doubles";

const FILTERS: { key: PairStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "confirmed", label: "Confirmed" },
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
];

const BADGE: Record<PairStatus, string> = {
  confirmed: "bg-emerald-600 hover:bg-emerald-600 text-white",
  pending: "bg-amber-500 hover:bg-amber-500 text-white",
  rejected: "bg-destructive hover:bg-destructive text-white",
  cancelled: "bg-muted text-muted-foreground",
};

/** Organiser view of player-chosen doubles pairs, with a pairing lock. */
export function DoublesPairsPanel({
  champId,
  groupLabels,
}: {
  champId: string;
  groupLabels?: Record<string, string>;
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<PairStatus | "all">("all");

  const { data } = useQuery({
    queryKey: ["champ-doubles-pairs", champId],
    queryFn: () => fetchOrganiserPairs(champId),
    enabled: !!champId,
  });

  const toggleLock = useMutation({
    mutationFn: (locked: boolean) => setPairingLocked(champId, locked),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["champ-doubles-pairs", champId] });
      toast.success("Pairing lock updated.");
    },
    onError: (e: any) => toast.error(e?.message || "Could not update the pairing lock"),
  });

  const rows = useMemo(
    () => (data?.pairs || []).filter((p) => filter === "all" || p.status === filter),
    [data, filter],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Doubles pairs chosen by players</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toggleLock.mutate(!data?.locked)}
            disabled={toggleLock.isPending}
          >
            {data?.locked ? (
              <>
                <Unlock className="w-3.5 h-3.5 mr-1" /> Reopen pairing
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 mr-1" /> Lock pairs
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Players may only pick a partner who has already registered for the same division. Lock pairs
          once you generate the draw.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No pairs in this view yet.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded border p-2">
                <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1">
                  {p.member_a_name} &amp; {p.member_b_name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {groupLabels?.[String(p.group_number)] || `League ${p.group_number}`}
                </span>
                <Badge className={`text-[10px] ${BADGE[p.status]}`}>{p.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
