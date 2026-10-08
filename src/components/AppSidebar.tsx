import { useState, type ComponentType } from "react";
import { BarChart3, Calendar, CalendarDays, Crosshair, Home, LayoutGrid, Network, Receipt, Settings as SettingsIcon, ListOrdered, ShieldCheck, Trophy, User, Users, Wallet, Wine } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useSidebarFlags } from "@/hooks/use-sidebar-flags";
import { useProfile } from "@/hooks/use-data";
import { useMemberContext } from "@/contexts/MemberContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AppVersionBadge from "@/components/AppVersionBadge";
import { useClubContext } from "@/contexts/ClubContext";
import { useMenuPrefs } from "@/hooks/use-menu-prefs";
import { applyOrder, visibleOnly } from "@/lib/menu-order";
import { MenuOrderEditor } from "@/components/MenuOrderEditor";

type Item = { title: string; url: string; icon: ComponentType<{ className?: string }> };

export function AppSidebar({ variant = "sidebar" }: { variant?: "sidebar" | "floating" | "inset" }) {
  const { pathname, search } = useLocation();
  const { hasLeagues, honestyBarEnabled, hasAnyAdminAccess, isAssociation, bookingsEnabled, ladderEnabled, tournamentsEnabled, eventsEnabled } = useSidebarFlags();
  const { data: profile } = useProfile();
  const { activeMember } = useMemberContext();
  const isActive = (path: string) => path.includes("?") ? `${pathname}${search}` === path : pathname === path;
  const dashboardTabUrl = (tab: string) => {
    const params = new URLSearchParams(search);
    params.set("tab", tab);
    return `/?${params.toString()}`;
  };
  const homeItems: Item[] = isAssociation
    ? [{ title: "Affiliated Clubs", url: dashboardTabUrl("affiliated"), icon: Network }, { title: "Members", url: dashboardTabUrl("members"), icon: Users }, { title: "Fees Owing", url: dashboardTabUrl("fees"), icon: Receipt }]
    : [{ title: "Stats", url: "/analytics", icon: BarChart3 }, ...(bookingsEnabled ? [{ title: "Bookings", url: "/bookings", icon: Calendar }] : [])];
  const activityItems: Item[] = isAssociation
    ? [{ title: "Leagues", url: "/league-games", icon: Trophy }, { title: "Tournaments", url: "/tournaments", icon: Trophy }, { title: "Events", url: "/events", icon: CalendarDays }, { title: "My Account", url: "/my-account", icon: Wallet }]
    : [{ title: "Score a Match", url: "/match-marker", icon: Crosshair }, ...(ladderEnabled ? [{ title: "Club Ladderboard", url: "/ladder", icon: Trophy }] : []), ...(hasLeagues ? [{ title: "Leagues", url: "/league-games", icon: Trophy }] : []), ...(tournamentsEnabled ? [{ title: "Tournaments", url: "/tournaments", icon: Trophy }] : []), ...(eventsEnabled ? [{ title: "Events", url: "/events", icon: CalendarDays }] : []), ...(honestyBarEnabled ? [{ title: "Bar / POS", url: "/honesty-bar", icon: Wine }] : []), { title: "My Account", url: "/my-account", icon: Wallet }];
  const courtItems: Item[] = isAssociation ? [] : [{ title: "Courts & Bookings", url: "/bookings", icon: LayoutGrid }];
  const adminItems: Item[] = hasAnyAdminAccess && !isAssociation ? [{ title: "Club Admin", url: "/club-admin", icon: ShieldCheck }] : [];
  const { club } = useClubContext();
  const { prefs, canEdit, save } = useMenuPrefs(isAssociation ? "app-sidebar-assoc" : "app-sidebar", club?.id);
  const [editing, setEditing] = useState(false);
  const itemId = (i: Item) => i.title;
  const groups = [
    { key: "home", label: "Home", items: homeItems },
    { key: "courts", label: "Courts", items: courtItems },
    { key: "activities", label: "Activities", items: activityItems },
    { key: "admin", label: "Administration", items: adminItems },
  ].map((g) => ({ ...g, items: visibleOnly(applyOrder(g.items, prefs.groups[g.key], itemId), prefs.hidden, itemId) }));
  const shownGroup = (key: string) => groups.find((g) => g.key === key)!.items;
  const settingsUrl = isAssociation ? dashboardTabUrl("settings") : "/settings";
  const memberName = activeMember?.name || profile?.name || "Player";
  const initials = memberName.split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const memberAvatar = (activeMember as unknown as { avatar_url?: string | null } | null)?.avatar_url;
  const profileAvatar = (profile as unknown as { avatar_url?: string | null } | null)?.avatar_url;
  const avatarUrl = memberAvatar || profileAvatar || null;
  const renderItems = (items: Item[]) => items.map((item) => {
    const Icon = item.icon;
    return <SidebarMenuItem key={item.title + item.url}><SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}><NavLink to={item.url}><Icon className="size-4" /><span>{item.title}</span></NavLink></SidebarMenuButton></SidebarMenuItem>;
  });

  return (
    <Sidebar variant={variant} collapsible="offcanvas" className="border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild size="lg" className="data-[slot=sidebar-menu-button]:!p-1.5"><NavLink to="/">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Home className="size-4" /></div>
          <div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-semibold">SquashHub</span><span className="truncate text-xs text-sidebar-foreground/60">Club platform</span></div>
        </NavLink></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {shownGroup("home").length > 0 && <SidebarGroup><SidebarGroupLabel>Home</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{renderItems(shownGroup("home"))}</SidebarMenu></SidebarGroupContent></SidebarGroup>}
        {shownGroup("courts").length > 0 && <SidebarGroup><SidebarGroupLabel>Courts</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{renderItems(shownGroup("courts"))}</SidebarMenu></SidebarGroupContent></SidebarGroup>}
        {shownGroup("activities").length > 0 && <SidebarGroup><SidebarGroupLabel>Activities</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{renderItems(shownGroup("activities"))}</SidebarMenu></SidebarGroupContent></SidebarGroup>}
        {shownGroup("admin").length > 0 && <SidebarGroup className="mt-auto"><SidebarGroupLabel>Administration</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{renderItems(shownGroup("admin"))}</SidebarMenu></SidebarGroupContent></SidebarGroup>}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild size="lg" isActive={isActive(settingsUrl)}><NavLink to={settingsUrl}>
          <Avatar className="size-8 rounded-lg">{avatarUrl ? <AvatarImage src={avatarUrl} alt={memberName} /> : null}<AvatarFallback className="rounded-lg bg-sidebar-accent text-xs">{initials || <User className="size-4" />}</AvatarFallback></Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-semibold">{memberName}</span><span className="truncate text-xs text-sidebar-foreground/60">Account settings</span></div><SettingsIcon className="ml-auto size-4" />
        </NavLink></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        {canEdit && <SidebarMenu><SidebarMenuItem><SidebarMenuButton onClick={() => setEditing(true)} tooltip="Edit menu"><ListOrdered className="size-4" /><span>Edit menu</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>}
        <AppVersionBadge className="px-2 text-sidebar-foreground/50" />
        <MenuOrderEditor open={editing} onOpenChange={setEditing} prefs={prefs} onSave={(p) => save.mutateAsync(p)}
          groups={[{ key: "home", label: "Home", items: homeItems }, { key: "courts", label: "Courts", items: courtItems }, { key: "activities", label: "Activities", items: activityItems }, { key: "admin", label: "Administration", items: adminItems }]
            .map((g) => ({ key: g.key, label: g.label, items: g.items.map((i) => ({ id: itemId(i), label: i.title, icon: i.icon })) }))} />
      </SidebarFooter>
    </Sidebar>
  );
}
