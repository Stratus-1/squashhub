import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export function DrawNoticeEditor({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <div className="space-y-2">
    <label className="block space-y-1"><span className="font-medium">Draw notification wording</span>
      <Textarea aria-label="Draw notification wording" value={value} onChange={(e) => onChange(e.target.value)} maxLength={2000} rows={4} disabled={disabled} />
    </label>
    <label className="block space-y-1"><span className="text-muted-foreground">Tournament button</span><Input readOnly value="View tournament & score match" /></label>
  </div>;
}