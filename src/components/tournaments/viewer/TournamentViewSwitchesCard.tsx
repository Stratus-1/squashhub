import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useHostClubs } from "@/hooks/use-tournaments";
import {
  TOURNAMENT_VIEW_FEATURES, useSetClubBetaFeature, useTournamentViewFeatureRows, type TournamentViewFeature,
} from "@/hooks/use-club-beta-feature";

/** Super Admin: per-club switches for the tournament view pilot. Switching off deletes nothing. */
export function TournamentViewSwitchesCard() {
  const { data: rows = [] } = useTournamentViewFeatureRows();
  const { data: clubs = [] } = useHostClubs();
  const set = useSetClubBetaFeature();
  const [club, setClub] = useState("");
  const on = (f: TournamentViewFeature) => rows.some((r) => r.club_id === club && r.feature === f);
  const toggle = (f: TournamentViewFeature) =>
    set.mutate({ clubId: club, feature: f, on: !on(f) }, {
      onSuccess: () => toast.success(`${TOURNAMENT_VIEW_FEATURES[f]} ${on(f) ? "switched off" : "switched on"}`),
      onError: (e: any) => toast.error(e.message),
    });
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
      <div className="text-sm font-semibold text-white">Tournament views pilot switches</div>
      <p className="text-[11px] text-white/55">Admins only. Each view also needs the interactive viewer switch. Nothing is switched on automatically.</p>
      <select aria-label="Club" className="smart-builder-select h-8 w-full rounded-md bg-white/5 border border-white/15 text-white text-xs px-2" value={club} onChange={(e) => setClub(e.target.value)}>
        <option value="">Choose a club…</option>
        {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {club && (
        <div className="grid gap-1 sm:grid-cols-2">
          {(Object.keys(TOURNAMENT_VIEW_FEATURES) as TournamentViewFeature[]).map((f) => (
            <div key={f} className="flex items-center justify-between gap-2 rounded-md border border-white/10 px-2 py-1">
              <span className="text-xs text-white/80">{TOURNAMENT_VIEW_FEATURES[f]}</span>
              <Button size="sm" variant={on(f) ? "default" : "outline"} className="h-7" disabled={set.isPending} onClick={() => toggle(f)}>{on(f) ? "On" : "Off"}</Button>
            </div>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <div className="text-[11px] text-white/50">Currently on: {rows.map((r) => `${r.clubs?.name ?? r.club_id} · ${TOURNAMENT_VIEW_FEATURES[r.feature]}`).join("; ")}</div>
      )}
    </div>
  );
}
