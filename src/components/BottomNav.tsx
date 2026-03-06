import { Home, Calendar, Trophy, Swords, User, Bell } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useUnreadNotificationsCount } from "@/hooks/use-data";

const navItems = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/bookings", icon: Calendar, label: "Courts" },
  { to: "/ladder", icon: Trophy, label: "Ladder" },
  { to: "/challenges", icon: Swords, label: "Challenges" },
  { to: "/notifications", icon: Bell, label: "Alerts" },
  { to: "/profile", icon: User, label: "Profile" },
];

export function BottomNav() {
  const { data: unreadCount } = useUnreadNotificationsCount();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md">
      <div className="flex items-center justify-around pb-[env(safe-area-inset-bottom,0px)]">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 py-2 px-3 text-[10px] font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={cn(
                    "relative flex items-center justify-center w-10 h-7 rounded-full transition-colors",
                    isActive && "bg-primary/10"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.to === "/notifications" && (unreadCount ?? 0) > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent border border-background" />
                  )}
                </div>
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
