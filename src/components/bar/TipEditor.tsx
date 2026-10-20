import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { tipQuote, type TipChoice, type TipMode } from "@/lib/bar/tips";

export interface TipStaff { id: string; name: string }
export function TipEditor({ subtotal, choice, onChange, staff, disabled = false }: {
  subtotal: number; choice: TipChoice; onChange: (choice: TipChoice) => void; staff: TipStaff[]; disabled?: boolean;
}) {
  const id = useId();
  let quote: ReturnType<typeof tipQuote> | undefined;
  let error = "";
  try { quote = tipQuote(subtotal, choice); } catch (e) { error = e instanceof Error ? e.message : "Invalid tip"; }
  return <section aria-label="Add tip" className="space-y-2 border-t pt-2">
    <h3 className="text-sm font-semibold">Add tip</h3>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1" role="group" aria-label="Tip choice">
      {([['none', 'No tip'], ['percent', '10%'], ['amount', 'Tip amount'], ['total', 'Total to pay']] as [TipMode, string][]).map(([mode, label]) =>
        <Button key={mode} size="sm" type="button" variant={choice.mode === mode ? "default" : "outline"} aria-pressed={choice.mode === mode} disabled={disabled} onClick={() => onChange({ ...choice, mode, value: "" })}>{label}</Button>)}
    </div>
    {choice.mode !== "none" && <div className="grid sm:grid-cols-2 gap-2">
      <div className="space-y-1"><Label htmlFor={`${id}-staff`}>Serving person</Label>
        <Select value={choice.staffId} disabled={disabled} onValueChange={staffId => onChange({ ...choice, staffId })}>
          <SelectTrigger id={`${id}-staff`} aria-label="Serving person"><SelectValue placeholder="Choose staff" /></SelectTrigger>
          <SelectContent>{staff.map(person => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {(choice.mode === "amount" || choice.mode === "total") && <div className="space-y-1">
        <Label htmlFor={`${id}-amount`}>{choice.mode === "total" ? "Total to pay (R)" : "Tip amount (R)"}</Label>
        <Input id={`${id}-amount`} inputMode="decimal" value={choice.value} disabled={disabled} onChange={e => onChange({ ...choice, value: e.target.value })} />
      </div>}
    </div>}
    {quote && <dl className="grid grid-cols-3 gap-2 text-xs tabular-nums">
      <div><dt className="text-muted-foreground">Sale</dt><dd>R{quote.subtotal.toFixed(2)}</dd></div>
      <div><dt className="text-muted-foreground">Tip</dt><dd>R{quote.tip.toFixed(2)}</dd></div>
      <div><dt className="text-muted-foreground">Total to pay</dt><dd className="font-semibold">R{quote.total.toFixed(2)}</dd></div>
    </dl>}
    {error && choice.mode !== "none" && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </section>;
}