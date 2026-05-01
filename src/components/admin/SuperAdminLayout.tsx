import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "./SuperAdminSidebar";
import shLogo from "@/assets/sh-logo.png";

export function SuperAdminLayout() {
  return (
    <SidebarProvider>
      <div
        className="admin-shell min-h-screen flex w-full"
        style={{
          background:
            "radial-gradient(1200px 600px at 10% -10%, hsl(223 60% 18%) 0%, transparent 60%), radial-gradient(900px 500px at 110% 110%, hsl(223 70% 14%) 0%, transparent 55%), hsl(223 65% 11%)",
        }}
      >
        <SuperAdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-white/10 px-4 bg-white/5 backdrop-blur-md">
            <SidebarTrigger className="mr-3 text-white/80 hover:text-white" />
            <img src={shLogo} alt="SquashHub" className="h-8 w-8 rounded-lg object-contain mr-2" />
            <h1 className="text-sm font-semibold text-white/90">SquashHub Super Admin</h1>
          </header>
          <main className="flex-1 overflow-auto p-6 text-white/90">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
