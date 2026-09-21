import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Ticket, Loader2 } from "lucide-react";
import { useClubCurrency } from "@/hooks/use-currency";
import { useMyVisitorPass, usePurchaseVisitorPass, useVisitorPassOptions } from "@/hooks/use-visitor-pass";
import {
  VISITOR_PASS_KINDS,
  VISITOR_PASS_LABEL,
  VISITOR_PASS_VALIDITY,
  isFreePass,
  isPassLive,
  visitorPassStatusLabel,
  type VisitorPassKind,
} from "@/lib/visitor-pass";

/**
 * A visitor's own pass: what they hold now, and what they can buy.
 * Prices come from the club's Fee Structure — never stored here.
 */
export function VisitorPassCard({
  clubId,
  clubMemberId,
  requiresApproval,
}: {
  clubId: string;
  clubMemberId: string;
  requiresApproval?: boolean;
}) {
  const { format: money } = useClubCurrency();
  const { data: options = [] } = useVisitorPassOptions(clubId);
  const { data: pass } = useMyVisitorPass(clubMemberId);
  const purchase = usePurchaseVisitorPass();
  const [busyKind, setBusyKind] = useState<VisitorPassKind | null>(null);

  const offered = useMemo(
    () =>
      VISITOR_PASS_KINDS.map((k) => options.find((o) => o.kind === k)).filter(
        (o): o is NonNullable<typeof o> => !!o && o.active,
      ),
    [options],
  );

  const live = isPassLive(pass);
  const inProgress = !!pass && (pass.status === "pending_payment" || pass.status === "pending_approval");

  const buy = async (kind: VisitorPassKind) => {
    setBusyKind(kind);
    try {
      await purchase.mutateAsync({ clubMemberId, kind });
      toast.success("Visitor pass requested — see the status above.");
    } catch (e: any) {
      toast.error(e.message || "Could not buy that pass");
    } finally {
      setBusyKind(null);
    }
  };

  return (
    <Card className="p-3 md:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Ticket className="w-4 h-4 text-primary" />
          Visitor pass
        </h3>
        {pass && (
          <Badge variant={live ? "default" : "secondary"} className="text-[10px]">
            {visitorPassStatusLabel(pass)}
          </Badge>
        )}
      </div>

      {live && pass?.valid_until && (
        <p className="text-xs">
          Visitor pass active until{" "}
          <span className="font-semibold">
            {new Date(pass.valid_until).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </span>
          . You can book courts yourself until then.
        </p>
      )}

      {!live && pass?.status === "pending_payment" && (
        <p className="text-xs text-muted-foreground">
          Your {VISITOR_PASS_LABEL[pass.pass_kind]} is waiting for payment of {money(Number(pass.amount || 0))}. Pay it
          below and your booking access starts straight away.
        </p>
      )}
      {!live && pass?.status === "pending_approval" && (
        <p className="text-xs text-muted-foreground">
          Paid — the club still needs to approve your pass. You'll be able to book as soon as they do.
        </p>
      )}

      {!inProgress && (
        <>
          {offered.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              This club hasn't set up visitor passes yet. Please ask the club to book a court for you.
            </p>
          ) : (
            <div className="space-y-2">
              {!live && <p className="text-xs text-muted-foreground">Choose a pass to book courts yourself:</p>}
              {live && <p className="text-xs text-muted-foreground">Need longer? Buy another pass when this one ends.</p>}
              <div className="grid gap-2 sm:grid-cols-3">
                {offered.map((o) => (
                  <div key={o.id} className="rounded-md border p-2.5 space-y-1">
                    <div className="text-xs font-semibold">{VISITOR_PASS_LABEL[o.kind]}</div>
                    <div className="text-sm font-bold">{isFreePass(o) ? "Free" : money(o.amount)}</div>
                    <div className="text-[10px] text-muted-foreground">{VISITOR_PASS_VALIDITY[o.kind]}</div>
                    {requiresApproval && (
                      <div className="text-[10px] text-muted-foreground">Needs club approval before it starts.</div>
                    )}
                    <Button
                      size="sm"
                      className="w-full h-7 text-[11px]"
                      disabled={!!busyKind || live}
                      onClick={() => buy(o.kind)}
                    >
                      {busyKind === o.kind ? <Loader2 className="w-3 h-3 animate-spin" /> : isFreePass(o) ? "Get pass" : "Buy pass"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-[10px] text-muted-foreground leading-snug">
        A pass lets you book a court. The club's court fee for each booking is charged separately and shows on your
        account.
      </p>
    </Card>
  );
}
