import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { rrFinishIssues, rrFinishSplit, type RrFinish } from "@/lib/tournaments/swiss-rr-finish";
import { RIVERSIDE_CLUB_ID } from "@/lib/tournaments/swiss-riverside-aabb-charts";

export function SwissRrFinishControls({ clubId, label, rounds, entrants, value, disabled, onChange }: {
  clubId: string; label: string; rounds: number; entrants: number; value?: RrFinish | null;
  disabled?: boolean; onChange: (value: RrFinish | null) => void;
}) {
  if (clubId !== RIVERSIDE_CLUB_ID || (rounds !== 5 && !value?.enabled)) return null;
  const groups = value?.groups ?? Math.max(1, Math.floor(entrants / 4) - (entrants % 4 === 1 ? 1 : 0));
  const split = rrFinishSplit(entrants, groups);
  const issues = value?.enabled ? rrFinishIssues(entrants, rounds, groups) : [];
  return <div className="space-y-2 border-t border-border pt-2" data-testid={`rr-finish-${label}`}>
    <label className="flex items-center justify-between gap-2 text-xs font-medium">
      Round robin in final 3 rounds
      <Switch aria-label={`${label} round robin in final 3 rounds`} checked={!!value?.enabled} disabled={disabled || rounds !== 5}
        onCheckedChange={(enabled) => onChange(enabled ? { enabled: true, groups } : null)} />
    </label>
    {value?.enabled && <>
      <label className="flex items-center gap-2 text-xs">Groups of 4<Input className="h-8 w-20" type="number" min={1} max={Math.max(1, Math.floor(entrants / 4))}
        aria-label={`${label} round robin groups`} disabled={disabled} value={groups}
        onChange={(e) => onChange({ enabled: true, groups: Number(e.target.value) })} /></label>
      <p className="text-xs text-muted-foreground">Rounds 1–2 Swiss · pairing slots lock after Round 2 · groups {split.groupRanges.map(([lo, hi]) => `${lo}–${hi}`).join(", ")} play round robin in Rounds 3–5.{split.remainder ? ` Slots ${split.remainder[0]}–${split.remainder[1]} remain Swiss.` : ""}</p>
      {issues.map((issue) => <p key={issue} role="alert" className="text-xs text-destructive">{issue}</p>)}
    </>}
  </div>;
}