import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  RESULT_NOTIFY_CHANNELS,
  type ResultNotifyChannel,
  type ResultNotifyScope,
} from "@/lib/tournaments/result-notify";

type Props = {
  scope: ResultNotifyScope;
  channels: ResultNotifyChannel[];
  includeForfeits: boolean;
  onScope: (s: ResultNotifyScope) => void;
  onChannels: (c: ResultNotifyChannel[]) => void;
  onIncludeForfeits: (v: boolean) => void;
};

/** Post-match result messages — separate from invites, reminders and announcements. */
export function ResultNotifySettingsCard(p: Props) {
  const off = p.scope === "never";
  const toggle = (c: ResultNotifyChannel, on: boolean) =>
    p.onChannels(on ? Array.from(new Set([...p.channels, c])) : p.channels.filter((x) => x !== c));

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Result messages after a match</CardTitle>
        <p className="text-xs text-muted-foreground">
          Sent to the winners and losers (both partners in doubles) only once a real result is saved.
          Withdrawals, pull-outs, rebuilds and schedule changes never send these.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <Label className="text-xs">When</Label>
          <RadioGroup value={p.scope} onValueChange={(v) => p.onScope(v as ResultNotifyScope)} className="mt-1 gap-1">
            {([
              ["all", "After every completed match"],
              ["playoffs", "Playoff / knockout matches only (not pool, round robin or Swiss rounds)"],
              ["never", "Never"],
            ] as const).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value={v} /> <span>{l}</span>
              </label>
            ))}
          </RadioGroup>
        </div>
        <div className={off ? "opacity-50 pointer-events-none" : ""}>
          <Label className="text-xs">Send by</Label>
          <div className="mt-1 flex flex-wrap gap-4">
            {RESULT_NOTIFY_CHANNELS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={p.channels.includes(key)} onCheckedChange={(v) => toggle(key, !!v)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {!off && p.channels.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">No channel ticked — no result messages will be sent.</p>
          )}
          <label className="mt-3 flex items-center gap-2 cursor-pointer">
            <Checkbox checked={p.includeForfeits} onCheckedChange={(v) => p.onIncludeForfeits(!!v)} />
            <span className="text-xs">Also send for walkovers / forfeits (off by default)</span>
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            WhatsApp and SMS follow the club's messaging settings and are charged as usual.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
