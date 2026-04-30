import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

/**
 * Wraps authenticated app routes with a left sidebar on desktop (>= md).
 * On mobile, renders children unchanged so the existing bottom nav and
 * mobile dashboard are preserved exactly as before.
 */
export function DesktopShell({
  children,
  enabled,
}: {
  children: React.ReactNode;
  /** When false (e.g. on TV/admin/auth routes), bypass the shell entirely */
  enabled: boolean;
}) {
  const isMobile = useIsMobile();

  if (!enabled || isMobile) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-10 flex items-center border-b border-border bg-background/60 backdrop-blur sticky top-0 z-30">
            <SidebarTrigger className="ml-2" />
          </header>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
