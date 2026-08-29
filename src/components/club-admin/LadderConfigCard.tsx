import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Loader2 } from "lucide-react";
import { useLadderConfig, useUpdateLadderConfig } from "@/hooks/use-ladder-config";
import { describeLadderRule, type LadderConfig } from "@/lib/ladder/eligibility";

interface Props {
  clubId: string;
}

/** Club admin controls for the ladder format and challenge rules. */
export function LadderConfigCard({ clubId }: Props) {
  const { data: config, isLoading } = useLadderConfig(clubId);
  const update = useUpdateLadderConfig(clubId);
  const [draft, setDraft] = useState<LadderConfig | null>(null);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  if (isLoading || !draft) {
    return (
      <Card className="p-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading ladder settings…
      </Card>
    );
  }

  const set = <K extends keyof LadderConfig>(key: K, value: LadderConfig[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  const numberField = (
    label: string,
    key: keyof LadderConfig,
    hint: string,
    min = 0,
    max = 365,
  ) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        className="h-9"
        value={Number(draft[key] as number)}
        onChange={(e) =>
          set(key as any, Math.max(min, Math.min(max, Number(e.target.value) || 0)) as any)
        }
      />
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">Ladder & Challenge Rules</h3>
      </div>
      <p className="text-xs text-muted-foreground">{describeLadderRule(draft)}</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Ladder format</Label>
          <Select
            value={draft.format}
            onValueChange={(v) => {
              const format = v as LadderConfig["format"];
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      format,
                      // Pyramid default: winner takes the spot, everyone shifts down one (no swap).
                      ...(format === "pyramid" ? { movement_policy: "insert" as const } : {}),
                    }
                  : d,
              );
            }}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Positional (list)</SelectItem>
              <SelectItem value="pyramid">Pyramid</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            Pyramid rows are 1, 2, 3, 4 … players wide.
          </p>
        </div>

        {draft.format === "standard" &&
          numberField("Positions up", "challenge_levels_up", "How far up a player may challenge.", 1, 50)}

        <div className="space-y-1">
          <Label className="text-xs">When challenger wins</Label>
          <Select
            value={draft.movement_policy}
            onValueChange={(v) => set("movement_policy", v as LadderConfig["movement_policy"])}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="swap">Swap the two positions</SelectItem>
              <SelectItem value="insert">Take the spot, others move down</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">Applies to accepted challenge results.</p>
        </div>

        {numberField("Accept within (hours)", "accept_deadline_hours", "Time to accept a challenge.", 1, 720)}
        {numberField("Play within (days)", "complete_deadline_days", "Time to play an accepted challenge.", 1, 120)}
        {numberField("Max open (as challenger)", "max_active_outgoing", "0 = unlimited.", 0, 10)}
        {numberField("Max open (as opponent)", "max_active_incoming", "0 = unlimited.", 0, 10)}
        {numberField("Rematch cooldown (days)", "rematch_cooldown_days", "0 = no cooldown.", 0, 365)}
      </div>

      <div className="flex items-center gap-3 rounded-md border p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Challenges affect club ranking points</p>
          <p className="text-[11px] text-muted-foreground">
            Off by default — ladder position and ranking points stay independent.
          </p>
        </div>
        <Switch
          checked={draft.affects_club_ranking}
          onCheckedChange={(v) => set("affects_club_ranking", v)}
        />
      </div>

      {draft.affects_club_ranking && (
        <div className="rounded-md border p-3 space-y-3">
          <p className="text-sm font-medium">Ranking sync</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">How challenges award points</Label>
              <Select
                value={draft.ranking_sync_mode}
                onValueChange={(v) => set("ranking_sync_mode", v as LadderConfig["ranking_sync_mode"])}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="formula">Club points formula</SelectItem>
                  <SelectItem value="mirror">Mirror the ladder</SelectItem>
                  <SelectItem value="none">No points from challenges</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {draft.ranking_sync_mode === "mirror"
                  ? "Winner's points are lifted just above the beaten player, so points follow the ladder exactly."
                  : draft.ranking_sync_mode === "none"
                    ? "Challenges move the ladder only."
                    : "Uses the club's base / upset / floor formula from Ranking Points."}
              </p>
            </div>

            {draft.ranking_sync_mode === "mirror" &&
              numberField("Mirror margin (points)", "ranking_mirror_margin", "Points added above the beaten player.", 0, 100)}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-md border p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Apply results automatically</p>
          <p className="text-[11px] text-muted-foreground">
            Single setting for approvals: on = ladder moves and ranking points post straight away.
            Off = both wait for admin approval in "Pending ladder moves" and "Pending ranking points".
          </p>
        </div>
        <Switch
          checked={draft.ladder_auto_apply}
          onCheckedChange={(v) => {
            set("ladder_auto_apply", v);
            set("ranking_auto_approve", v);
          }}
        />
      </div>

      <div className="rounded-md border p-3 space-y-3">
        <div>
          <p className="text-sm font-medium">Results that move the ladder</p>
          <p className="text-[11px] text-muted-foreground">
            Besides challenges, club-mate results from these competitions can move the ladder — only when the
            lower-ranked player wins, and only between two ranked members of the same ladder group.
          </p>
        </div>



        {([
          {
            key: "ladder_from_leagues",
            move: "league_movement_policy",
            title: "League games",
            hint: "Club-mate rubbers only. Games against another club never move your ladder.",
          },
          {
            key: "ladder_from_tournaments",
            move: "tournament_movement_policy",
            title: "Championships & tournaments",
            hint: "Singles results only. Each event can still be switched off in its own settings.",
          },
        ] as const).map((row) => (
          <div key={row.key} className="rounded-md border p-2.5 space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">{row.title}</p>
                <p className="text-[10px] text-muted-foreground">{row.hint}</p>
              </div>
              <Switch
                checked={draft[row.key]}
                onCheckedChange={(v) => set(row.key, v)}
              />
            </div>
            {draft[row.key] && (
              <div className="space-y-1">
                <Label className="text-xs">When the lower-ranked player wins</Label>
                <Select
                  value={draft[row.move] ?? "inherit"}
                  onValueChange={(v) =>
                    set(row.move, (v === "inherit" ? null : v) as LadderConfig["league_movement_policy"])
                  }
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">
                      Same as challenges ({draft.movement_policy === "swap" ? "swap" : "take the spot"})
                    </SelectItem>
                    <SelectItem value="swap">Swap the two positions</SelectItem>
                    <SelectItem value="insert">Take the spot, others move down</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-md border p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Challenges open</p>
          <p className="text-[11px] text-muted-foreground">
            Turn off to pause new challenges without losing the ladder.
          </p>
        </div>
        <Switch checked={draft.is_active} onCheckedChange={(v) => set("is_active", v)} />
      </div>


      <div className="flex justify-end gap-2">
        {dirty && (
          <Button variant="ghost" size="sm" onClick={() => config && setDraft(config)}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          disabled={!dirty || update.isPending}
          onClick={() => {
            const { id, club_id, ...patch } = draft;
            update.mutate(patch);
          }}
        >
          {update.isPending ? "Saving…" : "Save rules"}
        </Button>
      </div>
    </Card>
  );
}
