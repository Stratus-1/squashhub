import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Bell, Swords, Calendar, Trophy, CheckCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

const iconMap: Record<string, typeof Bell> = {
  challenge: Swords,
  booking: Calendar,
  ladder: Trophy,
  match: CheckCircle,
  general: Bell,
};

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  if (isLoading) {
    return (
      <div className="bottom-nav-safe">
        <PageHeader title="Notifications" showNotifications={false} />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Notifications" showNotifications={false} />

      <div className="px-4 mt-3 space-y-2 mb-4">
        {notifications && notifications.length > 0 ? (
          notifications.map((notif, i) => {
            const Icon = iconMap[notif.type] || Bell;
            return (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => !notif.read && markRead.mutate(notif.id)}
              >
                <Card className={cn(
                  "p-3 flex items-start gap-3 cursor-pointer",
                  !notif.read && "border-primary/30 bg-primary/5"
                )}>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                    !notif.read ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
                  )}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{notif.title}</p>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
                  </div>
                  {!notif.read && (
                    <div className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2" />
                  )}
                </Card>
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-16 text-sm text-muted-foreground">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No notifications yet
          </div>
        )}
      </div>
    </div>
  );
}
