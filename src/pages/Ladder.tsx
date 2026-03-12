import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { LadderPlayerCard, type LadderPlayer } from "@/components/LadderPlayerCard";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLadder, useMyRoles, useProfile } from "@/hooks/use-data";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpcExt } from "@/lib/supabase-ext";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

function SortableLadderColumn({
  title,
  players,
  userId,
  isAdmin,
  onNavigate,
  onChallenge,
  getChallengeBlockReason,
  onReorder,
  sensors,
}: {
  title: string;
  players: LadderPlayer[];
  userId: string | undefined;
  isAdmin: boolean;
  onNavigate: (id: string, isMe: boolean) => void;
  onChallenge: (id: string, rank: number | null) => void;
  getChallengeBlockReason: (id: string, rank: number | null) => string | null;
  onReorder: (newOrder: LadderPlayer[]) => void;
  sensors: any;
}) {

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = players.findIndex((p) => p.id === active.id);
    const newIndex = players.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(players, oldIndex, newIndex));
  };

  return (
    <div>
      <h2 className="text-sm font-heading font-bold text-foreground mb-2 uppercase tracking-wide">
        {title}
        <span className="text-muted-foreground font-normal ml-1.5">({players.length})</span>
      </h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={players.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {players.map((player, index) => (
              <LadderPlayerCard
                key={player.id}
                player={player}
                index={index}
                isMe={player.id === userId}
                isAdmin={isAdmin}
                onNavigate={onNavigate}
                onChallenge={onChallenge}
                challengeBlocked={!!getChallengeBlockReason(player.id, player.rank)}
              />
            ))}
            {players.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">No players yet</p>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export default function Ladder() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { data: players, isLoading } = useLadder();
  const { data: profile } = useProfile();
  const { data: roles } = useMyRoles();
  const isAdmin = (roles || []).includes("admin");
  const myRank = profile?.rank ?? null;
  const queryClient = useQueryClient();
  const [blockedChallenge, setBlockedChallenge] = useState<{
    open: boolean;
    title: string;
    description: string;
  }>({ open: false, title: "Can't challenge this player", description: "" });

  const [menOrder, setMenOrder] = useState<LadderPlayer[] | null>(null);
  const [ladiesOrder, setLadiesOrder] = useState<LadderPlayer[] | null>(null);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const menFromData = useMemo(() =>
    (players || []).filter((p: any) => p.gender?.toLowerCase() !== "female" && p.gender?.toLowerCase() !== "ladies" && p.gender?.toLowerCase() !== "f") as LadderPlayer[],
    [players]
  );

  const ladiesFromData = useMemo(() =>
    (players || []).filter((p: any) => p.gender?.toLowerCase() === "female" || p.gender?.toLowerCase() === "ladies" || p.gender?.toLowerCase() === "f") as LadderPlayer[],
    [players]
  );

  // Reset local order when data changes
  useEffect(() => {
    setMenOrder(null);
    setLadiesOrder(null);
  }, [players]);

  const menPlayers = menOrder ?? menFromData;
  const ladiesPlayers = ladiesOrder ?? ladiesFromData;
  const hasChanges = menOrder !== null || ladiesOrder !== null;

  useEffect(() => {
    const channel = supabase
      .channel("realtime:ladder-profiles")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" },
        () => queryClient.invalidateQueries({ queryKey: ["ladder"] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const getChallengeBlockReason = useMemo(() => {
    return (playerId: string, opponentRank: number | null) => {
      if (!user?.id) return "You must be logged in to challenge players.";
      if (playerId === user.id) return "You can't challenge yourself.";
      if (!myRank) return "You need a ladder rank before you can challenge players.";
      if (!opponentRank) return "This player is not ranked yet.";
      const diff = Math.abs(myRank - opponentRank);
      if (diff < 1) return "You can't challenge a player with the same rank.";
      if (diff > 2) return "You may only challenge players within 2 ladder positions.";
      if (myRank <= opponentRank) return "You may only challenge players ranked above you.";
      return null;
    };
  }, [myRank, user?.id]);

  const handleNavigate = (playerId: string, isMe: boolean) => {
    if (isMe) navigate("/profile", { state: { backgroundLocation: location } });
    else navigate(`/players/${playerId}`);
  };

  const handleChallenge = (playerId: string, rank: number | null) => {
    const reason = getChallengeBlockReason(playerId, rank);
    if (reason) {
      setBlockedChallenge({ open: true, title: "Can't challenge this player", description: reason });
      return;
    }
    navigate(`/challenges/new?opponent=${playerId}`);
  };

  const handleSaveOrder = useCallback(async () => {
    setSaving(true);
    try {
      const promises: Promise<any>[] = [];
      if (menOrder) {
        promises.push(rpcExt("admin_reorder_ladder", {
          player_ids: menOrder.map((p) => p.id),
          gender_filter: "male",
        }));
      }
      if (ladiesOrder) {
        promises.push(rpcExt("admin_reorder_ladder", {
          player_ids: ladiesOrder.map((p) => p.id),
          gender_filter: "female",
        }));
      }
      const results = await Promise.all(promises);
      const err = results.find((r) => r.error);
      if (err?.error) throw err.error;
      toast.success("Ladder order saved");
      setMenOrder(null);
      setLadiesOrder(null);
      queryClient.invalidateQueries({ queryKey: ["ladder"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to save order");
    } finally {
      setSaving(false);
    }
  }, [menOrder, ladiesOrder, queryClient]);

  const totalPlayers = (players || []).length;

  return (
    <div className="bottom-nav-safe">
      <SEO title="Player Ladder" description="See the latest squash ladder rankings at Gordon's Bay Squash Club." path="/ladder" noIndex />
      <PageHeader
        title="Player Ladder"
        subtitle={`${totalPlayers} players ranked`}
      />

      {isAdmin && hasChanges && (
        <div className="px-4 mt-2 flex items-center gap-2">
          <Button size="sm" onClick={handleSaveOrder} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Save Order
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setMenOrder(null); setLadiesOrder(null); }}>
            Cancel
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="px-4 mt-3 mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <SortableLadderColumn
            title="Men's Ladder"
            players={menPlayers}
            userId={user?.id}
            isAdmin={isAdmin}
            onNavigate={handleNavigate}
            onChallenge={handleChallenge}
            getChallengeBlockReason={getChallengeBlockReason}
            onReorder={setMenOrder}
            sensors={sensors}
          />
          <SortableLadderColumn
            title="Ladies' Ladder"
            players={ladiesPlayers}
            userId={user?.id}
            isAdmin={isAdmin}
            onNavigate={handleNavigate}
            onChallenge={handleChallenge}
            getChallengeBlockReason={getChallengeBlockReason}
            onReorder={setLadiesOrder}
            sensors={sensors}
          />
        </div>
      )}

      <Dialog
        open={blockedChallenge.open}
        onOpenChange={(open) => setBlockedChallenge((s) => ({ ...s, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{blockedChallenge.title}</DialogTitle>
            <DialogDescription>{blockedChallenge.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setBlockedChallenge((s) => ({ ...s, open: false }))}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
