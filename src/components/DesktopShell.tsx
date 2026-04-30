import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useMyClub } from "@/hooks/use-club";
import { useLocation } from "react-router-dom";
import squashCourtBg from "@/assets/squash-court-bg.jpg";

/**
 * Wraps authenticated app routes with a left sidebar on desktop (>= md).
 * On mobile, renders children unchanged so the existing bottom nav and
 * mobile dashboard are preserved exactly as before.
 *
 * Applies a global 3-layer background (court photo → club logo watermark →
 * #111C37 @ 70% overlay) to every page rendered inside the shell.
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
  const { data: clubData } = useMyClub();
  const clubLogoUrl = (clubData?.club as any)?.logo_url as string | undefined;
  const { pathname } = useLocation();
  // Routes where the layered background should NOT apply (keep original look)
  const skipBg = pathname.startsWith("/bookings");

  if (!enabled || isMobile) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 relative isolate">
          {!skipBg && (
            <>
              {/* Layer 1: photo background — confined to main content panel */}
              <div
                className="absolute inset-0 z-0 bg-cover bg-center pointer-events-none"
                style={{ backgroundImage: `url(${squashCourtBg})` }}
                aria-hidden="true"
              />
              {/* Layer 2: club logo watermark */}
              {clubLogoUrl && (
                <div
                  className="absolute inset-0 z-[1] bg-center bg-no-repeat opacity-30 pointer-events-none"
                  style={{
                    backgroundImage: `url(${clubLogoUrl})`,
                    backgroundSize: "min(60vw, 520px)",
                  }}
                  aria-hidden="true"
                />
              )}
              {/* Layer 3: color overlay #111C37 @ 70% */}
              <div
                className="absolute inset-0 z-[2] pointer-events-none"
                style={{ backgroundColor: "rgba(17, 28, 55, 0.7)" }}
                aria-hidden="true"
              />
            </>
          )}
          <header className="relative z-10 h-10 flex items-center border-b border-border/40 bg-background/40 backdrop-blur sticky top-0">
            <SidebarTrigger className="ml-2" />
          </header>
          <main className="relative z-10 flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
