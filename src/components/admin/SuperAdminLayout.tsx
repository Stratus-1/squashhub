import { Outlet } from "react-router-dom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SiteHeader } from "@/components/site-header";
import { SuperAdminSidebar } from "./SuperAdminSidebar";
import shLogo from "@/assets/sh-logo.png";

/**
 * Platform admin shell. Uses the same SidebarProvider + SidebarInset +
 * SiteHeader structure as the member/club shells (shadcn dashboard-01),
 * keeping the dark glass background specific to super admin.
 */
export function SuperAdminLayout() {
  return (
    <SidebarProvider>
      <SuperAdminSidebar />
      <SidebarInset
        className="admin-shell min-w-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 10% -10%, hsl(223 60% 18%) 0%, transparent 60%), radial-gradient(900px 500px at 110% 110%, hsl(223 70% 14%) 0%, transparent 55%), hsl(223 65% 11%)",
        }}
      >
        <div className="flex min-h-svh flex-col min-w-0">
          <div className="sticky top-0 z-10 border-b border-white/10 bg-white/5 backdrop-blur-md text-white/90 [&_h1]:text-white/90">
            <SiteHeader title="SquashHub Super Admin">
              <img src={shLogo} alt="SquashHub" className="h-7 w-7 rounded-lg object-contain" />
            </SiteHeader>
          </div>
          <main className="flex-1 overflow-auto px-4 lg:px-6 text-white/90">
            <Outlet />
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
