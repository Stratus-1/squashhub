import { Home, Calendar, BarChart3, MessageCircle, Settings as SettingsIcon, Wine, Trophy, CalendarDays } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useClubContext } from "@/contexts/ClubContext";

const baseNavItems = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/bookings", icon: Calendar, label: "Courts" },
  { to: "/events?tab=tournaments", icon: Trophy, label: "Tournaments" },
  { to: "/feed", icon: MessageCircle, label: "Feed" },
  { to: "/settings", icon: SettingsIcon, label: "Settings" },
];

export function BottomNav() {
  const { club } = useClubContext();
  const honestyBarEnabled = !!club?.honesty_bar_enabled;
  const isAssociation = (club as any)?.tenant_type === "association";

  let navItems = baseNavItems;

  if (isAssociation) {
    // Associations run everything from the unified dashboard at "/".
    // Keep the bar minimal: Home + Events + Leagues + Feed.
    navItems = [
      baseNavItems[0],
      { to: "/events", icon: CalendarDays, label: "Events" },
      { to: "/league-games", icon: Trophy, label: "Leagues" },
      baseNavItems[3],
    ];
  } else if (honestyBarEnabled) {
    navItems = [
      baseNavItems[0],
      baseNavItems[1],
      { to: "/honesty-bar", icon: Wine, label: "Bar" },
      baseNavItems[3],
      baseNavItems[4],
    ];
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-inset" style={{ paddingTop: 0 }}>
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/" || item.to === "/events?tab=tournaments"}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 py-2 px-2 text-[10px] font-medium transition-colors",
                (isActive && item.to !== "/events?tab=tournaments")
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
