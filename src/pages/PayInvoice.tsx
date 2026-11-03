import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";

const UUID = /^[0-9a-f-]{36}$/i;
const TOKEN = /^[0-9a-f]{40}$/i;

// Landing page for invoice email "Pay online now" links. Hosted on the club's own
// squashhub.co.za address so corporate email scanners don't block it; the member
// presses the button to continue to the secure PayFast checkout.
export default function PayInvoice() {
  const [params] = useSearchParams();
  const i = params.get("i") || "";
  const t = params.get("t") || "";
  const valid = UUID.test(i) && TOKEN.test(t);
  const href = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invoice-pay?i=${encodeURIComponent(i)}&t=${encodeURIComponent(t)}`;

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 space-y-4 text-center">
        <h1 className="text-xl font-semibold">Pay your invoice</h1>
        {valid ? (
          <>
            <p className="text-sm text-muted-foreground">
              You'll be taken to PayFast's secure checkout. The amount comes from your invoice.
            </p>
            <Button asChild className="w-full">
              <a href={href} rel="noopener">Continue to secure payment</a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Prefer to sign in? You can also pay from My Account, or by EFT using the details in your email.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            This payment link is not valid. Please sign in and pay from My Account.
          </p>
        )}
      </div>
    </main>
  );
}
