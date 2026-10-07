import { Home, Calendar, Wine, Trophy, CalendarDays, Wallet, User } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useClubContext } from "@/contexts/ClubContext";
import { useSidebarFlags } from "@/hooks/use-sidebar-flags";

const baseNavItems = [
  { to: "/", icon: Home, label: "Home", tone: "home" },
  { to: "/bookings", icon: Calendar, label: "Courts", tone: "courts" },
  { to: "/my-account", icon: Wallet, label: "Account", tone: "account" },
  { to: "/profile", icon: User, label: "Profile", tone: "profile" },
];

export function BottomNav() {
  const { club } = useClubContext();
  const { honestyBarEnabled, bookingsEnabled, eventsEnabled } = useSidebarFlags();

  const isAssociation = (club as any)?.tenant_type === "association";

  let navItems = baseNavItems;

  if (isAssociation) {
    // Associations run everything from the unified dashboard at "/".
    // Keep the bar minimal: Home + Events + Leagues + Account + Profile.
    navItems = [
      baseNavItems[0],
      { to: "/events", icon: CalendarDays, label: "Events", tone: "events" },
      { to: "/league-games", icon: Trophy, label: "Leagues", tone: "leagues" },
      baseNavItems[2], // Account
      baseNavItems[3], // Profile
    ];
  } else {
    navItems = [
      baseNavItems[0],
      ...(bookingsEnabled
        ? [baseNavItems[1]]
        : eventsEnabled
        ? [{ to: "/events", icon: CalendarDays, label: "Events", tone: "events" }]
        : []),
      ...(honestyBarEnabled ? [{ to: "/honesty-bar", icon: Wine, label: "Bar", tone: "bar" }] : []),
      baseNavItems[2], // Account
      baseNavItems[3], // Profile
    ];
  }

  return (
    <nav aria-label="Primary shortcuts" className={cn("fixed bottom-0 left-0 right-0 z-50 border-t border-border backdrop-blur-md safe-area-inset", isAssociation ? "bg-card/95" : "member-bottom-nav bg-card")}>
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            data-tone={isAssociation ? undefined : item.tone}
            className={({ isActive }) =>
              cn(
                isAssociation ? "flex flex-col items-center gap-0.5 py-2 px-2 text-[10px] font-medium transition-colors" : "flex flex-1 flex-col items-center justify-center gap-0.5 min-h-16 py-2 px-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]",
                isActive ? (isAssociation ? "text-primary" : "text-foreground font-bold") : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className={cn(
                  isAssociation ? "flex items-center justify-center w-10 h-7 rounded-full transition-colors" : "member-nav-icon flex items-center justify-center w-12 h-8 rounded-md transition-colors",
                  isActive && (isAssociation ? "bg-primary/10" : "bg-primary/10 ring-1 ring-primary/40"),
                )}>
                  <item.icon className={cn(isAssociation ? "w-5 h-5" : "w-6 h-6", !isAssociation && isActive && "stroke-[2.5]")} />
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
