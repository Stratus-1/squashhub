import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Banknote, CreditCard, UserCheck } from "lucide-react";

export type CounterPayMethod = "cash" | "card" | "account";

export const PAY_METHOD_STYLE: Record<CounterPayMethod, { label: string; className: string; Icon: typeof Banknote }> = {
  cash: { label: "CASH", className: "bg-success text-primary-foreground hover:bg-success/90", Icon: Banknote },
  card: { label: "CARD (card machine)", className: "bg-primary text-primary-foreground hover:bg-primary/90", Icon: CreditCard },
  account: { label: "MEMBER ACCOUNT", className: "bg-warning text-primary-foreground hover:bg-warning/90", Icon: UserCheck },
};

/** Big, unmistakable check before a counter payment method is saved. */
export function PaymentMethodConfirm({ method, amount, name, onConfirm, onCancel }: {
  method: CounterPayMethod | null; amount: string; name?: string | null;
  onConfirm: () => void; onCancel: () => void;
}) {
  const s = method ? PAY_METHOD_STYLE[method] : null;
  return (
    <Dialog open={!!method} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        {s && (
          <>
            <DialogHeader>
              <DialogTitle className="text-center">Is this right?</DialogTitle>
              <DialogDescription className="text-center text-xs">Check the payment method before saving.</DialogDescription>
            </DialogHeader>
            <div className={`rounded-lg p-4 text-center space-y-1 ${s.className}`}>
              <s.Icon className="w-10 h-10 mx-auto" />
              <div className="text-xl font-bold tracking-wide">{s.label}</div>
              <div className="text-2xl font-bold">{amount}</div>
              {name && <div className="text-sm font-medium">{name}</div>}
            </div>
            {method === "card" && <p className="text-xs text-center text-muted-foreground">Only confirm if the machine showed APPROVED.</p>}
            {method === "account" && <p className="text-xs text-center text-muted-foreground">This goes onto the member's account — no money taken now.</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" onClick={onCancel}>No, go back</Button>
              <Button className={`h-12 font-bold ${s.className}`} onClick={onConfirm}>Yes, {s.label.split(" ")[0].toLowerCase()}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
