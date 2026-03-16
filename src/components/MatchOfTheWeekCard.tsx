import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame } from "lucide-react";
import { useMatchOfTheWeek } from "@/hooks/use-analytics";
import { motion } from "framer-motion";

export function MatchOfTheWeekCard() {
  const { data: motw, isLoading } = useMatchOfTheWeek();

  if (isLoading || !motw) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-accent/30 bg-accent/5 overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-accent-foreground" />
            <span className="text-xs font-bold font-heading uppercase tracking-wider">Match of the Week</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <p className="text-sm font-bold font-heading">{motw.player_a_name || "Player A"}</p>
              <p className="text-[10px] text-muted-foreground">
                {(motw.winner_member_id && motw.winner_member_id === motw.player_a_member_id) ||
                 (!motw.winner_member_id && motw.winner_id === motw.player_a) ? "🏆 Winner" : ""}
              </p>
            </div>
            <div className="px-3">
              <Badge className="bg-primary/15 text-primary border-0 text-sm font-bold">
                {motw.score || "vs"}
              </Badge>
            </div>
            <div className="text-center flex-1">
              <p className="text-sm font-bold font-heading">{motw.player_b_name || "Player B"}</p>
              <p className="text-[10px] text-muted-foreground">
                {(motw.winner_member_id && motw.winner_member_id === motw.player_b_member_id) ||
                 (!motw.winner_member_id && motw.winner_id === motw.player_b) ? "🏆 Winner" : ""}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">{motw.match_date}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
