import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy, Star, Flame, Zap, Shield, ShieldCheck, Swords, Users,
  Sunrise, CalendarCheck, Medal, Crown, HandMetal, Sword, Target,
  TrendingUp, Award, Sparkles,
} from "lucide-react";
import {
  useBadgeDefinitions,
  useUserBadges,
  useMyXp,
  useUserStreaks,
  useXpLeaderboard,
  useAwardBadge,
  type BadgeDefinition,
} from "@/hooks/use-achievements";
import { useProfile } from "@/hooks/use-data";

const ICON_MAP: Record<string, React.ElementType> = {
  trophy: Trophy, star: Star, flame: Flame, zap: Zap, shield: Shield,
  "shield-check": ShieldCheck, swords: Swords, users: Users, sunrise: Sunrise,
  "calendar-check": CalendarCheck, medal: Medal, crown: Crown,
  "hand-metal": HandMetal, sword: Sword, target: Target,
};

const CATEGORY_LABELS: Record<string, string> = {
  milestone: "Milestones",
  streak: "Streaks",
  special: "Special",
  social: "Social",
  fun: "Fun",
  commitment: "Commitment",
  ladder: "Ladder",
};

const CATEGORY_COLORS: Record<string, string> = {
  milestone: "bg-primary/10 text-primary",
  streak: "bg-orange-500/10 text-orange-600",
  special: "bg-purple-500/10 text-purple-600",
  social: "bg-blue-500/10 text-blue-600",
  fun: "bg-accent/10 text-accent-foreground",
  commitment: "bg-emerald-500/10 text-emerald-600",
  ladder: "bg-amber-500/10 text-amber-700",
};

function getLevel(xp: number) {
  // Each level requires more XP: level N needs N*100 XP
  let level = 1;
  let xpNeeded = 100;
  let totalNeeded = 0;
  while (totalNeeded + xpNeeded <= xp) {
    totalNeeded += xpNeeded;
    level++;
    xpNeeded = level * 100;
  }
  const currentLevelXp = xp - totalNeeded;
  return { level, currentLevelXp, nextLevelXp: xpNeeded, totalXp: xp };
}

function BadgeCard({ badge, earned, animate }: { badge: BadgeDefinition; earned: boolean; animate?: boolean }) {
  const Icon = ICON_MAP[badge.icon] || Trophy;
  const colorClass = CATEGORY_COLORS[badge.category] || "bg-muted text-muted-foreground";

  return (
    <motion.div
      initial={animate ? { scale: 0.8, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
        earned
          ? "bg-card border-primary/30 shadow-sm"
          : "bg-muted/30 border-border/50 opacity-50 grayscale"
      }`}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${earned ? colorClass : "bg-muted text-muted-foreground"}`}>
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-xs font-semibold text-center leading-tight">{badge.name}</p>
      <p className="text-[10px] text-muted-foreground text-center leading-tight">{badge.description}</p>
      {earned && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          +{badge.xp_reward} XP
        </Badge>
      )}
      {!earned && (
        <span className="text-[10px] text-muted-foreground">🔒 Locked</span>
      )}
    </motion.div>
  );
}

