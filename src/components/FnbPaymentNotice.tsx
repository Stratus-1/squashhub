import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FnbPaymentNoticeProps {
  className?: string;
  showEftFallback?: boolean;
  gateway?: string | null;
}

/**
 * Bank-specific warning shown next to Yoco / card payment buttons.
 * Only relevant for Yoco — other gateways (stitch, payfast, etc.) don't have
 * this issue, so we hide the notice unless the active gateway is Yoco.
 */
export const FnbPaymentNotice = ({ className, showEftFallback = true, gateway }: FnbPaymentNoticeProps) => {
  if (gateway && gateway.toLowerCase() !== "yoco") return null;
  return (
    <div
      className={cn(
        "rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-snug",
        className,
      )}
    >
      <div className="flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1 text-foreground">
          <p className="font-semibold text-amber-700 dark:text-amber-400">
            FNB &amp; Absa clients — please read before paying by card
          </p>
          <p className="text-muted-foreground">
            FNB and Absa often block Yoco, Google Pay and Apple Pay by default. If your card is
            declined, enable online purchases first:
          </p>
          <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
            <li>
              <strong>FNB App</strong> → My Cards → Card Limits → enable{" "}
              <strong>Online Purchases</strong> and <strong>Tap-to-Pay / Digital Wallet</strong>.
            </li>
            <li>
              <strong>Absa Banking App / Online Banking</strong> → Manage Cards → enable{" "}
              <strong>Internet Purchases</strong> (and Digital Wallet for Google / Apple Pay).
            </li>
          </ul>
          {showEftFallback && (
            <p className="text-muted-foreground">
              Still struggling? Use <strong>EFT</strong> instead — it always works and the club
              will mark your payment as soon as it reflects.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FnbPaymentNotice;
