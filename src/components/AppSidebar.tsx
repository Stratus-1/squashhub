import {
  LayoutDashboard,
  Calendar,
  LayoutGrid,
  Crosshair,
  ListOrdered,
  Trophy,
  Medal,
  CalendarDays,
  Wine,
  Wallet,
  Users,
  Building2,
  DollarSign,
  Landmark,
  Banknote,
  UserCheck,
  Globe,
  Beer,
  DoorOpen,
  Mail,
  Sparkles,
  ShieldCheck,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronRight,
  User,
  Network,
  Receipt,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useState, useMemo, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
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
import { useProfile } from "@/hooks/use-data";
import { useMemberContext } from "@/contexts/MemberContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import shLogo from "@/assets/sh-logo.png";

type Item = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: Item[];
};

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const { pathname, search } = useLocation();
  const { hasLeagues, honestyBarEnabled, hasAnyAdminAccess, isAssociation } = useSidebarFlags();
  const { data: profile } = useProfile();
  const { activeMember } = useMemberContext();

  const isActive = (path: string) => {
    if (path.includes("?")) return `${pathname}${search}` === path;
    return pathname === path;
  };

  const closeMobile = () => { if (isMobile) setOpenMobile(false); };

  const dashboardTabUrl = (tab: string) => {
    const params = new URLSearchParams(search);
    params.set("tab", tab);
    return `/?${params.toString()}`;
  };

  const settingsUrl = isAssociation ? dashboardTabUrl("settings") : "/settings";

  // HOME
  const homeItems: Item[] = isAssociation
    ? [
        { title: "Dashboard", url: "/", icon: LayoutDashboard },
        { title: "Affiliated Clubs", url: dashboardTabUrl("affiliated"), icon: Network },
        { title: "Members", url: dashboardTabUrl("members"), icon: Users },
        { title: "Fees Owing", url: dashboardTabUrl("fees"), icon: Receipt },
      ]
    : [
        { title: "Dashboard", url: "/", icon: LayoutDashboard },
        { title: "Bookings", url: "/bookings", icon: Calendar },
        { title: "Courts", url: "/bookings", icon: LayoutGrid },
      ];

  // ACTIVITIES
  const activityItems: Item[] = isAssociation
    ? [
        { title: "Leagues", url: "/league-games", icon: Trophy },
        { title: "Tournaments", url: "/tournaments", icon: Medal },
        { title: "Events", url: "/events", icon: CalendarDays },
      ]
    : [
        { title: "Mark a Game", url: "/match-marker", icon: Crosshair },
        { title: "Ladder", url: "/ladder", icon: ListOrdered },
        ...(hasLeagues ? [{ title: "Leagues", url: "/league-games", icon: Trophy }] : []),
        { title: "Tournaments", url: "/tournaments", icon: Medal },
        { title: "Events", url: "/events", icon: CalendarDays },
        ...(honestyBarEnabled ? [{ title: "Honesty Bar", url: "/honesty-bar", icon: Wine }] : []),
      ];

  // MY ACCOUNT
  const accountItems: Item[] = [
    { title: "My Account", url: "/my-account", icon: Wallet },
  ];

  // CLUB ADMIN — grouped to allow chevron sub-menus matching the mockup
  const competitionsChildren: Item[] = [
    { title: "Ladder", url: "/club-admin?tab=ladder", icon: ListOrdered },
    { title: "Ranking Pts", url: "/club-admin?tab=ranking-points", icon: Sparkles },
    ...(hasLeagues ? [{ title: "Leagues", url: "/club-admin?tab=leagues", icon: Trophy }] : []),
    { title: "Tournaments", url: "/club-admin?tab=champs", icon: Medal },
  ];

  const financeChildren: Item[] = [
    { title: "Fees", url: "/club-admin?tab=fees", icon: DollarSign },
    { title: "Banking", url: "/club-admin?tab=banking", icon: Banknote },
    { title: "Finance", url: "/club-admin?tab=finance", icon: Landmark },
  ];

  const integrationsChildren: Item[] = [
    { title: "Access", url: "/club-admin?tab=access", icon: DoorOpen },
    ...(honestyBarEnabled ? [{ title: "Honesty Bar", url: "/club-admin?tab=bar", icon: Beer }] : []),
  ];

  const settingsChildren: Item[] = [
    { title: "Club Info", url: "/club-admin?tab=club", icon: Building2 },
    { title: "Permissions", url: "/club-admin?tab=permissions", icon: ShieldCheck },
    { title: "General", url: "/club-admin?tab=settings", icon: SettingsIcon },
  ];

  const adminItems: Item[] = [
    { title: "Dashboard", url: "/club-admin", icon: LayoutDashboard },
    { title: "Members", url: "/club-admin?tab=members", icon: Users },
    { title: "Users", url: "/club-admin?tab=users", icon: UserCheck },
    { title: "Visitors", url: "/club-admin?tab=visitors", icon: Globe },
    { title: "Courts", url: "/club-admin?tab=courts", icon: LayoutGrid },
    { title: "Competitions", url: "/club-admin?tab=ladder", icon: Trophy, children: competitionsChildren },
    { title: "Finance", url: "/club-admin?tab=fees", icon: DollarSign, children: financeChildren },
    { title: "Communications", url: "/club-admin?tab=comms", icon: Mail },
    { title: "Integrations", url: "/club-admin?tab=access", icon: DoorOpen, children: integrationsChildren },
    { title: "Settings", url: "/club-admin?tab=settings", icon: SettingsIcon, children: settingsChildren },
  ];

  // Track which expandable admin groups are open. Auto-open the one containing the active route.
  const initialOpen = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const it of adminItems) {
      if (it.children) {
        out[it.title] = it.children.some((c) => isActive(c.url));
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(initialOpen);

  // When the route changes INTO a child, expand its parent (never force-close user-opened groups)
  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const it of adminItems) {
        if (it.children && it.children.some((c) => isActive(c.url)) && !next[it.title]) {
          next[it.title] = true;
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search]);

  const memberName = activeMember?.name || profile?.name || "Player";
  const initials = memberName
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const avatarUrl = (activeMember as any)?.avatar_url || (profile as any)?.avatar_url || null;
  const roleLabel = (activeMember as any)?.role === "admin" ? "Club Administrator" : ((activeMember as any)?.role === "captain" ? "Club Captain" : "Member");

  // -- styling helpers --
  const sectionLabelClass = "px-3 pt-4 pb-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase text-white/40";

  const itemBase = "flex items-center gap-3 w-full rounded-md px-3 py-2 text-[13px] font-medium transition-colors";
  const itemIdle = "text-white/75 hover:bg-white/5 hover:text-white";
  const itemActive = "bg-[hsl(220_30%_18%)] text-white font-semibold";

  const renderLeafItem = (item: Item, depth = 0) => (
    <SidebarMenuItem key={item.title + item.url}>
      <NavLink
        to={item.url}
        onClick={closeMobile}
        className={cn(
          itemBase,
          isActive(item.url) ? itemActive : itemIdle,
          depth > 0 && "pl-9 py-1.5 text-[12px]",
        )}
      >
        <item.icon className={cn("shrink-0", depth > 0 ? "w-3.5 h-3.5" : "w-4 h-4")} />
        {!collapsed && <span className="truncate">{item.title}</span>}
      </NavLink>
    </SidebarMenuItem>
  );

  const renderExpandableItem = (item: Item) => {
    const open = !!openMap[item.title];
    const childActive = item.children!.some((c) => isActive(c.url));
    return (
      <div key={item.title}>
        <SidebarMenuItem>
          <button
            type="button"
            onClick={() => setOpenMap((p) => ({ ...p, [item.title]: !p[item.title] }))}
            aria-expanded={open}
            className={cn(
              itemBase,
              childActive ? itemActive : itemIdle,
              "justify-between",
            )}
          >
            <span className="flex items-center gap-3">
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.title}</span>}
            </span>
            {!collapsed && (
              <ChevronDown
                className={cn("w-3.5 h-3.5 opacity-60 transition-transform", open && "rotate-180")}
              />
            )}
          </button>
        </SidebarMenuItem>
        {open && !collapsed && (
          <div className="mt-0.5 mb-1">
            {item.children!.map((c) => renderLeafItem(c, 1))}
          </div>
        )}
      </div>
    );
  };

  const renderSection = (label: string, items: Item[]) => (
    <SidebarGroup className="py-0">
      {!collapsed && <div className={sectionLabelClass}>{label}</div>}
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5 px-2">
          {items.map((it) => (it.children ? renderExpandableItem(it) : renderLeafItem(it)))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-white/5"
    >
      {/* Brand */}
      <SidebarHeader className="bg-[hsl(220_45%_5%)] px-4 pt-5 pb-4 border-b border-white/5">
        <NavLink to="/" onClick={closeMobile} className="flex items-center gap-2.5">
          <img src={shLogo} alt="SquashHub" className="h-7 w-7 shrink-0" />
          {!collapsed && (
            <span className="text-white font-extrabold tracking-[0.18em] text-[15px] font-heading">
              SQUASHHUB
            </span>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="bg-[hsl(220_45%_5%)] gap-0">
        {renderSection("Home", homeItems)}
        {renderSection("Activities", activityItems)}
        {renderSection("My Account", accountItems)}
        {hasAnyAdminAccess && !isAssociation && renderSection("Club Admin", adminItems)}
      </SidebarContent>

      {/* User card pinned at the bottom */}
      <SidebarFooter className="bg-[hsl(220_45%_5%)] border-t border-white/5 p-3">
        <NavLink
          to={settingsUrl}
          onClick={closeMobile}
          className={cn(
            "flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5 transition-colors",
            isActive(settingsUrl) && "bg-white/5"
          )}
        >
          <Avatar className="h-9 w-9 ring-1 ring-white/10">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={memberName} /> : null}
            <AvatarFallback className="bg-indigo-600 text-white text-[11px] font-semibold">
              {initials || <User className="w-4 h-4" />}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white truncate leading-tight">{memberName}</p>
              <p className="text-[11px] text-white/50 truncate">{roleLabel}</p>
            </div>
          )}
          {!collapsed && <ChevronRight className="w-4 h-4 text-white/40" />}
        </NavLink>
      </SidebarFooter>
    </Sidebar>
  );
}
