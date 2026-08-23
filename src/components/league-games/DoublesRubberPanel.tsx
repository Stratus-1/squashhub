import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Lock } from "lucide-react";
import {
  pairDisplayName,
  pairsForRound,
  rubberSlots,
  validateSelection,
  type LeagueFormatConfig,
  type SelectionEntry,
  type TeamPair,
} from "@/lib/leagues/format";

type RosterPlayer = { id: string; name: string; gender?: string | null };

/**
 * Doubles rubber selection for one team in a fixture.
 *
 * - "fixed"/"per_fixture" pairs are suggested from the season pair pool, but the
 *   captain always confirms the two REAL players who take the court.
 * - Once a rubber's result is recorded the participants are frozen (DB trigger),
 *   so the panel renders them read-only from the stored snapshot.
 */
export function DoublesRubberPanel({
  cfg,
  roundNumber,
  pairs,
  roster,
  value,
  onChange,
  lockedPositions = {},
}: {
  cfg: LeagueFormatConfig;
  roundNumber: number;
  pairs: TeamPair[];
  roster: RosterPlayer[];
  /** position -> [memberId1, memberId2] */
  value: Record<number, [string | null, string | null]>;
  onChange: (position: number, players: [string | null, string | null]) => void;
  /** position -> frozen display name, for rubbers already recorded. */
  lockedPositions?: Record<number, string>;
}) {
  const slots = rubberSlots(cfg).filter((s) => s.type === "doubles");
  const suggested = useMemo(() => pairsForRound(pairs, cfg, roundNumber), [pairs, cfg, roundNumber]);

  const nameOf = useMemo(() => {
    const m = new Map(roster.map((r) => [r.id, r.name] as const));
    return (id?: string | null) => (id ? m.get(id) ?? "Unknown" : null);
  }, [roster]);

  const genders = useMemo(
    () => Object.fromEntries(roster.map((r) => [r.id, r.gender ?? null])),
    [roster],
  );

  const entries: SelectionEntry[] = slots.map((s) => ({
    position: s.position,
    type: "doubles",
    memberIds: value[s.position] ?? [null, null],
  }));
  const problems = validateSelection({ cfg, entries, gendersByMember: genders });

  if (!slots.length) return null;

  return (
    <div className="space-y-3">
      {slots.map((slot, idx) => {
        const locked = lockedPositions[slot.position];
        const current = value[slot.position] ?? [null, null];
        const hint = suggested[idx];
        const problem = problems.find((p) => p.position === slot.position);

        return (
          <div key={slot.position} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm">{slot.label}</Label>
              {locked ? (
                <Badge variant="secondary" className="h-5 text-[10px] gap-1">
                  <Lock className="w-3 h-3" /> Result recorded
                </Badge>
              ) : hint ? (
                <Badge variant="outline" className="h-5 text-[10px]">
                  Suggested:{" "}
                  {pairDisplayName(
                    nameOf(hint.player_one_member_id),
                    nameOf(hint.player_two_member_id),
                  )}
                </Badge>
              ) : null}
            </div>

            {locked ? (
              <p className="text-sm">{locked}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {[0, 1].map((i) => (
                  <Select
                    key={i}
                    value={current[i] ?? ""}
                    onValueChange={(v) => {
                      const next: [string | null, string | null] = [current[0], current[1]];
                      next[i] = v || null;
                      onChange(slot.position, next);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Player ${i + 1}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {roster
                        .filter((r) => r.id !== current[i === 0 ? 1 : 0])
                        .map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ))}
              </div>
            )}

            {!locked && problem && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="w-3 h-3" /> {problem.message}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
