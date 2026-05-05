/**
 * RosterPanel — Side-by-side list of both teams' NSA-registered players
 * for a fixture. Click a player to drop them into the next empty position
 * on their side of the scorecard.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NsaTeamPlayer } from "@/hooks/use-nsa";
import { UserPlus, Check } from "lucide-react";

export interface RosterPanelProps {
  homeCode?: string | null;
  awayCode?: string | null;
  homePlayers?: NsaTeamPlayer[];
  awayPlayers?: NsaTeamPlayer[];
  /** NSF codes (uppercase) currently assigned in the lineup */
  assignedCodes: Set<string>;
  /** Called when user clicks a player to add them to the lineup. */
  onAssign: (side: "home" | "away", player: NsaTeamPlayer) => void;
  loading?: boolean;
}

function PlayerRow({
  player,
  assigned,
  onClick,
}: {
  player: NsaTeamPlayer;
  assigned: boolean;
  onClick: () => void;
}) {
  const won = Number(player.result_summary?.won ?? 0) || 0;
  const lost = Number(player.result_summary?.lost ?? 0) || 0;
  const played = Number(player.result_summary?.played ?? 0) || 0;
  const fullName = `${player.name || ""} ${player.surname || ""}`.trim() || "—";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={assigned}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] border transition-colors",
        assigned
          ? "bg-muted/40 border-muted text-muted-foreground cursor-not-allowed"
          : "bg-background border-border hover:bg-primary/5 hover:border-primary/40"
      )}
      title={assigned ? "Already in lineup" : `Add ${fullName} to next open position`}
    >
      <span className="font-mono text-[10px] w-14 shrink-0 text-muted-foreground">
        {player.code}
      </span>
      <span className="flex-1 truncate font-medium">{fullName}</span>
      {played > 0 && (
        <Badge
          variant="outline"
          className="text-[9px] px-1 py-0 h-4 font-mono border-emerald-300 text-emerald-700 shrink-0"
          title={`${played} played this season`}
        >
          {won}W–{lost}L
        </Badge>
      )}
      {assigned ? (
        <Check className="w-3 h-3 text-emerald-600 shrink-0" />
      ) : (
        <UserPlus className="w-3 h-3 text-primary/60 shrink-0" />
      )}
    </button>
  );
}

function TeamColumn({
  label,
  teamCode,
  side,
  players,
  assignedCodes,
  onAssign,
  loading,
}: {
  label: string;
  teamCode?: string | null;
  side: "home" | "away";
  players?: NsaTeamPlayer[];
  assignedCodes: Set<string>;
  onAssign: RosterPanelProps["onAssign"];
  loading?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-[10px] font-mono text-foreground">{teamCode || "—"}</span>
      </div>
      <div className="space-y-0.5 max-h-[260px] overflow-y-auto pr-1">
        {loading && (
          <div className="text-[10px] text-muted-foreground italic px-1 py-2">
            Loading roster…
          </div>
        )}
        {!loading && (!players || players.length === 0) && (
          <div className="text-[10px] text-muted-foreground italic px-1 py-2">
            No NSA roster mapped. Add NSA Team ID in Club Admin → Leagues.
          </div>
        )}
        {(players || []).map((p) => (
          <PlayerRow
            key={p.code}
            player={p}
            assigned={assignedCodes.has((p.code || "").toUpperCase())}
            onClick={() => onAssign(side, p)}
          />
        ))}
      </div>
    </div>
  );
}

export function RosterPanel({
  homeCode,
  awayCode,
  homePlayers,
  awayPlayers,
  assignedCodes,
  onAssign,
  loading,
}: RosterPanelProps) {
  const hasAny = (homePlayers && homePlayers.length) || (awayPlayers && awayPlayers.length);
  if (!hasAny && !loading) return null;
  return (
    <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-2 space-y-2">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="font-semibold text-emerald-800">NSA Squad</span>
        <span className="text-emerald-700/80">
          Click a player to assign them to the next open position.
        </span>
      </div>
      <div className="flex gap-2">
        <TeamColumn
          label="Home"
          teamCode={homeCode}
          side="home"
          players={homePlayers}
          assignedCodes={assignedCodes}
          onAssign={onAssign}
          loading={loading}
        />
        <div className="w-px bg-emerald-200" />
        <TeamColumn
          label="Visitors"
          teamCode={awayCode}
          side="away"
          players={awayPlayers}
          assignedCodes={assignedCodes}
          onAssign={onAssign}
          loading={loading}
        />
      </div>
    </div>
  );
}
