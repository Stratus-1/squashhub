import type { ReturnTypeOfPickPreview } from "./pick-pool-preview-types";

export function PickPoolPreview({ label, names, preview, memberName, method }: {
  label: string; names?: string[]; preview: ReturnTypeOfPickPreview;
  memberName: (id: string) => string; method: string;
}) {
  return <section className="space-y-2" aria-label={`${label} planned pools`}>
    <h3 className="text-sm font-semibold">{label} · {preview.pools.length} pools · {method}</h3>
    {preview.issue && <p className="text-xs text-destructive">Pool placement pending: {preview.issue}. Complete the pairs and ranking setup before generating.</p>}
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {preview.pools.map((pool, i) => <div key={i} className="min-w-0 rounded-md border border-border" data-testid={`planned-pool-${i + 1}`}>
        <h4 className="border-b border-border bg-muted/60 px-2 py-1.5 text-xs font-semibold">{names?.[i] || `Pool ${i + 1}`} · {pool.length} {pool.some((u) => u.partner) ? "pairs" : "entries"}</h4>
        <ol className="space-y-1 p-2 text-xs">{pool.map((u, j) => <li key={u.member} className="break-words">{j + 1}. {memberName(u.member)}{u.partner ? ` + ${memberName(u.partner)}` : ""}</li>)}</ol>
      </div>)}
    </div>
  </section>;
}