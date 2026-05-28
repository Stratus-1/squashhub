import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FnbPaymentNoticeProps {
  className?: string;
  showEftFallback?: boolean;
}

/**
 * FNB-specific warning shown next to Yoco/card payment buttons.
 * FNB's 3D Secure and fraud rules frequently decline Yoco card payments,
 * Google Pay and Apple Pay unless the cardholder has enabled the right
 * settings in the FNB App.
 */
export const FnbPaymentNotice = ({ className, showEftFallback = true }: FnbPaymentNoticeProps) => {
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
            FNB clients — please read before paying by card
          </p>
          <p className="text-muted-foreground">
            FNB often blocks Yoco, Google Pay and Apple Pay by default. If your card is declined,
            open the <strong>FNB App → My Cards → Card Limits</strong> and enable{" "}
            <strong>Online Purchases</strong> and <strong>Tap-to-Pay / Digital Wallet</strong>,
            then try again.
          </p>
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
