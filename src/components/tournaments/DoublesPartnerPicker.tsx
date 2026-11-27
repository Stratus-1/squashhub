import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Users, Check, X, CreditCard, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  PARTNER_MUST_REGISTER_MESSAGE,
  canPickPartner,
  cancelPair,
  createFamilyPair,
  fetchFamilyPlayers,
  fetchPairingState,
  fetchPartnerOptions,
  pairAction,
  pairForDivision,
  pairAmountOwedCents,
  partnerPickDueCents,
  pairPaymentLabel,
  pairPayerChoices,
  setPairPayer,
  pairStatusLabel,
  partnerOptionSubtitle,
  partnerReadinessBadge,
  partnerReadinessNote,
  partnerEntryNote,
  proposePartner,
  proposeExternalPartner,
  fetchExternalPartnerContext,
  findExternalPartner,
  respondToPair,
  type MyPair,
  type ManagedPair,
  type PartnerOption,
} from "@/lib/tournaments/doubles";

import { notifyDoublesPair } from "@/lib/tournaments/pair-notify";
import type { InviteDivision } from "@/lib/tournaments/invite-link";

type Props = {
  champId: string;
  divisions: InviteDivision[];
  token?: string | null;
  verify?: string | null;
  /** Wait until a token-bound identity check is ready before calling public RPCs. */
  enabled?: boolean;
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
export function DoublesPartnerPicker({ champId, divisions, token, verify, enabled = true, clubId, onPay }: Props) {
  const qc = useQueryClient();
  const auth = { token, verify };
  const stateKey = ["champ-pairing-state", champId, token || "auth", verify || "unverified"];

  const { data: state, isLoading, isError, error, refetch } = useQuery({
    queryKey: stateKey,
    queryFn: () => fetchPairingState(champId, auth),
    enabled: enabled && !!champId && divisions.length > 0,
    retry: false,
  });

  // Pairing changes alter what this player owes (own fee vs both fees), so the
  // invitation's payment chooser amount must be refetched too — otherwise the
  // "How do you want to pay R…" total stays stale after switching options.
  const refresh = () => {
    qc.invalidateQueries({ queryKey: stateKey });
    qc.invalidateQueries({ queryKey: ["invite-pay-options"] }); qc.invalidateQueries({ queryKey: ["my-champ-reg-due"] });
  };

  if (divisions.length === 0) return null;
  if (!enabled) return null;
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading partner options…
      </div>
    );
  }
  if (isError) {
    const message = error instanceof Error ? error.message : "Partner options could not be loaded.";
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 space-y-2">
        <p className="text-xs text-destructive">{message}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (state?.family_mode) {
    return (
      <FamilyPairsBuilder
        champId={champId}
        divisions={divisions}
        locked={!!state.locked}
        feeCents={Number(state.entry_fee_cents || 0)}
        amountDueCents={Number(state.amount_due_cents || 0)}
        pairs={state.managed_pairs || []}
        auth={auth}
        onChanged={refresh}
        onPay={onPay}
      />
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
          feeCents={Number(pairForDivision(state?.pairs || [], d.group_number)?.fee_cents ?? state?.entry_fee_cents ?? 0)}
          totalDueCents={Number(state?.amount_due_cents || 0)}
          myFeePaid={!!state?.my_fee_paid}
          pair={pairForDivision(state?.pairs || [], d.group_number)}
          auth={auth}
          onChanged={refresh}
          onPay={onPay}
        />
      ))}
    </div>
  );
}

function FamilyPairsBuilder({
  champId,
  divisions,
  locked,
  feeCents,
  amountDueCents,
  pairs,
  auth,
  onChanged,
  onPay,
}: {
  champId: string;
  divisions: InviteDivision[];
  locked: boolean;
  feeCents: number;
  amountDueCents: number;
  pairs: ManagedPair[];
  auth: { token?: string | null; verify?: string | null };
  onChanged: () => void;
  onPay?: (amountCents: number) => void;
}) {
  return (
    <div className="space-y-3">
      {divisions.map((division) => (
        <FamilyDivisionPairs
          key={division.group_number}
          champId={champId}
          division={division}
          locked={locked}
          feeCents={feeCents}
          amountDueCents={amountDueCents}
          pairs={pairs.filter((pair) => pair.group_number === division.group_number)}
          auth={auth}
          onChanged={onChanged}
          onPay={onPay}
        />
      ))}
    </div>
  );
}

