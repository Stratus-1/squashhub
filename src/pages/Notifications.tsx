import { Card } from "@/components/ui/card";
import { Bell, Swords, Calendar, Trophy, CheckCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();
  const close = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/dashboard");
  };

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

  return (
    <div className="bottom-nav-safe">
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between gap-3">
            <DialogHeader>
              <DialogTitle className="font-heading">Notifications</DialogTitle>
            </DialogHeader>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={close}>
              Close
            </Button>
          </div>

          <div className="p-4 pt-3 max-h-[70vh] overflow-y-auto space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : notifications && notifications.length > 0 ? (
              notifications.map((notif, i) => {
                const Icon = iconMap[notif.type] || Bell;
                return (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => !notif.read && markRead.mutate(notif.id)}
                  >
                    <Card
                      className={cn(
                        "p-3 flex items-start gap-3 cursor-pointer",
                        !notif.read && "border-primary/30 bg-primary/5"
                      )}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                          !notif.read ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold truncate">{notif.title}</p>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
                      </div>
                      {!notif.read && <div className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2" />}
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
