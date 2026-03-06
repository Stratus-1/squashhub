import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Trophy, Target, TrendingUp, Settings, LogOut, Loader2, Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-data";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { motion } from "framer-motion";

export default function Profile() {
  const { signOut } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { permission, isSubscribed, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const winRate = profile && profile.matches_played > 0
    ? Math.round((profile.wins / profile.matches_played) * 100)
    : 0;

  const initials = profile?.name
    ? profile.name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
    : "?";

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Profile" />

      <motion.div
        className="flex flex-col items-center px-4 mt-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <PlayerAvatar initials={initials} rank={profile?.rank} size="lg" />
        <h2 className="text-lg font-bold font-heading mt-3">{profile?.name || "New Player"}</h2>
        <p className="text-sm text-muted-foreground">{profile?.email}</p>
      </motion.div>

      <div className="grid grid-cols-4 gap-2 px-4 mt-4">
        <StatCard label="Rank" value={profile?.rank ? `#${profile.rank}` : "—"} icon={<Trophy className="w-4 h-4" />} />
        <StatCard label="Played" value={profile?.matches_played || 0} icon={<Target className="w-4 h-4" />} />
        <StatCard label="Wins" value={profile?.wins || 0} variant="win" />
        <StatCard label="Win %" value={`${winRate}%`} icon={<TrendingUp className="w-4 h-4" />} />
      </div>

      <Separator className="my-5 mx-4" />

      <div className="px-4 space-y-2 mb-4">
        {permission !== "unsupported" && (
          <Card className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Push Notifications</p>
                <p className="text-xs text-muted-foreground">
                  {permission === "denied" ? "Blocked in browser settings" : "Challenges, matches & updates"}
                </p>
              </div>
            </div>
            <Switch
              checked={isSubscribed}
              disabled={pushLoading || permission === "denied"}
              onCheckedChange={(checked) => checked ? subscribe() : unsubscribe()}
            />
          </Card>
        )}
        <Button variant="outline" className="w-full justify-start gap-3">
          <Settings className="w-4 h-4" /> Edit Profile
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-3 text-destructive hover:text-destructive"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </Button>
      </div>
    </div>
  );
}