export default function Achievements() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: allBadges, isLoading: loadingBadges } = useBadgeDefinitions();
  const { data: myBadges, isLoading: loadingMyBadges } = useUserBadges();
  const { data: xpData, isLoading: loadingXp } = useMyXp();
  const { data: streaks } = useUserStreaks();
  const { data: leaderboard, isLoading: loadingLeaderboard } = useXpLeaderboard();

  const earnedBadgeIds = useMemo(() => new Set((myBadges || []).map(b => b.badge_id)), [myBadges]);
  const { level, currentLevelXp, nextLevelXp, totalXp } = useMemo(() => getLevel(xpData?.total || 0), [xpData]);

  const badgesByCategory = useMemo(() => {
    const map = new Map<string, BadgeDefinition[]>();
    for (const b of (allBadges || [])) {
      if (!map.has(b.category)) map.set(b.category, []);
      map.get(b.category)!.push(b);
    }
    return map;
  }, [allBadges]);

  const isLoading = loadingBadges || loadingMyBadges || loadingXp;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <PageHeader title="Achievements" />
        <div className="px-4 space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  const earnedCount = myBadges?.length || 0;
  const totalCount = allBadges?.length || 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="Achievements" backTo="/dashboard" />

      <div className="px-4 space-y-5 max-w-lg mx-auto">
        {/* XP & Level Hero */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/70 p-5 text-primary-foreground"
        >
          <div className="absolute top-2 right-2 opacity-10">
            <Sparkles className="w-24 h-24" />
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary-foreground/20 flex items-center justify-center text-2xl font-bold">
              {level}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm opacity-80">Level {level}</p>
              <p className="text-2xl font-bold">{totalXp.toLocaleString()} XP</p>
              <div className="mt-1.5">
                <Progress value={(currentLevelXp / nextLevelXp) * 100} className="h-2 bg-primary-foreground/20" />
                <p className="text-[10px] mt-0.5 opacity-70">
                  {currentLevelXp} / {nextLevelXp} XP to Level {level + 1}
                </p>
              </div>
            </div>
          </div>

          {/* Streaks row */}
          <div className="flex gap-4 mt-4 pt-3 border-t border-primary-foreground/20">
            <div className="text-center">
              <p className="text-lg font-bold">{streaks?.current_win_streak || 0}</p>
              <p className="text-[10px] opacity-70">Win Streak</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{streaks?.best_win_streak || 0}</p>
              <p className="text-[10px] opacity-70">Best Streak</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{earnedCount}</p>
              <p className="text-[10px] opacity-70">Badges</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{totalCount - earnedCount}</p>
              <p className="text-[10px] opacity-70">Remaining</p>
            </div>
          </div>
        </motion.div>

        <Tabs defaultValue="badges">
          <TabsList className="w-full">
            <TabsTrigger value="badges" className="flex-1">Badges</TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex-1">XP Board</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
          </TabsList>

          <TabsContent value="badges" className="space-y-5 mt-4">
            {[...badgesByCategory.entries()].map(([category, badges]) => (
              <div key={category}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                  {CATEGORY_LABELS[category] || category}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {badges.map(badge => (
                    <BadgeCard
                      key={badge.id}
                      badge={badge}
                      earned={earnedBadgeIds.has(badge.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="leaderboard" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  XP Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loadingLeaderboard ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {(leaderboard || []).slice(0, 20).map((entry, idx) => (
                      <div
                        key={entry.user_id}
                        className={`flex items-center gap-3 px-4 py-3 ${
                          entry.user_id === user?.id ? "bg-primary/5" : ""
                        }`}
                      >
                        <span className={`w-6 text-center text-sm font-bold ${
                          idx === 0 ? "text-amber-500" : idx === 1 ? "text-gray-400" : idx === 2 ? "text-orange-600" : "text-muted-foreground"
                        }`}>
                          {idx + 1}
                        </span>
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {(entry.name || "?").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {entry.name}
                            {entry.user_id === user?.id && (
                              <span className="text-primary ml-1 text-xs">(You)</span>
                            )}
                          </p>
                          {entry.rank && (
                            <p className="text-[10px] text-muted-foreground">Rank #{entry.rank}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">{entry.xp.toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground">XP</p>
                        </div>
                      </div>
                    ))}
                    {(!leaderboard || leaderboard.length === 0) && (
                      <div className="p-8 text-center text-muted-foreground text-sm">
                        No XP earned yet. Play matches to earn XP!
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Award className="w-4 h-4 text-primary" />
                  Recent XP
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {(xpData?.events || []).slice(0, 20).map(event => (
                    <div key={event.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm">{event.reason}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(event.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="secondary" className="font-bold">
                        +{event.amount}
                      </Badge>
                    </div>
                  ))}
                  {(!xpData?.events || xpData.events.length === 0) && (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      No XP history yet. Earn badges to get XP!
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
