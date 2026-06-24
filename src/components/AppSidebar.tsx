import {
  Home,
  BarChart3,
  Calendar,
  Trophy,
  Crosshair,
  CalendarDays,
  Wine,
  Wallet,
  ShieldCheck,
  Settings as SettingsIcon,
  Activity,
  LayoutGrid,
  ChevronRight,
  User,
  Network,
  Users,
  Receipt,
  LayoutDashboard,
  Building2,
  DollarSign,
  Landmark,
  Banknote,
  ListOrdered,
  Medal,
  UserCheck,
  Globe,
  Beer,
  DoorOpen,
  Mail,
  Sparkles,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
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
  const { state, setOpen, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { hasLeagues, honestyBarEnabled, hasAnyAdminAccess, isAssociation } = useSidebarFlags();
  const { data: profile } = useProfile();
  const { activeMember } = useMemberContext();

  const isActive = (path: string) => {
    if (path.includes("?")) return `${pathname}${search}` === path;
    return pathname === path;
  };

  const dashboardTabUrl = (tab: string) => {
    const params = new URLSearchParams(search);
    params.set("tab", tab);
    const query = params.toString();
    return query ? `/?${query}` : "/";
  };

  const settingsUrl = isAssociation ? dashboardTabUrl("settings") : "/settings";

  const homeItems: Item[] = isAssociation
    ? [
        { title: "Affiliated Clubs", url: dashboardTabUrl("affiliated"), icon: Network },
        { title: "Members", url: dashboardTabUrl("members"), icon: Users },
        { title: "Fees Owing", url: dashboardTabUrl("fees"), icon: Receipt },
      ]
    : [
        { title: "Stats", url: "/analytics", icon: BarChart3 },
        { title: "Bookings", url: "/bookings", icon: Calendar },
      ];

  const activityItems: Item[] = isAssociation
    ? [
        { title: "Leagues", url: "/league-games", icon: Trophy },
        { title: "Tournaments", url: "/tournaments", icon: Trophy },
        { title: "Events", url: "/events", icon: CalendarDays },
        { title: "My Account", url: "/my-account", icon: Wallet },
      ]
    : [
        { title: "Mark a Game", url: "/match-marker", icon: Crosshair },
        { title: "Club Ladderboard", url: "/ladder", icon: Trophy },
        ...(hasLeagues ? [{ title: "Leagues", url: "/league-games", icon: Trophy }] : []),
        { title: "Club Tournaments", url: "/tournaments", icon: Trophy },
        { title: "Events", url: "/events", icon: CalendarDays },
        ...(honestyBarEnabled ? [{ title: "Honesty Bar", url: "/honesty-bar", icon: Wine }] : []),
        { title: "My Account", url: "/my-account", icon: Wallet },
      ];

  const adminItems: Item[] = [
    { title: "Dashboard", url: "/club-admin", icon: LayoutDashboard },
    { title: "Club Info", url: "/club-admin?tab=club", icon: Building2 },
    { title: "Members", url: "/club-admin?tab=members", icon: Users },
    { title: "Users", url: "/club-admin?tab=users", icon: UserCheck },
    { title: "Visitors", url: "/club-admin?tab=visitors", icon: Globe },
    { title: "Courts", url: "/club-admin?tab=courts", icon: LayoutGrid },
    { title: "Fees", url: "/club-admin?tab=fees", icon: DollarSign },
    { title: "Banking", url: "/club-admin?tab=banking", icon: Banknote },
    { title: "Finance", url: "/club-admin?tab=finance", icon: Landmark },
    { title: "Ladder", url: "/club-admin?tab=ladder", icon: ListOrdered },
    { title: "Ranking Pts", url: "/club-admin?tab=ranking-points", icon: Sparkles },
    ...(hasLeagues ? [{ title: "Leagues", url: "/club-admin?tab=leagues", icon: Trophy }] : []),
    { title: "Tournaments", url: "/club-admin?tab=champs", icon: Medal },
    ...(honestyBarEnabled ? [{ title: "Honesty Bar", url: "/club-admin?tab=bar", icon: Beer }] : []),
    { title: "Access", url: "/club-admin?tab=access", icon: DoorOpen },
    { title: "Comms", url: "/club-admin?tab=comms", icon: Mail },
    { title: "Permissions", url: "/club-admin?tab=permissions", icon: ShieldCheck },
    { title: "Settings", url: "/club-admin?tab=settings", icon: SettingsIcon },
  ];

  // Auto-open the group containing the active route only on first mount / route change
  const homeAuto = useMemo(() => homeItems.some((i) => isActive(i.url)) || pathname === "/", [pathname, search]);
  const activitiesAuto = useMemo(() => activityItems.some((i) => isActive(i.url)), [pathname, search]);
  const adminAuto = useMemo(() => pathname === "/club-admin" || adminItems.some((i) => isActive(i.url)), [pathname, search]);

  const [homeOpen, setHomeOpen] = useState<boolean>(homeAuto);
  const [activitiesOpen, setActivitiesOpen] = useState<boolean>(activitiesAuto);
  const [adminOpen, setAdminOpen] = useState<boolean>(adminAuto);

  // When the route changes INTO a group, expand it — but never force-close groups the user opened
  useEffect(() => { if (homeAuto) setHomeOpen(true); }, [homeAuto]);
  useEffect(() => { if (activitiesAuto) setActivitiesOpen(true); }, [activitiesAuto]);
  useEffect(() => { if (adminAuto) setAdminOpen(true); }, [adminAuto]);

  // When sidebar collapses to icon mode, suppress label rendering but keep state intact
  const closeMobileSidebar = () => { if (isMobile) setOpenMobile(false); };

  const groupHeaderClass =
    "uppercase tracking-[0.22em] text-[11px] font-bold font-heading text-sidebar-foreground";

  const renderSubItem = (item: Item) => (
    <SidebarMenuSubItem key={item.title + item.url}>
      <SidebarMenuSubButton asChild isActive={isActive(item.url)}>
        <NavLink to={item.url} onClick={closeMobileSidebar} className="flex items-center gap-2">
          <item.icon className="w-3.5 h-3.5 shrink-0" />
          <span className="uppercase tracking-[0.14em] text-[10px] font-semibold font-heading">
            {item.title}
          </span>
        </NavLink>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );

  /**
   * Industry-standard group header:
   * - Whole row toggles the group open/closed (single click target)
   * - When sidebar is icon-collapsed, clicking expands the sidebar AND opens the group
   * - If a `landingUrl` exists, a separate icon nav-link navigates to it
   */
  const renderGroupHeader = (opts: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    open: boolean;
    setOpen: (v: boolean) => void;
    landingUrl?: string;
  }) => {
    const Icon = opts.icon;
    const handleHeaderClick = () => {
      if (collapsed) {
        // Expand sidebar + open group
        setOpen(true);
        opts.setOpen(true);
        return;
      }
      opts.setOpen(!opts.open);
    };

    return (
      <div
        className={cn(
          "flex items-center w-full py-2",
          groupHeaderClass,
          opts.open && !collapsed && "border-b-2 border-[hsl(var(--accent))] pb-1.5"
        )}
      >
        {opts.landingUrl ? (
          <NavLink
            to={opts.landingUrl}
            onClick={closeMobileSidebar}
            aria-label={opts.label}
            className="p-1 -m-1 hover:opacity-80 shrink-0"
          >
            <Icon className="w-4 h-4" />
          </NavLink>
        ) : (
          <Icon className="w-4 h-4 shrink-0" />
        )}
        <button
          type="button"
          onClick={handleHeaderClick}
          aria-expanded={opts.open}
          aria-label={`${opts.open ? "Collapse" : "Expand"} ${opts.label}`}
          className="flex items-center justify-between flex-1 ml-2 hover:opacity-80"
        >
          {!collapsed && <span className="flex-1 text-left">{opts.label}</span>}
          {!collapsed && (
            <ChevronRight
              className={cn("w-4 h-4 transition-transform", opts.open && "rotate-90")}
            />
          )}
        </button>
      </div>
    );
  };

  const memberName = activeMember?.name || profile?.name || "Player";
  const initials = memberName
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const avatarUrl = (activeMember as any)?.avatar_url || (profile as any)?.avatar_url || null;

  // In collapsed (icon) mode, render flat icon menu items (with tooltips) so navigation still works.
  const renderCollapsedFlatMenu = (items: Item[]) => (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title + item.url}>
          <SidebarMenuButton
            asChild
            isActive={isActive(item.url)}
            tooltip={item.title}
          >
            <NavLink to={item.url} onClick={closeMobileSidebar}>
              <item.icon className="w-4 h-4" />
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border bg-[hsl(220_45%_5%)]"
    >
      <SidebarContent className="gap-0 pt-6 px-1 bg-[hsl(220_45%_5%)]">
        {/* HOME */}
        <SidebarGroup className="px-2">
          {renderGroupHeader({
            label: "Home",
            icon: Home,
            open: homeOpen,
            setOpen: setHomeOpen,
            landingUrl: "/",
          })}
          {homeOpen && !collapsed && (
            <SidebarGroupContent className="mt-1.5">
              <SidebarMenuSub className="border-l-0 ml-1.5 px-0">
                {homeItems.map(renderSubItem)}
              </SidebarMenuSub>
            </SidebarGroupContent>
          )}
          {collapsed && (
            <SidebarGroupContent className="mt-1.5">
              {renderCollapsedFlatMenu(homeItems)}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        {/* COURTS — single item, hidden for association tenants */}
        {!isAssociation && (
          <SidebarGroup className="px-2 mt-3">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/bookings")}
                    className="py-2"
                    tooltip="Courts"
                  >
                    <NavLink to="/bookings" onClick={closeMobileSidebar} className="flex items-center gap-2">
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
        )}

        {/* ACTIVITIES */}
        <SidebarGroup className="px-2 mt-3">
          {renderGroupHeader({
            label: "Activities",
            icon: Activity,
            open: activitiesOpen,
            setOpen: setActivitiesOpen,
          })}
          {activitiesOpen && !collapsed && (
            <SidebarGroupContent className="mt-1.5">
              <SidebarMenuSub className="border-l-0 ml-1.5 px-0">
                {activityItems.map(renderSubItem)}
              </SidebarMenuSub>
            </SidebarGroupContent>
          )}
          {collapsed && (
            <SidebarGroupContent className="mt-1.5">
              {renderCollapsedFlatMenu(activityItems)}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        {/* CLUB ADMIN */}
        {hasAnyAdminAccess && !isAssociation && (
          <SidebarGroup className="px-2 mt-3">
            {renderGroupHeader({
              label: "Club Admin",
              icon: ShieldCheck,
              open: adminOpen,
              setOpen: setAdminOpen,
              landingUrl: "/club-admin",
            })}
            {adminOpen && !collapsed && (
              <SidebarGroupContent className="mt-1.5">
                <SidebarMenuSub className="border-l-0 ml-1.5 px-0">
                  {adminItems.map(renderSubItem)}
                </SidebarMenuSub>
              </SidebarGroupContent>
            )}
            {collapsed && (
              <SidebarGroupContent className="mt-1.5">
                {renderCollapsedFlatMenu(adminItems)}
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* SETTINGS */}
      <SidebarFooter className="border-t border-sidebar-border bg-[hsl(220_45%_5%)] px-2 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive(settingsUrl)}
              className="py-2 gap-3"
              tooltip="Settings"
            >
              <NavLink to={settingsUrl} onClick={closeMobileSidebar} className="flex items-center gap-3">
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
