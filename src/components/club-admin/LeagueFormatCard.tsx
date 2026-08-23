import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useAssociationRules, useUpdateAssociationRules } from "@/hooks/use-association-rules";
import {
  DISCIPLINE_LABELS,
  type CompetitionCategory,
  type CompetitionDiscipline,
} from "@/lib/leagues/category";
import { resolveFormat, rubberSlots, stepOneFormatQuestions } from "@/lib/leagues/format";

/**
 * Adaptive league format settings. Discipline is chosen first (in the parent
 * dialog); this card then asks ONLY the questions that discipline needs.
 * Singles keeps its existing behaviour — one singles rubber per team position.
 */
export function LeagueFormatCard({
  associationId,
  discipline,
  category,
  requireMixedPair,
}: {
  associationId: string;
  discipline: CompetitionDiscipline;
  category: CompetitionCategory | "";
  requireMixedPair: boolean;
}) {
  const { data: rules } = useAssociationRules(associationId);
  const update = useUpdateAssociationRules();
  const q = stepOneFormatQuestions(discipline);

  const resolved = resolveFormat(
    { discipline, category: category || null },
    { ...(rules as any), require_mixed_pair: requireMixedPair },
  );

  const [singles, setSingles] = useState(resolved.singlesRubbers);
  const [doubles, setDoubles] = useState(resolved.doublesRubbers);
  const [policy, setPolicy] = useState(resolved.pairingPolicy);
  const [dual, setDual] = useState(resolved.allowDualParticipation);

  useEffect(() => {
    setSingles(resolved.singlesRubbers);
    setDoubles(resolved.doublesRubbers);
    setPolicy(resolved.pairingPolicy);
    setDual(resolved.allowDualParticipation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules?.id, discipline]);

  const preview = rubberSlots({ ...resolved, singlesRubbers: singles, doublesRubbers: doubles });

  const save = () =>
    update.mutate({
      associationId,
      patch: {
        pairing_policy: q.askPairingPolicy ? policy : "fixed",
        allow_dual_participation: q.askDualParticipation ? dual : false,
      } as any,
    });

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Format — {DISCIPLINE_LABELS[discipline]}</Label>
        <Button size="sm" variant="outline" onClick={save} disabled={update.isPending}>
          {update.isPending ? "Saving..." : "Save format"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {q.askSinglesRubbers && (
          <div className="space-y-1">
            <Label className="text-xs">Singles rubbers per fixture</Label>
            <Input
              type="number"
              min={0}
              max={20}
              value={singles}
              onChange={(e) => setSingles(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        )}
        {q.askDoublesRubbers && (
          <div className="space-y-1">
            <Label className="text-xs">Doubles rubbers per fixture</Label>
            <Input
              type="number"
              min={0}
              max={20}
              value={doubles}
              onChange={(e) => setDoubles(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        )}
      </div>

      {q.askPairingPolicy && (
        <div className="space-y-1">
          <Label className="text-xs">Pairing policy</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              variant={policy === "fixed" ? "default" : "outline"}
              onClick={() => setPolicy("fixed")}
            >
              Fixed for the season
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              variant={policy === "per_fixture" ? "default" : "outline"}
              onClick={() => setPolicy("per_fixture")}
            >
              Chosen per fixture
            </Button>
          </div>
        </div>
      )}

      {q.askDualParticipation && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={dual} onCheckedChange={(v) => setDual(!!v)} />
          Allow a player to appear in both a singles and a doubles rubber of the same fixture
        </label>
      )}

      <div className="flex flex-wrap gap-1">
        {preview.map((s) => (
          <Badge key={s.position} variant="outline" className="text-[10px] h-5">
            {s.position}. {s.label}
          </Badge>
        ))}
        {!preview.length && (
          <span className="text-xs text-muted-foreground">No rubbers configured yet.</span>
        )}
      </div>
    </div>
  );
}
