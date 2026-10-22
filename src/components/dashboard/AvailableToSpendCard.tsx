import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSpendSummary } from "@/hooks/use-spend-summary";

const R = (n: number) => `R${Math.abs(n).toFixed(2)}`;

export function AvailableToSpendCard({ clubId, memberId }: { clubId?: string | null; memberId?: string | null }) {
  const { data, isLoading, error } = useSpendSummary(clubId, memberId);
  console.log("DBGSPEND", clubId, memberId, isLoading, String(error), JSON.stringify(data));
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  if (isLoading || error || !data) return null;
  const ok = data.available > 0;
  return (
    <Card className={`p-3 text-[13px] border ${ok ? "border-primary/40" : "border-destructive/40 bg-destructive/5"}`} data-testid="available-to-spend">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          {ok ? <Wallet className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
          {ok ? "Available to spend" : "Nothing available to spend"}
        </div>
        <div className={`text-lg font-bold ${ok ? "text-primary" : "text-destructive"}`}>{ok ? R(data.available) : "R0.00"}</div>
      </div>
      <div className="mt-1 text-muted-foreground">
        Balance: {data.owing > 0 ? `${R(data.owing)} owing` : data.owing < 0 ? `${R(data.owing)} in credit` : "R0.00"}
        {data.allowance > 0 && <> · Allowed to owe: {R(data.allowance)}</>}
      </div>
      {data.bookingMin != null && (
        <div className={data.bookingShortfall > 0 ? "mt-1 text-destructive" : "mt-1 text-muted-foreground"}>
          {data.bookingShortfall > 0
            ? `Top up at least ${R(data.bookingShortfall)} to book a court (minimum ${R(data.bookingMin)}).`
            : `Court bookings OK (minimum ${R(data.bookingMin)}).`}
        </div>
      )}
      {data.barBlocked && <div className="mt-1 text-destructive">Top up {data.available < 0 ? `at least ${R(data.available)}` : "your account"} to charge bar or shop items to your account.</div>}
      {open && (
        <div className="mt-2 rounded-md bg-muted/50 p-2 text-[12px] text-muted-foreground">
          Available = what you're allowed to owe (unpaid fees on a recurring payment plus any credit the club has given you) minus what you currently owe. Money paid in advance adds to it.
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => nav("/my-account")}>Top up / statement</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(v => !v)}>How is this worked out?</Button>
      </div>
    </Card>
  );
}
