import { AlertTriangle } from "lucide-react";
import { EARLY_ACCOUNT_WARNING } from "@/lib/account-charge-gate";

export function AccountChargeWarning({ show, className = "" }: { show: boolean; className?: string }) {
  if (!show) return null;
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive ${className}`}>
      <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
      <span>{EARLY_ACCOUNT_WARNING}</span>
    </div>
  );
}