function FamilyDivisionPairs({
  champId,
  division,
  locked,
  feeCents,
  amountDueCents,
  pairs,
  auth,
  onChanged,
  onPay,
}: {
  champId: string;
  division: InviteDivision;
  locked: boolean;
  feeCents: number;
  amountDueCents: number;
  pairs: ManagedPair[];
  auth: { token?: string | null; verify?: string | null };
  onChanged: () => void;
  onPay?: (amountCents: number) => void;
}) {
  const [memberA, setMemberA] = useState("");
  const [memberB, setMemberB] = useState("");
  const playersKey = ["family-doubles-players", champId, division.group_number, auth.token || "auth", auth.verify || "unverified"];
  const { data: players = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: playersKey,
    queryFn: () => fetchFamilyPlayers(champId, division.group_number, auth),
    retry: false,
  });

  const available = players.filter((player) => !player.paired);
  const act = useMutation({
    mutationFn: (job: { kind: "create"; a: string; b: string } | { kind: "cancel"; id: string }) =>
      job.kind === "create"
        ? createFamilyPair(champId, division.group_number, job.a, job.b, auth)
        : cancelPair(job.id, auth),
    onSuccess: async (_, job) => {
      setMemberA("");
      setMemberB("");
      await Promise.all([onChanged(), refetch()]);
      toast.success(job.kind === "create" ? "Family pair added." : "Family pair removed.");
      // Naming the pair is the moment the entry becomes payable — take the
      // player straight to payment instead of making them hunt for a button.
      if (job.kind === "create" && feeCents > 0 && onPay) onPay(feeCents * 2);
    },
    onError: (e: any) => toast.error(e?.message || "Could not update the family pairs"),
  });

  const distinctPlayers = new Set(pairs.flatMap((pair) => [pair.member_a, pair.member_b]));
  const unpaidPlayers = new Set(
    pairs.flatMap((pair) => [
      ...(pair.member_a_paid ? [] : [pair.member_a]),
      ...(pair.member_b_paid ? [] : [pair.member_b]),
    ]),
  );

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-sm font-medium flex-1">{division.label}</span>
        <Badge variant="outline" className="text-[10px]">
          {pairs.length} {pairs.length === 1 ? "pair" : "pairs"}
        </Badge>
      </div>

      {pairs.length > 0 && (
        <div className="space-y-1.5">
          {pairs.map((pair) => (
            <div key={pair.id} className="flex items-center gap-2 rounded border p-2">
              <p className="text-xs flex-1">
                <span className="font-medium">{pair.member_a_name}</span> &amp; <span className="font-medium">{pair.member_b_name}</span>
              </p>
              <Badge variant={pair.status === "confirmed" ? "default" : "secondary"} className="text-[9px]">
                {pair.status === "confirmed" ? "Paid" : "Awaiting payment"}
              </Badge>
              {!locked && pair.status !== "confirmed" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ kind: "cancel", id: pair.id })}
                  title="Remove this pair"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {!locked && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Select value={memberA} onValueChange={setMemberA}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Player 1" /></SelectTrigger>
            <SelectContent>
              {available.filter((player) => player.member_id !== memberB).map((player) => (
                <SelectItem key={player.member_id} value={player.member_id} className="text-xs">
                  {player.display_name}{player.is_payer ? " (you)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={memberB} onValueChange={setMemberB}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Player 2" /></SelectTrigger>
            <SelectContent>
              {available.filter((player) => player.member_id !== memberA).map((player) => (
                <SelectItem key={player.member_id} value={player.member_id} className="text-xs">
                  {player.display_name}{player.is_payer ? " (you)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!memberA || !memberB || act.isPending || isLoading}
            onClick={() => act.mutate({ kind: "create", a: memberA, b: memberB })}
          >
            {act.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
            Add pair
          </Button>
        </div>
      )}

      {isLoading && <p className="text-[11px] text-muted-foreground">Loading invited family members…</p>}
      {isError && (
        <div className="space-y-1">
          <p className="text-[11px] text-destructive">{error instanceof Error ? error.message : "Family members could not be loaded."}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
        </div>
      )}
      {!isLoading && !isError && available.length < 2 && pairs.length === 0 && (
        <p className="text-[11px] text-muted-foreground">At least two invited, unpaired players are needed.</p>
      )}

      {pairs.length > 0 && (
        <div className="border-t pt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            {pairs.length} {pairs.length === 1 ? "pair" : "pairs"} · {distinctPlayers.size} players
            {feeCents > 0 && ` · ${unpaidPlayers.size} unpaid`}
          </p>
          {amountDueCents > 0 && onPay && (
            <Button className="w-full" size="sm" onClick={() => onPay(amountDueCents)}>
              <CreditCard className="w-3.5 h-3.5 mr-1" /> Pay {money(amountDueCents)} for everyone
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function DivisionPartner({
  champId,
  clubId,
  division,
  locked,
  feeCents,
  totalDueCents = 0,
  myFeePaid = false,
  pair,
  auth,
  onChanged,
  onPay,
}: {
  totalDueCents?: number;
  /** This player's own entry fee is already settled — only a partner's fee can still be paid. */
  myFeePaid?: boolean;
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
  // Removing an agreed or locked partner is a one-way step for the player, so
  // it always asks first (a family member on a shared login removed a paid pair
  // with one tap).
  const [confirmChange, setConfirmChange] = useState(false);
  const action = pairAction(pair, locked);
  const picking = action === "choose";
  const hasFee = feeCents > 0;

  const { data: options = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["champ-partner-options", champId, division.group_number, search, auth.token || "auth", auth.verify || "unverified"],
    queryFn: () => fetchPartnerOptions(champId, division.group_number, auth, search),
    enabled: picking,
    retry: false,
  });

  const act = useMutation({
    mutationFn: async (
      job:
        | { kind: "propose"; memberId: string; payForPartner: boolean }
        | { kind: "external"; partner: Parameters<typeof proposeExternalPartner>[2] }
        | { kind: "accept" }
        | { kind: "reject" }
        | { kind: "cancel" }
        | { kind: "payer"; mode: "self" | "both" },
    ) => {
      if (job.kind === "payer") return setPairPayer(champId, division.group_number, job.mode, auth);
      if (job.kind === "propose")
        return proposePartner(champId, division.group_number, job.memberId, auth, job.payForPartner);
      if (job.kind === "external")
        return proposeExternalPartner(champId, division.group_number, job.partner, auth);
      if (!pair) throw new Error("This pairing no longer exists");
      if (job.kind === "accept") return respondToPair(pair.id, true, auth);
      if (job.kind === "reject") return respondToPair(pair.id, false, auth);
      return cancelPair(pair.id, auth);
    },
    onSuccess: async (res: any, job) => {
      onChanged();
      if (res?.status === "confirmed") toast.success("Doubles pair confirmed and locked.");
      else if (res?.status === "awaiting_payment")
        toast.success("Pair created — it locks once all entry fees are paid.");
      else if (res?.status === "pending") toast.success("Partner request sent — they need to accept it.");
      else toast.success("Pairing updated.");

      // Tell both players on exactly the channels enabled for this tournament.
      if (res?.id && (job.kind === "propose" || job.kind === "external" || job.kind === "accept")) {
        try {
          await notifyDoublesPair(String(res.id), clubId ?? null, auth);
        } catch {
          /* notification failure must never block the pairing itself */
        }
      }
      // Picking a partner is the moment the entry becomes payable.
      if (job.kind === "propose" && hasFee && onPay) {
        const due = partnerPickDueCents(feeCents, job.payForPartner, myFeePaid, totalDueCents);
        if (due > 0) onPay(due);
      }
      if (job.kind === "external" && hasFee && onPay) onPay(feeCents * 2);
    },
    onError: (e: any) => toast.error(e?.message || "Could not update your doubles pair"),
  });

  const busy = act.isPending;
  const paymentLine = pairPaymentLabel(pair, feeCents, (r) => `R${r.toFixed(2)}`);
  // Pay button settles everything this player owes (all their events plus any
  // partner fees they cover), as the server calculates it.
  const iOwe = pairAmountOwedCents(pair, feeCents, totalDueCents);

  // My own outstanding fee before this pick (server figure; flat fee only as fallback).
  const myDue = myFeePaid ? 0 : totalDueCents > 0 ? totalDueCents : feeCents;
  const choose = (o: PartnerOption) => {
    // Picking a partner books the pair — the partner never has to accept, and
    // the player who picks covers both entry fees.
    if (hasFee) setFeeAsk(o);
    else act.mutate({ kind: "propose", memberId: o.member_id, payForPartner: true });
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
      {pairPayerChoices(pair, locked, feeCents).map((mode) => (
        <Button
          key={mode}
          size="sm"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => act.mutate({ kind: "payer", mode })}
        >
          {mode === "both"
            ? `Pay ${pair?.partner_name || "my partner"}'s ${money(feeCents)} fee too`
            : "Pay only my own entry fee"}
        </Button>
      ))}

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
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => (action === "awaiting_partner" ? act.mutate({ kind: "cancel" }) : setConfirmChange(true))}
        >
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
          ) : isError ? (
            <div className="space-y-2">
              <p className="text-[11px] text-destructive">
                {error instanceof Error ? error.message : "Partner options could not be loaded."}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
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
                      {o.needs_entry && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          Not in {division.label} yet
                        </Badge>
                      )}
                    </div>
                    {partnerOptionSubtitle(o) && (
                      <p className="text-[11px] text-muted-foreground">{partnerOptionSubtitle(o)}</p>
                    )}
                    {partnerReadinessNote(o) && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{partnerReadinessNote(o)}</p>
                    )}
                    {partnerEntryNote(o, division.label) && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{partnerEntryNote(o, division.label)}</p>
                    )}
                  </button>
                );
              })}
            </div>

          )}
          <ExternalPartnerForm champId={champId} feeCents={feeCents} busy={busy}
            onSubmit={(partner) => act.mutate({ kind: "external", partner })} />
        </div>
      )}

      <AlertDialog open={confirmChange} onOpenChange={setConfirmChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pair?.partner_name || "your partner"} as your {division.label} partner?</AlertDialogTitle>
            <AlertDialogDescription>
              {pair?.status === "confirmed"
                ? "This pair is paid and locked. Removing your partner unlocks it, and you will both need to choose new partners."
                : "Your partner will be removed and you will need to choose a new one."}
              {" "}No fees are charged or refunded by this step.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Keep {pair?.partner_name || "partner"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmChange(false);
                act.mutate({ kind: "cancel" });
              }}
            >
              Remove partner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!feeAsk} onOpenChange={(o) => !o && setFeeAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enter with {feeAsk?.display_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {myFeePaid ? (
                <>Your own entry fee is already paid. You can also pay {feeAsk?.display_name || "your partner"}'s
                {" "}{money(feeCents)}, or let them pay their own. The pair is confirmed once both fees are paid.</>
              ) : (
                <>You still owe {money(myDue)}; {feeAsk?.display_name || "your partner"}'s fee for this event is {money(feeCents)}.
                You can pay for both of you ({money(myDue + feeCents)}), or pay only your own ({money(myDue)}) and
                {" "}{feeAsk?.display_name || "your partner"} is asked to pay theirs. The pair is confirmed once both fees are paid.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                const o = feeAsk;
                if (!o) return;
                setFeeAsk(null);
                act.mutate({ kind: "propose", memberId: o.member_id, payForPartner: false });
              }}
            >
              {myFeePaid ? "They pay their own" : "Pay only mine"}
            </Button>
            <AlertDialogAction
              onClick={() => {
                const o = feeAsk;
                if (!o) return;
                setFeeAsk(null);
                act.mutate({ kind: "propose", memberId: o.member_id, payForPartner: true });
              }}
            >
              {myFeePaid ? `Pay their fee · ${money(feeCents)}` : `Pay both · ${money(myDue + feeCents)}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * "My partner isn't on the list" — only when the organiser allows outside
 * partners. The entering player pays both fees; no partner confirmation.
 */
function ExternalPartnerForm({ champId, feeCents, busy, onSubmit }: {
  champId: string;
  feeCents: number;
  busy: boolean;
  onSubmit: (p: { memberId?: string | null; clubId?: string | null; name?: string; gender?: string; phone?: string; email?: string; consent: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [clubId, setClubId] = useState<string>("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ member_id: string; display_name: string }[] | null>(null);
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const { data: ctx } = useQuery({ queryKey: ["external-partner-ctx", champId], queryFn: () => fetchExternalPartnerContext(champId), retry: false });
  if (!ctx?.allowed) return null;
  const noClub = clubId === "none";
  const fee = feeCents > 0 ? ` You pay both entry fees (${money(feeCents * 2)}).` : "";
  const nameOk = name.trim().includes(" ") && name.trim().length >= 4;

  if (!open) return (
    <button type="button" className="text-[11px] text-primary underline" onClick={() => setOpen(true)}>My partner isn't on the list</button>
  );
  return (
    <div className="space-y-2 rounded-md border border-dashed p-2">
      <p className="text-[11px] text-muted-foreground">Enter a partner who wasn't invited.{fee} The organiser can remove the pair.</p>
      <Select value={clubId} onValueChange={(v) => { setClubId(v); setHits(null); }}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Partner's club" /></SelectTrigger>
        <SelectContent>
          {ctx.clubs.map((c) => <SelectItem key={c.club_id} value={c.club_id}>{c.club_name}</SelectItem>)}
          <SelectItem value="none">No club (guest)</SelectItem>
        </SelectContent>
      </Select>
      {clubId && !noClub && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <Input className="h-8 text-sm" placeholder="Search partner by surname or NSA number" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button size="sm" variant="outline" disabled={q.trim().length < 3} onClick={async () => {
              try { setHits(await findExternalPartner(champId, clubId, q.trim())); } catch (e: any) { toast.error(e?.message || "Search failed"); }
            }}>Search</Button>
          </div>
          {hits?.map((h) => (
            <button key={h.member_id} type="button" disabled={busy} className="w-full rounded-md border p-2 text-left text-sm hover:bg-muted"
              onClick={() => onSubmit({ memberId: h.member_id, consent: true })}>
              Enter with {h.display_name}
            </button>
          ))}
          {hits && <p className="text-[11px] text-muted-foreground">{hits.length ? "Not listed?" : "Not found."} Add their details below.</p>}
        </div>
      )}
      {clubId && (noClub || hits) && (
        <div className="space-y-1.5">
          <Input className="h-8 text-sm" placeholder="First name and surname" value={name} onChange={(e) => setName(e.target.value)} />
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Gender" /></SelectTrigger>
            <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent>
          </Select>
          <Input className="h-8 text-sm" inputMode="tel" placeholder="Cell (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input className="h-8 text-sm" type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="flex items-start gap-2 text-[11px]">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            My partner agreed to be entered and to share these details with the organiser.
          </label>
          <Button size="sm" className="w-full" disabled={busy || !nameOk || !gender || !consent}
            onClick={() => onSubmit({ clubId: noClub ? null : clubId, name: name.trim(), gender, phone: phone.trim(), email: email.trim(), consent })}>
            Enter with this partner
          </Button>
        </div>
      )}
      <button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}
