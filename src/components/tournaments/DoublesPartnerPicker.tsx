import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  PARTNER_MUST_REGISTER_MESSAGE,
  cancelPair,
  fetchPairingState,
  fetchPartnerOptions,
  pairAction,
  pairForDivision,
  pairStatusLabel,
  partnerOptionSubtitle,
  proposePartner,
  respondToPair,
} from "@/lib/tournaments/doubles";
import type { InviteDivision } from "@/lib/tournaments/invite-link";

type Props = {
  champId: string;
  divisions: InviteDivision[];
  token?: string | null;
  verify?: string | null;
};

/**
 * Partner selection for every doubles division the player entered. Works from
 * the secure invitation link (token) or for a signed-in registered player.
 */
export function DoublesPartnerPicker({ champId, divisions, token, verify }: Props) {
  const qc = useQueryClient();
  const auth = { token, verify };
  const stateKey = ["champ-pairing-state", champId, token || "auth"];

  const { data: state, isLoading } = useQuery({
    queryKey: stateKey,
    queryFn: () => fetchPairingState(champId, auth),
    enabled: !!champId && divisions.length > 0,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: stateKey });

  if (divisions.length === 0) return null;
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading partner options…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {divisions.map((d) => (
        <DivisionPartner
          key={d.group_number}
          champId={champId}
          division={d}
          locked={!!state?.locked}
          pair={pairForDivision(state?.pairs || [], d.group_number)}
          auth={auth}
          onChanged={refresh}
        />
      ))}
    </div>
  );
}

function DivisionPartner({
  champId,
  division,
  locked,
  pair,
  auth,
  onChanged,
}: {
  champId: string;
  division: InviteDivision;
  locked: boolean;
  pair: ReturnType<typeof pairForDivision>;
  auth: { token?: string | null; verify?: string | null };
  onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const action = pairAction(pair, locked);
  const picking = action === "choose";

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["champ-partner-options", champId, division.group_number, search, auth.token || "auth"],
    queryFn: () => fetchPartnerOptions(champId, division.group_number, auth, search),
    enabled: picking,
  });

  const act = useMutation({
    mutationFn: async (job: { kind: "propose"; memberId: string } | { kind: "accept" } | { kind: "reject" } | { kind: "cancel" }) => {
      if (job.kind === "propose") return proposePartner(champId, division.group_number, job.memberId, auth);
      if (job.kind === "accept") return respondToPair(pair!.id, true, auth);
      if (job.kind === "reject") return respondToPair(pair!.id, false, auth);
      return cancelPair(pair!.id, auth);
    },
    onSuccess: (res: any) => {
      onChanged();
      if (res?.status === "confirmed") toast.success("Doubles pair confirmed.");
      else if (res?.status === "pending") toast.success("Partner request sent — they need to accept it.");
      else toast.success("Pairing updated.");
    },
    onError: (e: any) => toast.error(e?.message || "Could not update your doubles pair"),
  });

  const busy = act.isPending;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-sm font-medium flex-1">{division.label}</span>
        <Badge variant={pair?.status === "confirmed" ? "default" : "outline"} className="text-[10px]">
          {pair?.status === "confirmed" ? "Pair confirmed" : pair ? "Pair pending" : "Partner needed"}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">{pairStatusLabel(pair)}</p>

      {action === "locked" && (
        <p className="text-[11px] text-muted-foreground">
          The organiser has locked doubles pairs. Ask them to reopen pairing if you need a change.
        </p>
      )}

      {action === "respond" && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act.mutate({ kind: "reject" })}>
            <X className="w-3.5 h-3.5 mr-1" /> Decline
          </Button>
          <Button size="sm" disabled={busy} onClick={() => act.mutate({ kind: "accept" })}>
            <Check className="w-3.5 h-3.5 mr-1" /> Accept partner
          </Button>
        </div>
      )}

      {(action === "awaiting_partner" || action === "confirmed") && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act.mutate({ kind: "cancel" })}>
          {action === "confirmed" ? "Change partner" : "Cancel request"}
        </Button>
      )}

      {picking && (
        <div className="space-y-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search registered players…"
            className="h-8 text-sm"
          />
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : options.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{PARTNER_MUST_REGISTER_MESSAGE}</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {options.map((o) => (
                <button
                  key={o.member_id}
                  type="button"
                  disabled={busy}
                  onClick={() => act.mutate({ kind: "propose", memberId: o.member_id })}
                  className="w-full text-left rounded-md border p-2 hover:bg-muted transition-colors"
                >
                  <p className="text-sm font-medium">{o.display_name}</p>
                  {partnerOptionSubtitle(o) && (
                    <p className="text-[11px] text-muted-foreground">{partnerOptionSubtitle(o)}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
