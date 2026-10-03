/**
 * Standings "What's next" shortcut for knockout categories (admins only).
 * Reads the same state machine as Manage Tournament's Knockout rounds panel and only LINKS there —
 * pairings are reviewed, edited and confirmed in that one panel, never here.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fromExt } from "@/lib/supabase-ext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchKoRoundsData, koDivisionActions } from "./StepKnockoutRoundsPanel";

export function KnockoutNextActions({ champId }: { champId: string }) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["step-ko-rounds-summary", champId],
    refetchInterval: 30000,
    queryFn: async () => {
      const [d, { data: t }] = await Promise.all([
        fetchKoRoundsData(champId),
        fromExt("tournaments").select("beta_lifecycle").eq("id", champId).maybeSingle(),
      ]);
      return { d, plan: (t as any)?.beta_lifecycle?.format_plan ?? null };
    },
  });
  if (!data || data.d.divs.length === 0) return null;
  const rows = koDivisionActions(data.d, data.plan, new Date().toISOString().slice(0, 10));
  const pending = rows.filter((r) => r.action.kind === "approve");
  // Keep the current club context (e.g. ?club=riverside) so Manage opens in the tournament's own club.
  const open = (group: number) => {
    const q = new URLSearchParams({ tab: "champs", manage: champId, ko: String(group) });
    const club = new URLSearchParams(window.location.search).get("club");
    if (club) q.set("club", club);
    navigate(`/club-admin?${q.toString()}`);
  };
  return (
    <div className="rounded-lg border border-primary/40 p-3 space-y-2 text-sm" data-testid="ko-next-actions">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">What's next · Knockout rounds</span>
        {pending.length > 0 && <Badge variant="outline">{pending.length} round{pending.length === 1 ? "" : "s"} to approve</Badge>}
        {pending.length > 0 && <Button size="sm" className="ml-auto" onClick={() => open(pending[0].group)}>{(pending[0].action as any).formal ? `Review & approve ${(pending[0].action as any).label}` : "Review & approve next round"}</Button>}
      </div>
      <ul className="space-y-1 text-xs">
        {rows.map((r) => {
          const a = r.action;
          return (
            <li key={r.unit} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.unit}:</span>
              {a.kind === "approve" && <>
                <span>{a.formal ? `${a.qualified} qualified — ${a.label} proposal ready` : `${a.label} ready for approval`} — {a.count} match{a.count === 1 ? "" : "es"}{a.playBy ? `, ${a.formal ? "on" : "play by"} ${a.playBy}` : ""}</span>
                <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => open(r.group)}>{a.formal ? `Review & approve ${a.label}` : "Review"}</Button>
              </>}
              {a.kind === "results_outstanding" && <span className="text-muted-foreground">Round {a.round} results outstanding — {a.open} fixture{a.open === 1 ? "" : "s"} still to finish</span>}
              {a.kind === "waiting_for_stage" && <>
                <span className="text-muted-foreground">{a.qualified} qualified · {a.fieldReady ? `${a.stage} field ready` : `No elimination needed before ${a.stage}`} — {a.needsOrganiser ? `${a.stage} waits for your confirmation` : `waiting for ${a.stage} stage`}{a.date ? ` (${a.date})` : ""}</span>
                {a.needsOrganiser && <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => open(r.group)}>Open {a.stage}</Button>}
              </>}
              {a.kind === "idle" && <span className="text-muted-foreground">No action needed — everyone stays active this round</span>}
              {a.kind === "decided" && <span className="text-muted-foreground">Decided</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
