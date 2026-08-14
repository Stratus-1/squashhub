import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useSaveTournamentRules, useTournamentRules, type TournamentRules } from "@/hooks/use-tournaments";

interface Props {
  champ: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}

/** Competition rules — how the event is played, separate from governance. */
export function TournamentRulesDialog({ champ, onOpenChange }: Props) {
  const id = champ?.id ?? null;
  const { data: rules } = useTournamentRules(id);
  const save = useSaveTournamentRules(id);
  const [form, setForm] = useState<TournamentRules | null>(null);

  useEffect(() => {
    if (rules) setForm(rules);
  }, [rules]);

  const set = <K extends keyof TournamentRules>(k: K, v: TournamentRules[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const submit = async () => {
    if (!form) return;
    try {
      await save.mutateAsync(form);
      toast.success("Competition rules saved");
    } catch (e: any) {
      toast.error(e.message || "Could not save rules");
    }
  };

  return (
    <Dialog open={!!champ} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Competition rules — {champ?.name}</DialogTitle>
        </DialogHeader>

        {!form ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Scoring format</Label>
                <Select value={form.scoring_mode} onValueChange={(v) => set("scoring_mode", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard (games)</SelectItem>
                    <SelectItem value="time_capped_points">Time-capped points (Bells)</SelectItem>
                    <SelectItem value="swiss">Swiss</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Draw type</Label>
                <Select value={form.draw_type} onValueChange={(v) => set("draw_type", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round_robin">Round robin</SelectItem>
                    <SelectItem value="groups_playoffs">Groups + playoffs</SelectItem>
                    <SelectItem value="swiss">Swiss pairing</SelectItem>
                    <SelectItem value="knockout">Knockout</SelectItem>
                    <SelectItem value="monrad">Monrad / feed-in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Standard of play</Label>
                <Select value={form.standard_of_play} onValueChange={(v) => set("standard_of_play", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="a">A grade</SelectItem>
                    <SelectItem value="b">B grade</SelectItem>
                    <SelectItem value="c">C grade</SelectItem>
                    <SelectItem value="social">Social</SelectItem>
                    <SelectItem value="junior">Junior</SelectItem>
                    <SelectItem value="masters">Masters</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Round format</Label>
                <Select value={form.round_format} onValueChange={(v) => set("round_format", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_round_robin">Single round robin</SelectItem>
                    <SelectItem value="double_round_robin">Double round robin</SelectItem>
                    <SelectItem value="cross_league">Cross league</SelectItem>
                    <SelectItem value="swiss">Swiss</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Best of</Label>
                <Select
                  value={form.best_of ? String(form.best_of) : "none"}
                  onValueChange={(v) => set("best_of", v === "none" ? null : Number(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not applicable</SelectItem>
                    <SelectItem value="1">1 game</SelectItem>
                    <SelectItem value="3">Best of 3</SelectItem>
                    <SelectItem value="5">Best of 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Points per game</Label>
                <Select value={String(form.points_per_game)} onValueChange={(v) => set("points_per_game", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="11">11</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Win condition</Label>
                <Select value={form.win_condition} onValueChange={(v) => set("win_condition", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="win_by_2">Win by 2</SelectItem>
                    <SelectItem value="sudden_death">Sudden death</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Bye handling</Label>
                <Select value={form.bye_handling} onValueChange={(v) => set("bye_handling", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_match">No match</SelectItem>
                    <SelectItem value="walkover_win">Walkover win</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Handicap</Label>
                <Select value={form.handicap_mode} onValueChange={(v) => set("handicap_mode", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="league_rank">League rank</SelectItem>
                    <SelectItem value="group_order">Group order</SelectItem>
                    <SelectItem value="club_ladder">Club ladder</SelectItem>
                    <SelectItem value="ladder_history">Ladder history</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>No-show: opponent points</Label>
                <Input
                  type="number" min={0}
                  value={form.no_show_opponent_points}
                  onChange={(e) => set("no_show_opponent_points", Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label>No-show: absent player points</Label>
                <Input
                  type="number" min={0}
                  value={form.no_show_player_points}
                  onChange={(e) => set("no_show_player_points", Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Play all games</Label>
                <p className="text-xs text-muted-foreground">Matches continue to the full game count even once decided.</p>
              </div>
              <Switch checked={form.play_all_games} onCheckedChange={(v) => set("play_all_games", v)} />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Counts towards ranking points</Label>
                <p className="text-xs text-muted-foreground">Only for sanctioned events once ranking policy is agreed.</p>
              </div>
              <Switch
                checked={form.affects_ranking_points}
                onCheckedChange={(v) => set("affects_ranking_points", v)}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={submit} disabled={save.isPending || !form}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
