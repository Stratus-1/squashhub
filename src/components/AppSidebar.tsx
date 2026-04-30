import {
  Home,
  BarChart3,
  Calendar,
  ClipboardCheck,
  Trophy,
  Crosshair,
  Swords,
  CalendarDays,
  Wine,
  MessageCircle,
  Wallet,
  ShieldCheck,
  Settings as SettingsIcon,
  Activity,
  LayoutGrid,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useSidebarFlags } from "@/hooks/use-sidebar-flags";
import { cn } from "@/lib/utils";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { hasLeagues, honestyBarEnabled, hasAnyAdminAccess } = useSidebarFlags();

  const isActive = (path: string) => pathname === path;

  const homeItems: Item[] = [
    { title: "Stats", url: "/analytics", icon: BarChart3 },
    { title: "Bookings", url: "/bookings", icon: Calendar },
    { title: "Match Results", url: "/add-result", icon: ClipboardCheck },
  ];

  const activityItems: Item[] = [
    { title: "Mark a Game", url: "/match-marker", icon: Crosshair },
    { title: "Enter Results", url: "/add-result", icon: ClipboardCheck },
    { title: "Club Ladderboard", url: "/ladder", icon: Trophy },
    { title: "Challenges", url: "/challenges", icon: Swords },
    ...(hasLeagues ? [{ title: "League Games", url: "/league-games", icon: Trophy }] : []),
    { title: "Events", url: "/events", icon: CalendarDays },
    ...(honestyBarEnabled ? [{ title: "Honesty Bar", url: "/honesty-bar", icon: Wine }] : []),
    { title: "Feed", url: "/feed", icon: MessageCircle },
    { title: "My Account", url: "/my-account", icon: Wallet },
  ];

  const homeOpen = homeItems.some((i) => isActive(i.url)) || pathname === "/";
  const activitiesOpen = activityItems.some((i) => isActive(i.url));

  // Uppercase, tracked label style matching the mockup
  const groupLabelClass =
    "uppercase tracking-[0.18em] text-[11px] font-bold text-sidebar-foreground/90";

  const renderSubItem = (item: Item) => (
    <SidebarMenuSubItem key={item.title + item.url}>
      <SidebarMenuSubButton asChild isActive={isActive(item.url)}>
        <NavLink to={item.url} className="flex items-center gap-2">
          <item.icon className="w-3.5 h-3.5 shrink-0" />
          <span className="uppercase tracking-wider text-[11px] font-medium">{item.title}</span>
        </NavLink>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="gap-0 pt-3">
        {/* HOME group */}
        <SidebarGroup>
          <SidebarGroupLabel asChild>
            <NavLink to="/" className={cn(groupLabelClass, "flex items-center gap-2")}>
              <Home className="w-4 h-4" />
              {!collapsed && <span>Home</span>}
            </NavLink>
          </SidebarGroupLabel>
          {!collapsed && homeOpen && (
            <SidebarGroupContent>
              <SidebarMenuSub>{homeItems.map(renderSubItem)}</SidebarMenuSub>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        {/* COURTS — single link */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/bookings")}>
                  <NavLink to="/bookings" className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4" />
                    {!collapsed && (
                      <span className="uppercase tracking-[0.18em] text-[11px] font-bold">
                        Courts
                      </span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ACTIVITIES group */}
        <SidebarGroup>
          <SidebarGroupLabel className={cn(groupLabelClass, "flex items-center gap-2")}>
            <Activity className="w-4 h-4" />
            {!collapsed && <span>Activities</span>}
          </SidebarGroupLabel>
          {!collapsed && activitiesOpen && (
            <SidebarGroupContent>
              <SidebarMenuSub>{activityItems.map(renderSubItem)}</SidebarMenuSub>
            </SidebarGroupContent>
          )}
          {!collapsed && !activitiesOpen && (
            <SidebarGroupContent>
              <SidebarMenuSub>{activityItems.map(renderSubItem)}</SidebarMenuSub>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        {/* CLUB ADMIN — single link, only if user has admin access */}
        {hasAnyAdminAccess && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/club-admin")}>
                    <NavLink to="/club-admin" className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      {!collapsed && (
                        <span className="uppercase tracking-[0.18em] text-[11px] font-bold">
                          Club Admin
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* SETTINGS pinned at bottom */}
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/settings")}>
              <NavLink to="/settings" className="flex items-center gap-2">
                <SettingsIcon className="w-4 h-4" />
                {!collapsed && (
                  <span className="uppercase tracking-[0.18em] text-[11px] font-bold">
                    Settings
                  </span>
                )}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
