import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StructureRowsEditor } from "./StructureRowsEditor";
import type { StepAnswers } from "./StepByStepBuilder";

/** Same canonical draft, table-only review; never exposes the retired canvas. */
export function CardStructureReview({ answers, onSave, onDirtyChange, onEdit, dirty }: { answers: StepAnswers; onSave: (a: StepAnswers) => void; onDirtyChange: (d: boolean) => void; onEdit: () => void; dirty: boolean }) {
  return <div className="space-y-3" data-testid="card-structure-review">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Structure review</h3><Button variant="outline" size="sm" disabled={dirty} onClick={onEdit}><Pencil className="mr-1 h-3 w-3" />Edit names & match rules</Button></div>
    <StructureRowsEditor answers={answers} onSave={onSave} onDirtyChange={onDirtyChange} visualEnabled={false} />
  </div>;
}