import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { Loader2, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useClubCurrency } from "@/hooks/use-currency";

type Method = "card" | "eft" | "account";
const METHOD_LABEL: Record<Method, string> = { card: "Card", eft: "EFT", account: "From my member account credit" };
const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Waiting for your payment", ready: "Sending to GoBook", submitting: "Sending to GoBook",
  submitted: "Accepted by GoBook", posted: "Posted to Court Manager", cancelled: "Rejected by Court Manager",
  failed: "Could not send — the club will check", abandoned: "Not paid",
};

async function invokeError(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    const d = await error.context.json().catch(() => null);
    return d?.error || "Lights top-up failed";
  }
  return (error as Error)?.message || "Lights top-up failed";
}

/** Lights-only GoBook top-up. Render only for members whose GoBook account is linked. */
export function GoBookLightsTopUp({ clubId, memberId, onStartTopUp }: {
  clubId: string; memberId: string; onStartTopUp?: (amount: number, method: "card" | "eft") => void;
}) {
  const { format } = useClubCurrency();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [amount, setAmount] = useState("100");
  const [method, setMethod] = useState<Method>("card");
  const [confirmed, setConfirmed] = useState(false);

  const info = useQuery({
    queryKey: ["gobook-lights-topup-info", clubId, memberId],
    enabled: open,
    queryFn: async () => {
      const [{ data: club }, { data: member }] = await Promise.all([
        supabase.from("clubs").select("name").eq("id", clubId).maybeSingle(),
        supabase.from("club_members").select("gobook_client_id, gobook_client_name, first_name, last_name").eq("id", memberId).maybeSingle(),
      ]);
      return { club, member: member as any };
    },
  });
  const recent = useQuery({
    queryKey: ["gobook-lights-topups", memberId],
    queryFn: async () => {
      const { data } = await supabase.from("gobook_lights_topups")
        .select("id, amount, status, reference, cancellation_reason, created_at")
        .eq("club_member_id", memberId).neq("status", "abandoned").order("created_at", { ascending: false }).limit(3);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("gobook-lights-topup", {
        body: { action: "create", club_id: clubId, club_member_id: memberId, amount: Number(amount), method, confirmed },
      });
      if (error) throw new Error(await invokeError(error));
      if (data?.error) throw new Error(data.error);
      return data.topup as { reference: string; amount: number };
    },
    onSuccess: (t) => {
      setOpen(false); setStep(1); setConfirmed(false);
      void qc.invalidateQueries({ queryKey: ["gobook-lights-topups", memberId] });
      if (method === "account") {
        toast.success(`Lights top-up ${t.reference} is being sent to GoBook.`);
        return;
      }
      toast.success(`Lights top-up ${t.reference} created. Complete your ${method.toUpperCase()} payment now.`);
      if (onStartTopUp) onStartTopUp(Number(t.amount), method);
      else navigate(`/my-account?topup=${Number(t.amount).toFixed(2)}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const n = Number(amount);
  const amountOk = Number.isFinite(n) && n >= 10 && n <= 10000;
  const m = info.data?.member;
  const goBookName = m?.gobook_client_name || [m?.first_name, m?.last_name].filter(Boolean).join(" ");

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setStep(1); setOpen(true); }}>
          <Lightbulb className="h-3.5 w-3.5" /> Top up your Lights account
        </Button>
      </div>
      {!!recent.data?.length && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {recent.data.map((r: any) => (
            <li key={r.id}>
              {format(Number(r.amount), 2)} · {r.reference} · <span className={r.status === "cancelled" || r.status === "failed" ? "text-destructive" : r.status === "posted" ? "text-success" : ""}>{STATUS_LABEL[r.status] ?? r.status}</span>
              {r.status === "cancelled" && <> — {r.cancellation_reason || "no reason given"}. The money is back on your SquashHub account.</>}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Top up your Lights account</DialogTitle>
            <DialogDescription>Lights only. The amount is sent to your GoBook / Court Manager Lights account.</DialogDescription>
          </DialogHeader>
          {step === 1 ? (
            <div className="space-y-4 text-[13px]">
              <div className="space-y-1.5">
                <Label htmlFor="lights-amount">Amount (R10 – R10,000)</Label>
                <Input id="lights-amount" type="number" min={10} max={10000} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Pay with</Label>
                <RadioGroup value={method} onValueChange={(v) => setMethod(v as Method)}>
                  {(Object.keys(METHOD_LABEL) as Method[]).map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <RadioGroupItem id={`lights-${k}`} value={k} />
                      <Label htmlFor={`lights-${k}`} className="font-normal">{METHOD_LABEL[k]}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-[13px]">
              {info.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md border border-border p-3">
                  <dt className="text-muted-foreground">Paid to</dt><dd>{info.data?.club?.name}</dd>
                  <dt className="text-muted-foreground">GoBook account</dt><dd>{goBookName || "—"}</dd>
                  <dt className="text-muted-foreground">GoBook client ID</dt><dd>{m?.gobook_client_id ?? "—"}</dd>
                  <dt className="text-muted-foreground">Payment for</dt><dd>Lights account</dd>
                  <dt className="text-muted-foreground">Pay with</dt><dd>{METHOD_LABEL[method]}</dd>
                  <dt className="text-muted-foreground">Amount</dt><dd className="font-semibold">{format(n, 2)}</dd>
                </dl>
              )}
              <p className="text-xs text-muted-foreground">Check this is your own GoBook account. A payment to the wrong account can only be reversed by the club in Court Manager.</p>
              <div className="flex items-start gap-2">
                <Checkbox id="lights-confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
                <Label htmlFor="lights-confirm" className="font-normal leading-snug">I confirm this is my GoBook account and the Lights account above should be credited.</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            {step === 1 ? (
              <Button disabled={!amountOk} onClick={() => setStep(2)}>Next</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button disabled={!confirmed || create.isPending || !m?.gobook_client_id} onClick={() => create.mutate()}>
                  {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {method === "account" ? "Send to GoBook" : `Continue to ${method.toUpperCase()} payment`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
