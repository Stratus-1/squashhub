import { Link } from "react-router-dom";
import { Swords, Wand2 } from "lucide-react";
import { TournamentPlanner } from "@/components/tournaments/TournamentPlanner";
import { useIsSuperAdmin } from "@/hooks/use-club";
import { canUseSmartBuilder, SMART_BUILDER_LABEL, SMART_BUILDER_SUBLABEL } from "@/lib/smart-builder/access";

/**
 * Association / federation tournament planning.
 *
 * Deliberately reuses the club wizard (via `TournamentPlanner`) so every level
 * plans tournaments the same way — capacity, courts, time slots, leagues,
 * schedule preview. The only difference is the owning body and the fact that
 * any club nationwide can host and contribute entrants.
 */
export default function SuperAdminTournaments() {
  const isSuperAdmin = useIsSuperAdmin();
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

      {canUseSmartBuilder({ isSuperAdmin }) && (
        <Link
          to="/admin/tournaments/smart"
          className="flex items-center gap-3 rounded-xl border border-amber-300/40 bg-white/[0.04] p-3 hover:bg-white/[0.08] transition-colors"
        >
          <Wand2 className="w-5 h-5 text-amber-300" />
          <div>
            <div className="text-sm font-semibold text-white">✨ {SMART_BUILDER_LABEL}</div>
            <div className="text-[11px] text-amber-200/80">{SMART_BUILDER_SUBLABEL}</div>
          </div>
        </Link>
      )}

      <TournamentPlanner mode="platform" dark />
    </div>
  );
}
