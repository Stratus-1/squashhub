import { Home, Calendar, Trophy, Swords, User } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/bookings", icon: Calendar, label: "Courts" },
  { to: "/ladder", icon: Trophy, label: "Ladder" },
  { to: "/challenges", icon: Swords, label: "Challenges" },
  { to: "/profile", icon: User, label: "Profile" },
];

export function BottomNav() {
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
                <div className={cn(
                  "flex items-center justify-center w-10 h-7 rounded-full transition-colors",
                  isActive && "bg-primary/10"
                )}>
                  <item.icon className="w-5 h-5" />
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
