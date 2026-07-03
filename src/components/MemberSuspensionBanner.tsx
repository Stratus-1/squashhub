import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertOctagon, AlertTriangle, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMemberAccessGate } from "@/hooks/use-member-access-gate";

/**
 * Persistent banner shown on the dashboard when the active member is in
 * arrears (warning) or fully suspended. Suspended members lose access to
 * bookings, doors, leagues, challenges, events, and the bar — but can still
 * log in, view their account, and pay to restore access.
 */
export function MemberSuspensionBanner() {
  const gate = useMemberAccessGate();
  const navigate = useNavigate();

  if (gate.status === "active") return null;

  const isSuspended = gate.suspended;
  const Icon = isSuspended ? AlertOctagon : AlertTriangle;
  const tone = isSuspended
    ? "border-destructive/50 bg-destructive/10"
    : "border-amber-500/50 bg-amber-500/10";
  const iconTone = isSuspended ? "text-destructive" : "text-amber-600 dark:text-amber-400";

  return (
    <div className="px-4 mt-2">
      <Card className={`p-3 flex items-start gap-3 ${tone}`}>
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconTone}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {isSuspended ? "Account suspended" : "Account in arrears"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {gate.reason || gate.message}
          </p>
          {isSuspended && gate.blocks.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Blocked: {gate.blocks.join(", ")}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant={isSuspended ? "destructive" : "default"}
          onClick={() => navigate("/account#fees")}
          className="gap-1.5 shrink-0"
        >
          <CreditCard className="w-3.5 h-3.5" />
          Pay now
        </Button>
      </Card>
    </div>
  );
}
