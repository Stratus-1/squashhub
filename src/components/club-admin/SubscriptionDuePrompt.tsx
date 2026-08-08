import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertCircle, CreditCard } from "lucide-react";

/**
 * Shows tenant admins a prompt when their club has an unpaid platform
 * subscription invoice. Disappears automatically once the invoice is paid.
 */
export function SubscriptionDuePrompt({ clubId }: { clubId?: string | null }) {
  const navigate = useNavigate();

  const { data: invoices } = useQuery({
    queryKey: ["club-unpaid-sub-invoices", clubId],
    enabled: !!clubId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_subscription_invoices")
        .select("id, invoice_number, total, currency, due_date, status, stitch_payment_link")
        .eq("club_id", clubId!)
        .in("status", ["unpaid", "pending", "overdue", "past_due"])
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  if (!invoices || invoices.length === 0) return null;

  const oldest = invoices[0];
  const sym = (oldest.currency || "ZAR").toUpperCase() === "USD" ? "$"
    : (oldest.currency || "ZAR").toUpperCase() === "EUR" ? "€" : "R";
  const outstanding = invoices.reduce((s, i: any) => s + Number(i.total || 0), 0);
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
            <Button size="sm" className="h-7 text-xs" onClick={() => navigate("/club-admin?tab=subscription")}>
              <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Pay now
            </Button>
            {oldest.stitch_payment_link && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => window.open(oldest.stitch_payment_link as string, "_blank", "noopener")}
              >
                Open payment link
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
