import { Swords } from "lucide-react";
import { TournamentPlanner } from "@/components/tournaments/TournamentPlanner";

/**
 * Association / federation tournament planning.
 *
 * Deliberately reuses the club wizard (via `TournamentPlanner`) so every level
 * plans tournaments the same way — capacity, courts, time slots, leagues,
 * schedule preview. The only difference is the owning body and the fact that
 * any club nationwide can host and contribute entrants.
 */
export default function SuperAdminTournaments() {
  return (
    <div className="space-y-5 max-w-7xl">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Swords className="w-5 h-5" /> Tournaments
        </h2>
        <p className="text-xs text-white/50">
          Plan association and federation competitions with the same wizard the clubs use. Pick the owning body, the
          host venue and any extra clubs whose courts and members take part.
        </p>
      </div>

      <TournamentPlanner mode="platform" dark />
    </div>
  );
}
