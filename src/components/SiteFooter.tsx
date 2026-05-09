import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useMyClub } from "@/hooks/use-club";
import { useAuth } from "@/contexts/AuthContext";

function getPrivacyContactEmail() {
  return (import.meta.env.VITE_PRIVACY_CONTACT_EMAIL as string | undefined)?.trim() || "";
}

export function SiteFooter({ compact = false, withBottomNav = false }: { compact?: boolean; withBottomNav?: boolean }) {
  const email = getPrivacyContactEmail();
  const year = new Date().getFullYear();
  const location = useLocation();
  const { user } = useAuth();
  const { data: clubData } = useMyClub();

  const isHome = location.pathname === "/" || location.pathname === "/home";
  const brandName = isHome || !user
    ? "SquashHub"
    : clubData?.club?.name || "SquashHub";

  return (
    <footer className={cn(
      "border-t border-border/60 bg-background/80 backdrop-blur",
      withBottomNav && "pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]"
    )}>
      <div className="px-4 sm:px-6 lg:px-[5%] py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            <span>© {year} {brandName}</span>
            {!compact && (
              <>
                <span className="mx-2">·</span>
                <span>POPIA-aligned privacy controls</span>
              </>
            )}
          </div>

          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <Link to="/privacy" className="text-muted-foreground hover:text-foreground underline decoration-muted-foreground/30 hover:decoration-muted-foreground">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-muted-foreground hover:text-foreground underline decoration-muted-foreground/30 hover:decoration-muted-foreground">
              Terms of Use
            </Link>
            <Link to="/#contact" className="text-muted-foreground hover:text-foreground underline decoration-muted-foreground/30 hover:decoration-muted-foreground">
              Support
            </Link>
            {email ? (
              <a
                href={`mailto:${email}`}
                className="text-muted-foreground hover:text-foreground underline decoration-muted-foreground/30 hover:decoration-muted-foreground"
              >
                Privacy contact
              </a>
            ) : null}
          </nav>
        </div>
      </div>
    </footer>
  );
}