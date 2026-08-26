import { MERGE_FIELDS } from "@/lib/comms/merge-fields";

/** Shared merge-field palette — identical for every channel. */
export function CommsMergeFieldChips({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {MERGE_FIELDS.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onInsert(`{{${f.key}}}`)}
          className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted hover:bg-primary hover:text-primary-foreground transition-colors"
          title={`Insert {{${f.key}}}`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
