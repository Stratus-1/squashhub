import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHostClubs } from "@/hooks/use-tournaments";
import { useSetTournamentBeta, useTournamentBetaClubs } from "@/hooks/use-tournament-beta";

/** Super Admin: choose which clubs see the "Tournament Beta" tile. No code change needed to add clubs. */
export function TournamentBetaClubsCard() {
  const { data: betaClubs = [] } = useTournamentBetaClubs();
  const { data: clubs = [] } = useHostClubs();
  const setBeta = useSetTournamentBeta();
  const [pick, setPick] = useState("");
  const onIds = new Set(betaClubs.map((b) => b.club_id));
  const run = (clubId: string, on: boolean) =>
    setBeta.mutate({ clubId, on }, {
      onSuccess: () => { toast.success(on ? "Tournament Beta switched on" : "Tournament Beta switched off"); setPick(""); },
      onError: (e: any) => toast.error(e.message),
    });
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
      <div className="text-sm font-semibold text-white">Clubs testing Tournament Beta</div>
      <p className="text-[11px] text-white/55">These clubs get a separate "Tournament Beta" tile in Club Admin, next to their normal Tournaments tile. Switching off hides the tile only — nothing is deleted.</p>
      <div className="flex flex-wrap gap-2">
        {betaClubs.length === 0 && <span className="text-xs text-white/50">No clubs yet.</span>}
        {betaClubs.map((b) => (
          <span key={b.club_id} className="flex items-center gap-1 rounded-full border border-amber-300/40 px-2 py-0.5 text-xs text-amber-100">
            {b.clubs?.name ?? b.club_id}
            <button aria-label="Switch off" onClick={() => run(b.club_id, false)}><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <select className="h-8 flex-1 rounded-md bg-white/5 border border-white/15 text-white text-xs px-2" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Add a club…</option>
          {clubs.filter((c) => !onIds.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button size="sm" disabled={!pick || setBeta.isPending} onClick={() => run(pick, true)}>Switch on</Button>
      </div>
    </div>
  );
}
