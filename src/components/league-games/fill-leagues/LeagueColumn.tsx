import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, Calendar, MapPin, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { DraggablePlayer } from "./DraggablePlayer";
import { DroppableZone } from "./DroppableZone";
import { posDropId, benchDropId, type LeagueRow, type FixtureLite, type MemberLite } from "./types";

type Props = {
  league: LeagueRow;
  isCaptain: boolean;
  captainName: string | null;
  positions: Array<{ position: number; memberId: string | null }>;
  benchMembers: Array<{ memberId: string; rank: number | null; isPulled?: boolean; isCascaded?: boolean; cascadedFromCode?: string | null }>;
  memberMap: Map<string, MemberLite>;
  /** memberId → league registration number (e.g. WPSRA / association number) for THIS league */
  leagueNumberByMember?: Map<string, string>;
  fixture: FixtureLite | null;
  canEdit: boolean;
  /** memberIds who confirmed availability for this week — render green. */
  availableSet?: Set<string>;
};

export function LeagueColumn({ league, isCaptain, captainName, positions, benchMembers, memberMap, leagueNumberByMember, fixture, canEdit, availableSet }: Props) {
  const opponentCode = fixture
    ? fixture.home_team_code === league.code
      ? fixture.away_team_code
      : fixture.home_team_code
    : null;
  const isHome = fixture ? fixture.home_team_code === league.code : false;
  const filledCount = positions.filter(p => p.memberId).length;
  const isComplete = filledCount === 4;

  return (
    <Card
      className={cn(
        "p-3 space-y-2 transition-colors",
        isComplete && "border-primary/60 bg-primary/5 ring-1 ring-primary/30",
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="default" className="text-xs">{league.code || league.name}</Badge>
          <span className="font-semibold text-sm">{league.name}</span>
          {isCaptain && <Badge variant="secondary" className="text-[10px]">You captain this</Badge>}
          {isComplete ? (
            <Badge className="text-[10px] gap-1 bg-primary text-primary-foreground hover:bg-primary border-transparent">
              <CheckCircle2 className="w-3 h-3" /> Team set
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">{filledCount}/4 filled</Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <Crown className="w-3.5 h-3.5 text-primary" />
          <span className="text-muted-foreground">Captain:</span>
          <span className="font-medium">
            {captainName || <span className="italic text-muted-foreground">Not assigned</span>}
          </span>
        </div>
        {fixture ? (
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="flex items-center gap-1 text-foreground">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium">{format(new Date(fixture.fixture_date), "EEE dd MMM")}</span>
            </span>
            <Badge
              variant={isHome ? "default" : "secondary"}
              className="text-[10px] gap-1"
            >
              <MapPin className="w-3 h-3" />
              {isHome ? "HOME" : "AWAY"} · {fixture.venue_name}
            </Badge>
            {opponentCode && (
              <Badge variant="outline" className="text-[10px]">
                {isHome ? "vs" : "@"} {opponentCode}
              </Badge>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
            <Calendar className="w-3.5 h-3.5" />
            No upcoming fixture
          </div>
        )}
      </div>

      {/* Positions 1-4 */}
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Lineup</div>
        {positions.map((slot) => {
          const mem = slot.memberId ? memberMap.get(slot.memberId) : null;
          return (
            <div key={slot.position} className="flex items-center gap-1.5">
              <Badge variant="secondary" className="w-6 h-5 justify-center text-[10px] shrink-0">#{slot.position}</Badge>
              <DroppableZone
                id={posDropId(league.id, slot.position)}
                variant="slot"
                isEmpty={!mem}
                emptyHint={canEdit ? "Drop player here" : "—"}
                className="flex-1"
              >
                {mem && (
                  <DraggablePlayer
                    memberId={mem.id}
                    origin={league.id}
                    name={mem.name || "Unknown"}
                    leagueNumber={leagueNumberByMember?.get(mem.id) || null}
                    disabled={!canEdit}
                    available={availableSet?.has(mem.id)}
                    badge={mem.gender?.toLowerCase().startsWith("f") ? { label: "♀", variant: "outline" } : null}
                  />
                )}
              </DroppableZone>
            </div>
          );
        })}
      </div>

      {/* Bench / available pool */}
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center justify-between">
          <span>Available</span>
          <span className="text-muted-foreground/70 font-normal normal-case">
            Drag onto a position above or to another league below
          </span>
        </div>
        <DroppableZone
          id={benchDropId(league.id)}
          variant="bench"
          isEmpty={benchMembers.length === 0}
          emptyHint="No players in pool"
        >
          <div className="space-y-1">
            {benchMembers.map((b, i) => {
              const mem = memberMap.get(b.memberId);
              if (!mem) return null;
              return (
                <DraggablePlayer
                  key={b.memberId}
                  memberId={b.memberId}
                  origin={league.id}
                  name={mem.name || "Unknown"}
                  rank={b.rank}
                  leagueNumber={leagueNumberByMember?.get(b.memberId) || null}
                  disabled={!canEdit}
                  positionLabel={`${i + 1}.`}
                  available={availableSet?.has(b.memberId)}
                  badge={
                    b.isPulled
                      ? { label: "♀ guest", variant: "outline" }
                      : b.isCascaded
                      ? { label: `↓ ${b.cascadedFromCode || ""}`, variant: "outline" }
                      : mem.gender?.toLowerCase().startsWith("f")
                      ? { label: "♀", variant: "outline" }
                      : null
                  }
                />
              );
            })}
          </div>
        </DroppableZone>
      </div>
    </Card>
  );
}
