import { Building2, LayoutDashboard, Users, CreditCard, Settings, LogOut, ChevronLeft, Trophy } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Clubs & Associations", url: "/admin/clubs", icon: Building2 },
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Leagues", url: "/admin/leagues", icon: Trophy },
  { title: "Subscriptions", url: "/admin/subscriptions", icon: CreditCard },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

export function SuperAdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();

  const isActive = (path: string) => {
    if (path === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-white/10 bg-transparent">
      <SidebarContent className="bg-transparent">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-white/50">
            {!collapsed && "SquashHub Admin"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} className="data-[active=true]:bg-transparent">
                    <NavLink
                      to={item.url}
                      end={item.url === "/admin"}
                      className="rounded-md border border-white/10 bg-white/5 backdrop-blur-md text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                      activeClassName="bg-white/15 border-white/20 text-white shadow-[0_4px_20px_-8px_rgba(0,0,0,0.6)]"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 bg-transparent">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start border border-white/10 bg-white/5 backdrop-blur-md text-white/70 hover:bg-destructive/20 hover:text-white hover:border-destructive/40"
          onClick={() => signOut()}
        >
          <LogOut className="mr-2 h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
