/**
 * "Join tournament WhatsApp group" — shown wherever a player has already
 * entered (registration success, My Tournaments, the tournament page).
 *
 * Hidden entirely when the organiser has not added a group, so a missing group
 * never blocks anything. Joining the group is not an entry and never changes
 * one — SquashHub stays the source of truth.
 */
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTournamentWhatsAppGroup } from "@/hooks/use-tournament-whatsapp-group";

type Props = {
  champId?: string | null;
  className?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary";
};

export function JoinWhatsAppGroupButton({ champId, className, size = "sm", variant = "outline" }: Props) {
  const { data: group } = useTournamentWhatsAppGroup(champId);
  if (!group?.invite_url || group.status !== "active") return null;

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      onClick={() => window.open(group.invite_url as string, "_blank", "noopener,noreferrer")}
    >
      <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
      Join tournament WhatsApp group
    </Button>
  );
}
