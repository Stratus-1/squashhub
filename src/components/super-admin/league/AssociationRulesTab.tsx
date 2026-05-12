import { useEffect, useState } from "react";
import { useAssociationRules, useUpdateAssociationRules, type LeagueRules } from "@/hooks/use-association-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";

interface Props {
  associationId: string;
}

const DEFAULTS: Partial<LeagueRules> = {
  points_per_game: 11,
  win_by: 2,
  games_format: "best_of_5",
  tiebreak_at: 10,
  let_stroke_enabled: true,
  max_timeouts_per_player: 1,
  marker_required: true,
  marker_must_be_qualified: true,
  forfeit_allowed: true,
  tiebreak_method: "games_then_points_then_share",
  bonus_points_mode: "per_match",
  bonus_points_value: 1,
  share_bonus_on_tie: true,
  notes: "",
  enforce_sub_rules: true,
  max_position_movement_per_week: null,
  sub_direction: "any",
  cross_gender_subs_allowed: false,
  original_player_bonus_enabled: false,
  original_player_bonus_value: 1,
  team_win_bonus_enabled: false,
  team_win_bonus_value: 2,
};

export default function AssociationRulesTab({ associationId }: Props) {
  const { data, isLoading } = useAssociationRules(associationId);
  const update = useUpdateAssociationRules();
  const [form, setForm] = useState<Partial<LeagueRules>>(DEFAULTS);

  useEffect(() => {
    if (data) setForm(data);
    else setForm(DEFAULTS);
  }, [data]);

  const set = <K extends keyof LeagueRules>(k: K, v: LeagueRules[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading rules…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Scoring</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Points per game</Label>
            <Input type="number" min={5} max={21}
              value={form.points_per_game ?? 11}
              onChange={(e) => set("points_per_game", Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">Standard: 11 (PAR) or 15 (HiHo)</p>
          </div>
          <div className="space-y-1.5">
            <Label>Win by</Label>
            <Input type="number" min={1} max={5}
              value={form.win_by ?? 2}
              onChange={(e) => set("win_by", Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">Lead required to close a game</p>
          </div>
          <div className="space-y-1.5">
            <Label>Match format</Label>
            <Select value={form.games_format ?? "best_of_5"}
              onValueChange={(v) => set("games_format", v as LeagueRules["games_format"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="best_of_3">Best of 3</SelectItem>
                <SelectItem value="best_of_5">Best of 5</SelectItem>
                <SelectItem value="best_of_7">Best of 7</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tiebreak at</Label>
            <Input type="number" min={5} max={20}
              value={form.tiebreak_at ?? 10}
              onChange={(e) => set("tiebreak_at", Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">e.g. 10–10 → win by 2</p>
          </div>
          <div className="space-y-1.5">
            <Label>Max timeouts / player</Label>
            <Input type="number" min={0} max={5}
              value={form.max_timeouts_per_player ?? 1}
              onChange={(e) => set("max_timeouts_per_player", Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Match points & tiebreak</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Tiebreak method</Label>
            <Select
              value={form.tiebreak_method ?? "games_then_points_then_share"}
              onValueChange={(v) => set("tiebreak_method", v as LeagueRules["tiebreak_method"])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="games_then_points_then_share">
                  Games won → match points → share bonus if still tied
                </SelectItem>
                <SelectItem value="games_only">Games won only</SelectItem>
                <SelectItem value="points_only">Total points only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How the winner of a tied team match is determined.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Bonus points</Label>
            <Select
              value={form.bonus_points_mode ?? "per_match"}
              onValueChange={(v) => set("bonus_points_mode", v as LeagueRules["bonus_points_mode"])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No bonus points</SelectItem>
                <SelectItem value="per_match">Per match won</SelectItem>
                <SelectItem value="per_game_won">Per game won</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Bonus points value</Label>
            <Input
              type="number" min={0} max={10}
              value={form.bonus_points_value ?? 1}
              onChange={(e) => set("bonus_points_value", Number(e.target.value))}
              disabled={(form.bonus_points_mode ?? "per_match") === "none"}
            />
            <p className="text-xs text-muted-foreground">
              Points awarded per {form.bonus_points_mode === "per_game_won" ? "game won" : "match won"}.
            </p>
          </div>
          <div className="md:col-span-2">
            <ToggleRow
              label="Share bonus when tied"
              hint="If tiebreaks can't separate teams, split bonus points evenly"
              value={!!form.share_bonus_on_tie}
              onChange={(v) => set("share_bonus_on_tie", v)}
            />
          </div>

          <div className="md:col-span-2 border-t pt-3 mt-1">
            <ToggleRow
              label="Team-win bonus (overall fixture)"
              hint="When on, the team that wins the overall fixture for the night earns extra bonus points (in addition to per-match / per-game bonuses)."
              value={!!form.team_win_bonus_enabled}
              onChange={(v) => set("team_win_bonus_enabled", v)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Team-win bonus value</Label>
            <Input
              type="number" min={0} max={10}
              value={form.team_win_bonus_value ?? 2}
              onChange={(e) => set("team_win_bonus_value", Number(e.target.value))}
              disabled={!form.team_win_bonus_enabled}
            />
            <p className="text-xs text-muted-foreground">
              Points awarded to the overall winner of the fixture (e.g. NIL: 2).
            </p>
          </div>

          <div className="md:col-span-2 border-t pt-3 mt-1">
            <ToggleRow
              label="Original-player bonus (NIL rule)"
              hint="When on, the team earns extra points for each originally-allocated player who actually plays. Reserves/subs do NOT earn this bonus."
              value={!!form.original_player_bonus_enabled}
              onChange={(v) => set("original_player_bonus_enabled", v)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Original-player bonus value</Label>
            <Input
              type="number" min={0} max={10}
              value={form.original_player_bonus_value ?? 1}
              onChange={(e) => set("original_player_bonus_value", Number(e.target.value))}
              disabled={!form.original_player_bonus_enabled}
            />
            <p className="text-xs text-muted-foreground">
              Points added to the team total per original player who appears in the lineup.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Marker & officiating</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow label="Let / stroke calls enabled" hint="Show let & stroke buttons in marker"
            value={!!form.let_stroke_enabled} onChange={(v) => set("let_stroke_enabled", v)} />
          <ToggleRow label="Marker required" hint="Block submission if no marker is selected"
            value={!!form.marker_required} onChange={(v) => set("marker_required", v)} />
          <ToggleRow label="Marker must be qualified" hint="Filter marker dropdown to qualified members only"
            value={!!form.marker_must_be_qualified} onChange={(v) => set("marker_must_be_qualified", v)} />
          <ToggleRow label="Forfeit / walkover allowed" hint="Show forfeit option in scorecard"
            value={!!form.forfeit_allowed} onChange={(v) => set("forfeit_allowed", v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Notes for marker</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea rows={3}
            placeholder="Free-text shown to the marker as an info banner"
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Player substitution rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Enforce substitution rules"
            hint="Master switch — when off, no rules below are applied."
            value={!!form.enforce_sub_rules}
            onChange={(v) => set("enforce_sub_rules", v)}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Max league movement per week</Label>
              <Input
                type="number" min={0} max={20}
                value={form.max_position_movement_per_week ?? ""}
                placeholder="Unlimited"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  set("max_position_movement_per_week", v === "" ? null : Number(v));
                }}
                disabled={!form.enforce_sub_rules}
              />
              <p className="text-xs text-muted-foreground">
                NSA-style cap measured in <strong>overall slots</strong> (league × 4 + position).
                e.g. <em>2</em> means a player can move from L2#3 → L3#1 (Δ=2) but not L2#3 → L4#1 (Δ=6).
                Leave blank for unlimited.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Sub direction</Label>
              <Select
                value={form.sub_direction ?? "any"}
                onValueChange={(v) => set("sub_direction", v as LeagueRules["sub_direction"])}
                disabled={!form.enforce_sub_rules}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any direction</SelectItem>
                  <SelectItem value="lower_or_equal_only">
                    Lower or equal only (NIL — no subs from stronger leagues)
                  </SelectItem>
                  <SelectItem value="higher_or_equal_only">
                    Higher or equal only (subs must come from stronger leagues)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Restricts which leagues a sub may be pulled from, relative to the target team's league.
              </p>
            </div>
          </div>
          <ToggleRow
            label="Allow cross-gender subs"
            hint="When off, men cannot sub into a Ladies team and vice versa (unless the target league is Mixed)."
            value={!!form.cross_gender_subs_allowed}
            onChange={(v) => set("cross_gender_subs_allowed", v)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          disabled={update.isPending}
          onClick={() => update.mutate({ associationId, patch: form })}
        >
          {update.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save rules
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div>
        <Label className="text-sm">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
