import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertCircle, CreditCard, Landmark } from "lucide-react";

/**
 * Shows tenant admins a prompt when their club has an unpaid platform
 * subscription invoice. Disappears automatically once the invoice is paid:
 * the billing webhook updates the invoice row, realtime pushes the change
 * here instantly, and a gentle poll covers environments without realtime
 * (payment often completes in a separate browser tab).
 */
export function SubscriptionDuePrompt({ clubId }: { clubId?: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: invoices } = useQuery({
    queryKey: ["club-unpaid-sub-invoices", clubId],
    enabled: !!clubId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // While anything is outstanding, poll as a fallback so the banner clears
    // even when realtime is unavailable. Stops once nothing is due.
    refetchInterval: (query) =>
      ((query.state.data as unknown[] | undefined)?.length ?? 0) > 0 ? 60_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_subscription_invoices")
        .select(
          "id, invoice_number, total, currency, due_date, status, stitch_payment_link, eft_proof_uploaded_at, eft_review_status"
        )
        .eq("club_id", clubId!)
        .in("status", ["issued", "unpaid", "pending", "overdue", "past_due"])
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });


  // Instant clear: any invoice change for this club (paid, void, new) refreshes.
  useEffect(() => {
    if (!clubId) return;
    const channel = supabase
      .channel(`sub-invoices-${clubId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "platform_subscription_invoices",
          filter: `club_id=eq.${clubId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["club-unpaid-sub-invoices", clubId] });
          qc.invalidateQueries({ queryKey: ["club-platform-invoices", clubId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clubId, qc]);

  if (!invoices || invoices.length === 0) return null;

  // Proof of payment submitted → stop nagging the admin. The invoice sits with
  // the platform team until they verify the EFT and mark it paid.
  const awaitingReview = invoices.filter(
    (i: any) => i.eft_review_status === "pending" || (i.eft_proof_uploaded_at && i.eft_review_status !== "rejected")
  );
  const actionable = invoices.filter((i: any) => !awaitingReview.includes(i));

  if (actionable.length === 0) {
    if (awaitingReview.length === 0) return null;
    return (
      <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-2.5">
        <div className="flex items-start gap-2">
          <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-500" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Proof of payment received</span> for{" "}
            {awaitingReview.length === 1
              ? `invoice ${awaitingReview[0].invoice_number}`
              : `${awaitingReview.length} invoices`}
            . We're verifying the EFT — the invoice is marked paid once confirmed.
          </p>
        </div>
      </div>
    );
  }

  const oldest = actionable[0];
  const sym = (oldest.currency || "ZAR").toUpperCase() === "USD" ? "$"
    : (oldest.currency || "ZAR").toUpperCase() === "EUR" ? "€" : "R";
  const outstanding = actionable.reduce((s, i: any) => s + Number(i.total || 0), 0);
  const overdue = oldest.due_date ? new Date(oldest.due_date) < new Date() : false;


  return (
    <div className={`rounded-lg border p-3 ${overdue ? "border-destructive/50 bg-destructive/5" : "border-amber-500/50 bg-amber-500/5"}`}>
      <div className="flex items-start gap-2">
        <AlertCircle className={`w-4 h-4 mt-0.5 shrink-0 ${overdue ? "text-destructive" : "text-amber-500"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {overdue ? "Subscription payment overdue" : "Subscription payment due"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {invoices.length === 1
              ? `Invoice ${oldest.invoice_number} — ${sym}${Number(oldest.total || 0).toFixed(2)}`
              : `${invoices.length} invoices outstanding — ${sym}${outstanding.toFixed(2)}`}
            {oldest.due_date ? ` · due ${new Date(oldest.due_date).toLocaleDateString()}` : ""}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => navigate(`/club-admin?tab=subscription&pay=${oldest.id}`)}
            >
              <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Pay with card now
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => navigate(`/club-admin?tab=subscription&eft=${oldest.id}`)}
            >
              <Landmark className="w-3.5 h-3.5 mr-1.5" /> Pay by EFT now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
