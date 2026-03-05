import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Swords, Calendar, Trophy, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const notifications = [
  { id: "1", icon: Swords, title: "New Challenge", message: "Lisa Chen has challenged you to a match", time: "2h ago", read: false },
  { id: "2", icon: Calendar, title: "Booking Confirmed", message: "Court 1 booked for tomorrow at 10:00", time: "5h ago", read: false },
  { id: "3", icon: Trophy, title: "Ladder Update", message: "You moved up to position #4!", time: "1d ago", read: true },
  { id: "4", icon: CheckCircle, title: "Match Confirmed", message: "Your match result vs David Botha has been confirmed", time: "2d ago", read: true },
];

export default function Notifications() {
  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Notifications" />

      <div className="px-4 mt-3 space-y-2 mb-4">
        {notifications.map((notif, i) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className={cn(
              "p-3 flex items-start gap-3",
              !notif.read && "border-primary/30 bg-primary/5"
            )}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                !notif.read ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
              )}>
                <notif.icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{notif.title}</p>
                  <span className="text-[10px] text-muted-foreground">{notif.time}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
              </div>
              {!notif.read && (
                <div className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2" />
              )}
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
