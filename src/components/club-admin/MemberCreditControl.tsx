import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemberCredit, useSaveMemberCredit } from "@/hooks/use-member-credit";

export function MemberCreditControl({ clubId, memberId, readOnly = false }: {
  clubId: string; memberId?: string | null; readOnly?: boolean;
}) {
  const { data, isLoading, error } = useMemberCredit(clubId, memberId);
  const save = useSaveMemberCredit(clubId, memberId);
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (!data) return;
    setAmount(memberId ? (data.override_amount === null ? "" : String(data.override_amount)) : String(data.default_amount));
  }, [data, memberId]);
  const labelId = memberId ? `credit-${memberId}` : "club-default-credit";
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading credit allowed…</p>;
  if (error || !data) return <p className="text-xs text-destructive">Credit allowed could not be loaded.</p>;
  const canEdit = data.can_edit && !readOnly;
  const n = Number(amount);
  const inherits = !!memberId && amount.trim() === "";
  const valid = amount.trim() !== "" && Number.isFinite(n) && n >= 0 && /^\d+(\.\d{1,2})?$/.test(amount);
  const submit = async (useDefault = false) => {
    if (!useDefault && !inherits && !valid) return toast.error("Enter a non-negative ZAR amount with at most two decimal places.");
    try {
      await save.mutateAsync(useDefault || inherits ? null : n);
      if (useDefault) setAmount("");
      toast.success("Credit allowed saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save credit allowed");
    }
  };
  if (readOnly) return <p className="text-xs text-muted-foreground" aria-label="Member credit allowed">Your credit limit: R{Number(data.credit_allowed).toFixed(2)}</p>;
  return (
    <section className="space-y-2 border-b border-border py-3" aria-label={memberId ? "Member credit allowed" : "Member Credit"}>
      <h3 className="text-sm font-semibold">{memberId ? "Financial / Billing" : "Member Credit"}</h3>
      <p className="text-xs text-muted-foreground">
        {memberId ? `Effective credit: R${Number(data.credit_allowed).toFixed(2)} · ${data.override_amount === null ? "Default" : "Override"}` : "Club-wide default credit allowed (ZAR)"}
      </p>
      {canEdit && <>
        {memberId && <p id={`${labelId}-help`} className="text-xs text-muted-foreground">Club default: R{Number(data.default_amount).toFixed(2)} · Leave blank to inherit</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={labelId} className="text-xs">Credit allowed (R)</Label>
          <Input id={labelId} type="number" min="0" step="0.01" value={amount} placeholder={memberId ? Number(data.default_amount).toFixed(2) : undefined} aria-describedby={memberId ? `${labelId}-help` : undefined} onChange={e => setAmount(e.target.value)} disabled={save.isPending} className="h-8 w-32 text-xs" />
          <Button size="sm" disabled={save.isPending || (!inherits && !valid)} onClick={() => submit()}>{save.isPending ? "Saving…" : "Save credit"}</Button>
          {memberId && <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => submit(true)}>Use club default</Button>}
        </div>
      </>}
      {!memberId && !canEdit && <p className="text-sm tabular-nums">R{Number(data.default_amount).toFixed(2)}</p>}
    </section>
  );
}