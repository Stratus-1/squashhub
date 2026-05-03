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
  ChevronDown,
  User,
  Network,
  Users,
  Receipt,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
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
import { useProfile } from "@/hooks/use-data";
import { useMemberContext } from "@/contexts/MemberContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname, search } = useLocation();
  const { hasLeagues, honestyBarEnabled, hasAnyAdminAccess, isAssociation } = useSidebarFlags();
  const { data: profile } = useProfile();
  const { activeMember } = useMemberContext();

  const isActive = (path: string) => {
    if (path.includes("?")) return `${pathname}${search}` === path;
    return pathname === path;
  };

  // Association tenants get a slimmed-down menu — no club-player items
  const homeItems: Item[] = isAssociation
    ? [
        { title: "Affiliated Clubs", url: "/?tab=affiliated", icon: Network },
        { title: "Members", url: "/?tab=members", icon: Users },
        { title: "Fees Owing", url: "/?tab=fees", icon: Receipt },
      ]
    : [
        { title: "Stats", url: "/analytics", icon: BarChart3 },
        { title: "Bookings", url: "/bookings", icon: Calendar },
        { title: "Match Results", url: "/add-result", icon: ClipboardCheck },
      ];

  const activityItems: Item[] = isAssociation
    ? [
        { title: "Regional Leagues", url: "/league-games", icon: Trophy },
        { title: "Tournaments", url: "/tournaments", icon: Trophy },
        { title: "Events", url: "/events", icon: CalendarDays },
        { title: "Feed", url: "/feed", icon: MessageCircle },
        { title: "My Account", url: "/my-account", icon: Wallet },
      ]
    : [
        { title: "Mark a Game", url: "/match-marker", icon: Crosshair },
        { title: "Enter Results", url: "/add-result", icon: ClipboardCheck },
        { title: "Club Ladderboard", url: "/ladder", icon: Trophy },
        { title: "Challenges", url: "/challenges", icon: Swords },
        ...(hasLeagues ? [{ title: "Regional Leagues", url: "/league-games", icon: Trophy }] : []),
        { title: "Club Tournaments", url: "/tournaments", icon: Trophy },
        { title: "Events", url: "/events", icon: CalendarDays },
        ...(honestyBarEnabled ? [{ title: "Honesty Bar", url: "/honesty-bar", icon: Wine }] : []),
        { title: "Feed", url: "/feed", icon: MessageCircle },
        { title: "My Account", url: "/my-account", icon: Wallet },
      ];

  // Independent collapsible state per group — auto-open the group containing the active route
  const homeAuto = homeItems.some((i) => isActive(i.url)) || pathname === "/";
  const activitiesAuto = activityItems.some((i) => isActive(i.url));

  const [homeOpen, setHomeOpen] = useState<boolean>(homeAuto);
  const [activitiesOpen, setActivitiesOpen] = useState<boolean>(activitiesAuto);

  // Re-open the group containing the active route when navigation changes
  useEffect(() => { if (homeAuto) setHomeOpen(true); }, [homeAuto]);
  useEffect(() => { if (activitiesAuto) setActivitiesOpen(true); }, [activitiesAuto]);

  // Sakana display, uppercase, wider tracking — matches mockup
  const groupHeaderClass =
    "uppercase tracking-[0.22em] text-[11px] font-bold font-heading text-sidebar-foreground";

  const renderSubItem = (item: Item) => (
    <SidebarMenuSubItem key={item.title + item.url}>
      <SidebarMenuSubButton asChild isActive={isActive(item.url)}>
        <NavLink to={item.url} className="flex items-center gap-2">
          <item.icon className="w-3.5 h-3.5 shrink-0" />
          <span className="uppercase tracking-[0.14em] text-[10px] font-semibold font-heading">
            {item.title}
          </span>
        </NavLink>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );

  const memberName = activeMember?.name || profile?.name || "Player";
  const initials = memberName
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const avatarUrl = (activeMember as any)?.avatar_url || (profile as any)?.avatar_url || null;

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border bg-[hsl(220_45%_5%)]"
    >
      <SidebarContent className="gap-0 pt-6 px-1 bg-[hsl(220_45%_5%)]">
        {/* HOME group — label navigates to dashboard, chevron toggles */}
        <SidebarGroup className="px-2">
          <div
            className={cn(
              "flex items-center justify-between w-full py-2",
              groupHeaderClass,
              homeOpen && "border-b-2 border-[hsl(var(--accent))] pb-1.5"
            )}
          >
            <NavLink
              to="/"
              className="flex items-center gap-2 flex-1 hover:opacity-80"
            >
              <Home className="w-4 h-4" />
              {!collapsed && <span>Home</span>}
            </NavLink>
            {!collapsed && (
              <button
                type="button"
                onClick={() => setHomeOpen((v) => !v)}
                aria-label={homeOpen ? "Collapse Home" : "Expand Home"}
                className="p-1 -m-1 hover:opacity-80"
              >
                <ChevronDown
                  className={cn("w-4 h-4 transition-transform", homeOpen && "rotate-180")}
                />
              </button>
            )}
          </div>
          {!collapsed && homeOpen && (
            <SidebarGroupContent className="mt-1.5">
              <SidebarMenuSub className="border-l-0 ml-1.5 px-0">
                {homeItems.map(renderSubItem)}
              </SidebarMenuSub>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        {/* COURTS — single link */}
        <SidebarGroup className="px-2 mt-3">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/bookings")}
                  className="py-2"
                >
                  <NavLink to="/bookings" className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4" />
                    {!collapsed && (
                      <span className={groupHeaderClass}>Courts</span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ACTIVITIES group — collapsible */}
        <SidebarGroup className="px-2 mt-3">
          <button
            type="button"
            onClick={() => setActivitiesOpen((v) => !v)}
            className={cn(
              "flex items-center justify-between w-full py-2 group",
              groupHeaderClass,
              activitiesOpen && "border-b-2 border-[hsl(var(--accent))] pb-1.5"
            )}
          >
            <span className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              {!collapsed && <span>Activities</span>}
            </span>
            {!collapsed && (
              <ChevronDown
                className={cn("w-4 h-4 transition-transform", activitiesOpen && "rotate-180")}
              />
            )}
          </button>
          {!collapsed && activitiesOpen && (
            <SidebarGroupContent className="mt-1.5">
              <SidebarMenuSub className="border-l-0 ml-1.5 px-0">
                {activityItems.map(renderSubItem)}
              </SidebarMenuSub>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        {/* CLUB ADMIN — single link, only if user has admin access */}
        {hasAnyAdminAccess && (
          <SidebarGroup className="px-2 mt-3">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/club-admin")}
                    className="py-2"
                  >
                    <NavLink to="/club-admin" className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      {!collapsed && (
                        <span className={groupHeaderClass}>Club Admin</span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* SETTINGS pinned at bottom with member avatar */}
      <SidebarFooter className="border-t border-sidebar-border bg-[hsl(220_45%_5%)] px-2 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/settings")} className="py-2 gap-3">
              <NavLink to="/settings" className="flex items-center gap-3">
                <Avatar className="h-7 w-7 ring-1 ring-sidebar-border">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={memberName} /> : null}
                  <AvatarFallback className="bg-sidebar-accent text-[10px] font-semibold">
                    {initials || <User className="w-3.5 h-3.5" />}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <span className="uppercase tracking-[0.22em] text-[13px] font-bold font-heading">
                    Settings
                  </span>
                )}
                {!collapsed && (
                  <SettingsIcon className="w-4 h-4 ml-auto opacity-70" />
                )}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
