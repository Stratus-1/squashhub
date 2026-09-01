import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useMyClub } from "@/hooks/use-club";
import { useLocation } from "react-router-dom";
import squashCourtBg from "@/assets/squash-court-bg.jpg";
import { SuperAdminMenu } from "@/components/SuperAdminMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteHeader } from "@/components/site-header";

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
  const isHome = pathname === "/" || pathname === "/dashboard";

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider defaultOpen>
        {/* Sidebar is hidden on mobile so rotation between portrait/landscape
            doesn't remount the page tree and lose in-page state (active tabs etc.) */}
        {!isMobile && <AppSidebar variant="inset" />}
        <SidebarInset className="min-w-0 overflow-hidden">
          <div className="flex min-h-svh flex-col relative isolate">
          {!skipBg && !isMobile && (
            <>
              {/* Layer 1: photo background — confined to main content panel */}
              <div
                className="absolute inset-0 z-0 bg-cover bg-center pointer-events-none"
                style={{ backgroundImage: `url(${squashCourtBg})` }}
                aria-hidden="true"
              />
              {/* Layer 2: club logo watermark (very subtle on light bg) */}
              {clubLogoUrl && (
                <div
                  className="absolute inset-0 z-[1] bg-center bg-no-repeat opacity-[0.08] pointer-events-none"
                  style={{
                    backgroundImage: `url(${clubLogoUrl})`,
                    backgroundSize: "min(60vw, 520px)",
                  }}
                  aria-hidden="true"
                />
              )}
              {/* Layer 3: near-opaque light wash so the photo reads as a faint texture, not a dark overlay */}
              <div
                className="absolute inset-0 z-[2] pointer-events-none bg-slate-100/95 dark:bg-[rgba(17,28,55,0.7)]"
                aria-hidden="true"
              />

            </>
          )}
          {!isMobile && (
            <div className="relative z-10 sticky top-0 bg-background/70 backdrop-blur">
              <SiteHeader title={isHome ? "Dashboard" : "SquashHub"}>
                <ThemeToggle />
                <SuperAdminMenu />
              </SiteHeader>
            </div>
          )}
            <div className="relative z-10 flex-1 min-w-0">{children}</div>
          </div>
        </SidebarInset>
    </SidebarProvider>
  );
}
