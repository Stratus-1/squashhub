import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { GripVertical, Swords, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface LadderPlayer {
  id: string;
  name: string;
  avatar_url: string | null;
  wins: number;
  losses: number;
  matches_played: number;
  rank: number | null;
  league_rank: number | null;
  user_id: string | null;
  gender: string | null;
  club_member_id: string;
}

interface Props {
  player: LadderPlayer;
  index: number;
  isMe: boolean;
  isAdmin: boolean;
  onNavigate: (playerId: string, isMe: boolean) => void;
  onChallenge: (playerId: string, rank: number | null) => void;
  challengeBlocked: boolean;
}

export function LadderPlayerCard({ player, index, isMe, isAdmin, onNavigate, onChallenge, challengeBlocked }: Props) {
  const winRate = player.matches_played > 0
    ? Math.round((player.wins / player.matches_played) * 100)
    : 0;

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: player.id, disabled: !isAdmin });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        className={cn(
          "p-2.5 flex items-center gap-2 cursor-pointer hover:bg-muted/30 transition-colors",
          index === 0 && "border-accent/50 bg-accent/5",
          index === 1 && "border-primary/30 bg-primary/5",
          index === 2 && "border-primary/20 bg-primary/[0.02]",
          isDragging && "shadow-lg ring-2 ring-primary/30"
        )}
        role="button"
        tabIndex={0}
        onClick={() => onNavigate(player.id, isMe)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          onNavigate(player.id, isMe);
        }}
      >
        {isAdmin && (
          <div
            className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4" />
          </div>
        )}

        <div className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center font-heading font-bold text-xs shrink-0",
          index === 0 ? "bg-accent text-accent-foreground" :
          index <= 2 ? "bg-primary/15 text-primary" :
          "bg-secondary text-muted-foreground"
        )}>
          {index + 1}
        </div>

        <PlayerAvatar initials={getInitials(player.name)} size="sm" avatarUrl={player.avatar_url} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-xs font-semibold truncate">{player.name}</p>
            {isMe && (
              <Badge variant="secondary" className="text-[9px] shrink-0 px-1 py-0">You</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {player.wins}W-{player.losses}L
            </span>
            {player.matches_played > 0 && (
              <span className="text-[10px] text-primary font-medium flex items-center gap-0.5">
                <TrendingUp className="w-2.5 h-2.5" />
                {winRate}%
              </span>
            )}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 text-[10px] shrink-0 gap-0.5 px-2",
            challengeBlocked && "opacity-50 cursor-not-allowed"
          )}
          aria-disabled={challengeBlocked}
          onClick={(e) => {
            e.stopPropagation();
            onChallenge(player.id, player.rank);
          }}
        >
          <Swords className="w-2.5 h-2.5" />
          Challenge
        </Button>
      </Card>
    </div>
  );
}
