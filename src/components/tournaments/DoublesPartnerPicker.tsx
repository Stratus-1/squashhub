import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Users, Check, X, CreditCard } from "lucide-react";
import { toast } from "sonner";
import {
  PARTNER_MUST_REGISTER_MESSAGE,
  canPickPartner,
  cancelPair,
  fetchPairingState,
  fetchPartnerOptions,
  pairAction,
  pairForDivision,
  pairPaymentLabel,
  pairStatusLabel,
  partnerOptionSubtitle,
  partnerReadinessBadge,
  partnerReadinessNote,
  proposePartner,
  respondToPair,
  type MyPair,
  type PartnerOption,
} from "@/lib/tournaments/doubles";

import { notifyDoublesPair } from "@/lib/tournaments/pair-notify";
import type { InviteDivision } from "@/lib/tournaments/invite-link";

type Props = {
  champId: string;
  divisions: InviteDivision[];
  token?: string | null;
  verify?: string | null;
  clubId?: string | null;
  /** Called when the player must settle an entry fee (combined or their own). */
  onPay?: (amountCents: number) => void;
};

const money = (cents: number) => `R${(cents / 100).toFixed(2)}`;

/**
 * Partner selection for every doubles division the player entered. Works from
 * the secure invitation link (token) or for a signed-in registered player.
 *
 * Partners can only be picked from the eligible, unpaired invite list. Where an
 * entry fee applies the player is asked whether they are paying for the partner
 * too; the pair only locks once every required payment has succeeded.
 */
export function DoublesPartnerPicker({ champId, divisions, token, verify, clubId, onPay }: Props) {
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
          clubId={clubId}
          division={d}
          locked={!!state?.locked}
          feeCents={Number(state?.entry_fee_cents || 0)}
          pair={pairForDivision(state?.pairs || [], d.group_number)}
          auth={auth}
          onChanged={refresh}
          onPay={onPay}
        />
      ))}
    </div>
  );
}

