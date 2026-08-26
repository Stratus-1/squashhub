import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Lock, Unlock, Send, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminPairPlayers,
  fetchOrganiserPairs,
  setPairingLocked,
  type PairStatus,
} from "@/lib/tournaments/doubles";
import { notifyDoublesPair, pairNotifySummary } from "@/lib/tournaments/pair-notify";

const FILTERS: { key: PairStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "confirmed", label: "Locked" },
  { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
];

const BADGE: Record<PairStatus, string> = {
  confirmed: "bg-emerald-600 hover:bg-emerald-600 text-white",
  awaiting_payment: "bg-orange-500 hover:bg-orange-500 text-white",
  pending: "bg-amber-500 hover:bg-amber-500 text-white",
  rejected: "bg-destructive hover:bg-destructive text-white",
  cancelled: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<PairStatus, string> = {
  confirmed: "locked",
  awaiting_payment: "awaiting payment",
  pending: "pending",
  rejected: "rejected",
  cancelled: "cancelled",
};

/**
 * Organiser view of doubles pairs. Supports both flows: pre-selecting a pair
 * here (and notifying both players on the tournament's chosen channels), and
 * reviewing pairs players built themselves from the invite list. A pair only
 * shows as locked once every required entry fee is paid.
 */
export function DoublesPairsPanel({
  champId,
  clubId,
  groupLabels,
}: {
  champId: string;
  clubId?: string | null;
  groupLabels?: Record<string, string>;
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<PairStatus | "all">("all");
  const [group, setGroup] = useState<string>("");
  const [playerA, setPlayerA] = useState<string>("");
  const [playerB, setPlayerB] = useState<string>("");

  const { data } = useQuery({
    queryKey: ["champ-doubles-pairs", champId],
    queryFn: () => fetchOrganiserPairs(champId),
    enabled: !!champId,
  });

  // Divisions + entrants available for organiser pre-selection.
  const { data: entrants = [] } = useQuery({
    queryKey: ["champ-doubles-entrants", champId],
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("club_champs_registrations")
        .select("club_member_id, division_choices, status, club_members:club_member_id(name)")
        .eq("champ_id", champId);
      if (error) throw error;
      return (rows || []).filter(
        (r: any) => !["cancelled", "declined", "withdrawn"].includes(String(r.status || "").toLowerCase()),
      );
    },
    enabled: !!champId,
  });

  const divisions = useMemo(() => {
    const set = new Set<number>();
    entrants.forEach((r: any) => (r.division_choices || []).forEach((n: number) => set.add(Number(n))));
    (data?.pairs || []).forEach((p) => set.add(p.group_number));
    return Array.from(set).sort((a, b) => a - b);
  }, [entrants, data]);

  const groupNumber = group ? Number(group) : divisions[0];

  const pairedIds = useMemo(() => {
    const s = new Set<string>();
    (data?.pairs || [])
      .filter((p) => ["pending", "awaiting_payment", "confirmed"].includes(p.status) && p.group_number === groupNumber)
      .forEach((p) => {
        s.add(p.member_a);
        s.add(p.member_b);
      });
    return s;
  }, [data, groupNumber]);

  const candidates = useMemo(
    () =>
      entrants
        .filter((r: any) => (r.division_choices || []).map(Number).includes(groupNumber))
        .filter((r: any) => !pairedIds.has(r.club_member_id))
        .map((r: any) => ({ id: r.club_member_id as string, name: r.club_members?.name || "Unknown" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [entrants, groupNumber, pairedIds],
  );

  const toggleLock = useMutation({
    mutationFn: (locked: boolean) => setPairingLocked(champId, locked),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["champ-doubles-pairs", champId] });
      toast.success("Pairing lock updated.");
    },
    onError: (e: any) => toast.error(e?.message || "Could not update the pairing lock"),
  });

  const createPair = useMutation({
    mutationFn: async () => {
      const res = await adminPairPlayers(champId, groupNumber, playerA, playerB);
      const notice = await notifyDoublesPair(String(res.id), clubId ?? null).catch(() => null);
      return { res, notice };
    },
    onSuccess: ({ res, notice }) => {
      setPlayerA("");
      setPlayerB("");
      qc.invalidateQueries({ queryKey: ["champ-doubles-pairs", champId] });
      toast.success(
        res.status === "confirmed"
          ? "Pair created and locked."
          : "Pair created — it locks once all entry fees are paid.",
        { description: notice ? pairNotifySummary(notice) : undefined },
      );
    },
    onError: (e: any) => toast.error(e?.message || "Could not create the pair"),
  });

  const notify = useMutation({
    mutationFn: (pairId: string) => notifyDoublesPair(pairId, clubId ?? null),
    onSuccess: (r) => toast.success(pairNotifySummary(r)),
    onError: (e: any) => toast.error(e?.message || "Could not send the pairing message"),
  });

  const rows = useMemo(
    () => (data?.pairs || []).filter((p) => filter === "all" || p.status === filter),
    [data, filter],
  );

  const feeCents = Number(data?.entry_fee_cents || 0);
  const label = (n: number) => groupLabels?.[String(n)] || `League ${n}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Doubles pairs</CardTitle>
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
          Pre-select a pair below, or let players pick a partner from the invited, unpaired list.
          {feeCents > 0
            ? " Where an entry fee applies the pair only locks once every required payment succeeds."
            : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Organiser pre-selection */}
        {divisions.length > 0 && (
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pair two players
            </p>
            <div className="grid gap-2 sm:grid-cols-4">
              <Select value={String(groupNumber ?? "")} onValueChange={setGroup}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Division" />
                </SelectTrigger>
                <SelectContent>
                  {divisions.map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">
                      {label(n)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={playerA} onValueChange={setPlayerA}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Player 1" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.filter((c) => c.id !== playerB).map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={playerB} onValueChange={setPlayerB}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Player 2" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.filter((c) => c.id !== playerA).map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!playerA || !playerB || !groupNumber || createPair.isPending}
                onClick={() => createPair.mutate()}
              >
                {createPair.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <UserPlus className="w-3.5 h-3.5 mr-1" />
                )}
                Pair &amp; notify
              </Button>
            </div>
          </div>
        )}

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
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    {p.member_a_name} &amp; {p.member_b_name}
                  </p>
                  {feeCents > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {p.member_a_name}: {p.member_a_paid ? "paid" : "unpaid"} · {p.member_b_name}:{" "}
                      {p.member_b_paid ? "paid" : "unpaid"}
                      {p.pays_for_partner ? " · one player is covering both entries" : ""}
                    </p>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">{label(p.group_number)}</span>
                <Badge className={`text-[10px] ${BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</Badge>
                {["pending", "awaiting_payment", "confirmed"].includes(p.status) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    disabled={notify.isPending}
                    onClick={() => notify.mutate(p.id)}
                    title="Resend the pairing message on the tournament's channels"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
