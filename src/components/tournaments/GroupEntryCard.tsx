import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useClubMembers } from "@/hooks/use-club";
import { useClubCurrency } from "@/hooks/use-currency";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CreditCard, Landmark, Plus, X, Users } from "lucide-react";
import { toast } from "sonner";
import { acceptsAccountCharge } from "@/lib/tournaments/payment-methods";
import {
  buildGroupEntryPayload, eligibleGroupCandidates, groupEntryTotalCents, type GroupEntryRow,
} from "@/lib/tournaments/group-entry";
import { isSupportedGateway, startClubCheckout, type GatewayId } from "@/lib/club-payments";

interface Props {
  champ: any;
  clubId: string;
  memberId: string;
  paymentGateway: string | null;
}

const getName = (p: any) => p?.name || p?.profiles?.name || "Unknown";

export function GroupEntryCard({ champ, clubId, memberId, paymentGateway }: Props) {
  const qc = useQueryClient();
  const { data: members = [] } = useClubMembers(clubId);
  const { format: fmtMoney } = useClubCurrency();
  const money = (cents: number) => fmtMoney(cents / 100, 2);

  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rows, setRows] = useState<GroupEntryRow[]>([]);

  const entryFeeCents = Number(champ?.entry_fee_cents || 0);
  const paymentRequired = !!champ?.payment_required && entryFeeCents > 0;
  const configuredMethods: string[] = Array.isArray(champ?.payment_methods) ? champ.payment_methods : [];
  const acceptsCard = configuredMethods.includes("card");
  const acceptsEft = configuredMethods.length > 0 ? configuredMethods.includes("eft") : true;
  const acceptsAccount = acceptsAccountCharge(champ?.payment_methods);
  const cardReady = acceptsCard && isSupportedGateway(paymentGateway);
  const isDoubles = champ?.match_type === "doubles";
  const canPickPartners = isDoubles && champ?.partner_mode === "players";

  const { data: existing = [] } = useQuery({
    queryKey: ["champ-group-existing", champ?.id],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("club_member_id, partner_member_id, status")
        .eq("champ_id", champ.id)
        .neq("status", "cancelled");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!champ?.id && open,
  });

  const enteredIds = useMemo(() => existing.map((r: any) => r.club_member_id), [existing]);
  const pairedIds = useMemo(() => {
    const s = new Set<string>();
    existing.forEach((r: any) => {
      if (r.partner_member_id) { s.add(r.club_member_id); s.add(r.partner_member_id); }
    });
    return s;
  }, [existing]);

  const candidates = useMemo(
    () => eligibleGroupCandidates(members as any[], {
      payerMemberId: memberId,
      alreadyEnteredIds: enteredIds,
      selectedIds: rows.map((r) => r.memberId),
      gender: champ?.gender,
    }),
    [members, memberId, enteredIds, rows, champ?.gender],
  );

  const partnerOptions = useMemo(
    () => (members as any[]).filter((m) => !pairedIds.has(m.id)),
    [members, pairedIds],
  );

  const totalCents = groupEntryTotalCents(rows, entryFeeCents);

  const enter = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("register_players_for_champ", {
        p_champ_id: champ.id,
        p_payer_member_id: memberId,
        p_entries: buildGroupEntryPayload(rows),
      });
      if (error) throw error;
      return (data || {}) as any;
    },
    onError: (e: any) => toast.error(e.message || "Could not enter these players"),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["champ-group-existing", champ?.id] });
    qc.invalidateQueries({ queryKey: ["tournament-registrations", champ?.id] });
    qc.invalidateQueries({ queryKey: ["my-champ-reg", champ?.id, memberId] });
    qc.invalidateQueries({ queryKey: ["member-fees"] });
    qc.invalidateQueries({ queryKey: ["member-account"] });
  };

  const raiseFees = async (registrationIds: string[]) => {
    const { data, error } = await (supabase as any).rpc("charge_champ_entries_to_payer", {
      p_registration_ids: registrationIds,
      p_payer_member_id: memberId,
    });
    if (error) throw error;
    return (data || {}) as { fee_ids?: string[]; total?: number; count?: number };
  };

  const submit = async (mode: "account" | "card" | "eft") => {
    if (rows.length === 0) return;
    try {
      const res = await enter.mutateAsync();
      const regIds: string[] = res?.registration_ids || [];
      if (!paymentRequired || entryFeeCents === 0) {
        toast.success(`${rows.length} player${rows.length > 1 ? "s" : ""} entered.`);
        setRows([]); refreshAll();
        return;
      }
      const fees = await raiseFees(regIds);
      const feeIds = fees.fee_ids || [];

      if (mode === "account") {
        toast.success(`${money(totalCents)} added to your account for ${rows.length} entr${rows.length > 1 ? "ies" : "y"}.`);
        setRows([]); refreshAll();
        return;
      }
      if (mode === "eft") {
        await fromExt("club_champs_registrations").update({ status: "pending_eft" }).in("id", regIds);
        toast.success(`Entered — pay ${money(totalCents)} by EFT and the club will confirm.`);
        setRows([]); refreshAll();
        return;
      }
      if (!isSupportedGateway(paymentGateway)) throw new Error("No card gateway is configured for this club.");
      if (feeIds.length === 0) throw new Error("Nothing left to pay for these players.");
      refreshAll();
      await startClubCheckout(paymentGateway as GatewayId, {
        clubId, clubMemberId: memberId,
        amount: totalCents / 100,
        purpose: "fee",
        fee_ids: feeIds,
        description: `${champ.name} — ${rows.length} entries`,
        returnPath: `${window.location.pathname}?ctx=tournament`,
      });
      setRows([]);
    } catch (e: any) {
      toast.error(e.message || "Could not complete this group entry");
    }
  };

  const busy = enter.isPending;

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(true)}>
        <Users className="w-3 h-3 mr-1" /> Enter &amp; pay for someone else
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-border/70 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">Enter &amp; pay for other players</p>
        <Button variant="ghost" size="sm" className="h-6 px-1" onClick={() => { setOpen(false); setRows([]); }}>
          <X className="w-3 h-3" />
        </Button>
      </div>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs w-full justify-start font-normal">
            <Plus className="w-3 h-3 mr-1" /> Add a player…
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[220px]" align="start">
          <Command>
            <CommandInput placeholder="Type a name…" className="h-9 text-xs" />
            <CommandList>
              <CommandEmpty className="py-4 text-xs text-center text-muted-foreground">No eligible player found.</CommandEmpty>
              <CommandGroup>
                {candidates.map((m: any) => (
                  <CommandItem
                    key={m.id}
                    value={getName(m)}
                    className="text-xs"
                    onSelect={() => {
                      setRows((prev) => [...prev, { memberId: m.id, name: getName(m), partnerMemberId: null }]);
                      setPickerOpen(false);
                    }}
                  >
                    {getName(m)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {rows.map((row, i) => (
        <div key={row.memberId} className="flex items-center gap-2">
          <span className="text-xs flex-1 truncate">{row.name}</span>
          {canPickPartners && (
            <Select
              value={row.partnerMemberId || "none"}
              onValueChange={(v) => setRows((prev) => prev.map((r, ri) =>
                ri === i ? { ...r, partnerMemberId: v === "none" ? null : v } : r))}
            >
              <SelectTrigger className="h-7 text-[11px] w-[150px]">
                <SelectValue placeholder="Partner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">Partner: choose later</SelectItem>
                {partnerOptions
                  .filter((m: any) => m.id !== row.memberId)
                  .map((m: any) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">{getName(m)}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          {entryFeeCents > 0 && <span className="text-[11px] text-muted-foreground">{money(entryFeeCents)}</span>}
          <Button variant="ghost" size="sm" className="h-6 px-1"
            onClick={() => setRows((prev) => prev.filter((_, ri) => ri !== i))}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}

      {rows.length > 0 && (
        <>
          <p className="text-[11px] text-muted-foreground">
            {rows.length} entr{rows.length > 1 ? "ies" : "y"}
            {entryFeeCents > 0 && <> — <span className="font-medium text-foreground">{money(totalCents)}</span> total</>}
          </p>
          <div className="flex flex-wrap gap-2">
            {!paymentRequired || entryFeeCents === 0 ? (
              <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => submit("account")}>
                {busy && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Enter these players
              </Button>
            ) : (
              <>
                {cardReady && (
                  <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => submit("card")}>
                    {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CreditCard className="w-3 h-3 mr-1" />}
                    Pay {money(totalCents)} by card
                  </Button>
                )}
                {acceptsAccount && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => submit("account")}>
                    {busy && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Add {money(totalCents)} to my account
                  </Button>
                )}
                {acceptsEft && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => submit("eft")}>
                    <Landmark className="w-3 h-3 mr-1" /> Pay {money(totalCents)} by EFT
                  </Button>
                )}
              </>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Everyone you add is entered straight away and gets a notification. Players who are already paid for are never charged twice.
          </p>
        </>
      )}
    </div>
  );
}