function DivisionPartner({
  champId,
  clubId,
  division,
  locked,
  feeCents,
  pair,
  auth,
  onChanged,
  onPay,
}: {
  champId: string;
  clubId?: string | null;
  division: InviteDivision;
  locked: boolean;
  feeCents: number;
  pair: MyPair | null;
  auth: { token?: string | null; verify?: string | null };
  onChanged: () => void;
  onPay?: (amountCents: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [feeAsk, setFeeAsk] = useState<PartnerOption | null>(null);
  const action = pairAction(pair, locked);
  const picking = action === "choose";
  const hasFee = feeCents > 0;

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["champ-partner-options", champId, division.group_number, search, auth.token || "auth"],
    queryFn: () => fetchPartnerOptions(champId, division.group_number, auth, search),
    enabled: picking,
  });

  const act = useMutation({
    mutationFn: async (
      job:
        | { kind: "propose"; memberId: string; payForPartner: boolean }
        | { kind: "accept" }
        | { kind: "reject" }
        | { kind: "cancel" },
    ) => {
      if (job.kind === "propose")
        return proposePartner(champId, division.group_number, job.memberId, auth, job.payForPartner);
      if (job.kind === "accept") return respondToPair(pair!.id, true, auth);
      if (job.kind === "reject") return respondToPair(pair!.id, false, auth);
      return cancelPair(pair!.id, auth);
    },
    onSuccess: async (res: any, job) => {
      onChanged();
      if (res?.status === "confirmed") toast.success("Doubles pair confirmed and locked.");
      else if (res?.status === "awaiting_payment")
        toast.success("Pair created — it locks once all entry fees are paid.");
      else if (res?.status === "pending") toast.success("Partner request sent — they need to accept it.");
      else toast.success("Pairing updated.");

      // Tell both players on exactly the channels enabled for this tournament.
      if (res?.id && (job.kind === "propose" || job.kind === "accept")) {
        try {
          await notifyDoublesPair(String(res.id), clubId ?? null);
        } catch {
          /* notification failure must never block the pairing itself */
        }
      }
      if (job.kind === "propose" && job.payForPartner && onPay) onPay(feeCents * 2);
    },
    onError: (e: any) => toast.error(e?.message || "Could not update your doubles pair"),
  });

  const busy = act.isPending;
  const paymentLine = pairPaymentLabel(pair, feeCents, (r) => `R${r.toFixed(2)}`);
  const iOwe =
    !!pair && hasFee && !pair.my_fee_paid && !pair.covered_by_partner
      ? pair.payer_is_me && pair.pays_for_partner
        ? feeCents * 2
        : feeCents
      : 0;

  const choose = (o: PartnerOption) => {
    if (hasFee) setFeeAsk(o);
    else act.mutate({ kind: "propose", memberId: o.member_id, payForPartner: false });
  };

  const badgeLabel =
    pair?.status === "confirmed"
      ? "Pair locked"
      : pair?.status === "awaiting_payment"
        ? "Awaiting payment"
        : pair
          ? "Pair pending"
          : "Partner needed";

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-sm font-medium flex-1">{division.label}</span>
        <Badge variant={pair?.status === "confirmed" ? "default" : "outline"} className="text-[10px]">
          {badgeLabel}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">{pairStatusLabel(pair)}</p>
      {paymentLine && <p className="text-xs font-medium">{paymentLine}</p>}

      {action === "locked" && (
        <p className="text-[11px] text-muted-foreground">
          The organiser has locked doubles pairs. Ask them to reopen pairing if you need a change.
        </p>
      )}

      {iOwe > 0 && onPay && (
        <Button size="sm" className="w-full" disabled={busy} onClick={() => onPay(iOwe)}>
          <CreditCard className="w-3.5 h-3.5 mr-1" /> Pay {money(iOwe)} now
        </Button>
      )}
      {iOwe > 0 && !onPay && (
        <p className="text-[11px] text-muted-foreground">
          Open this tournament in the app to pay your {money(iOwe)} entry fee.
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

      {(action === "awaiting_partner" || action === "awaiting_payment" || action === "confirmed") && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act.mutate({ kind: "cancel" })}>
          {action === "awaiting_partner" ? "Cancel request" : "Change partner"}
        </Button>
      )}

      {picking && (
        <div className="space-y-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invited players…"
            className="h-8 text-sm"
          />
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : options.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{PARTNER_MUST_REGISTER_MESSAGE}</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {options.map((o) => {
                const pickable = canPickPartner(o);
                const badge = partnerReadinessBadge(o);
                return (
                  <button
                    key={o.member_id}
                    type="button"
                    disabled={busy || !pickable}
                    onClick={() => pickable && choose(o)}
                    className="w-full text-left rounded-md border p-2 hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium flex-1">{o.display_name}</p>
                      {badge && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {badge}
                        </Badge>
                      )}
                    </div>
                    {partnerOptionSubtitle(o) && (
                      <p className="text-[11px] text-muted-foreground">{partnerOptionSubtitle(o)}</p>
                    )}
                    {partnerReadinessNote(o) && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{partnerReadinessNote(o)}</p>
                    )}
                  </button>
                );
              })}
            </div>

          )}
        </div>
      )}

      <AlertDialog open={!!feeAsk} onOpenChange={(o) => !o && setFeeAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you paying for {feeAsk?.display_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The entry fee is {money(feeCents)} per player. Pay for both ({money(feeCents * 2)}) and
              the pair locks as soon as your payment succeeds — or let {feeAsk?.display_name || "your partner"} pay
              their own entry and we'll send them a “Complete registration” link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                const o = feeAsk!;
                setFeeAsk(null);
                act.mutate({ kind: "propose", memberId: o.member_id, payForPartner: false });
              }}
            >
              No — they pay their own
            </Button>
            <AlertDialogAction
              onClick={() => {
                const o = feeAsk!;
                setFeeAsk(null);
                act.mutate({ kind: "propose", memberId: o.member_id, payForPartner: true });
              }}
            >
              Yes — pay {money(feeCents * 2)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
