import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ClubProvider, useClubContext } from "@/contexts/ClubContext";
import { MemberProvider } from "@/contexts/MemberContext";
import { BottomNav } from "@/components/BottomNav";
import { DesktopShell } from "@/components/DesktopShell";
import { useIsMobile } from "@/hooks/use-mobile";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { NotificationListener } from "@/components/NotificationListener";
import { NotificationActionModal } from "@/components/NotificationActionModal";
import { NativePushListener } from "@/components/NativePushListener";
import { NotificationDeepLinkHandler } from "@/components/NotificationDeepLinkHandler";
import { RealtimeSync } from "@/components/RealtimeSync";
import { OutboxSync } from "@/components/OutboxSync";
import { OfflineBanner } from "@/components/OfflineBanner";
import { FeedbackFab } from "@/components/FeedbackFab";
import { LiveSessionBanner } from "@/components/LiveSessionBanner";

import { ClubBrandedBackground } from "@/components/ClubBrandedBackground";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Bookings from "./pages/Bookings";
import Ladder from "./pages/Ladder";
import Challenges from "./pages/Challenges";
import Profile from "./pages/Profile";
import Notifications from "./pages/Notifications";
import Events from "./pages/Events";
import Tournaments from "./pages/Tournaments";
import EventDetail from "./pages/EventDetail";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import ResetPassword from "./pages/ResetPassword";

import StravaCallback from "./pages/StravaCallback";
import MatchTracker from "./pages/MatchTracker";
import MatchMarker from "./pages/MatchMarker";
import MarkerTv from "./pages/MarkerTv";
import AddMatchResult from "./pages/AddMatchResult";
import PlayerProfile from "./pages/PlayerProfile";
import RegisterClub from "./pages/RegisterClub";
import LeagueSignup from "./pages/LeagueSignup";
import ClubAdmin from "./pages/ClubAdmin";
import ClubChampsView from "./pages/ClubChampsView";
import ClubLanding from "./pages/ClubLanding";
import ClubAuth from "./pages/ClubAuth";
import BookingResponse from "./pages/BookingResponse";
import Achievements from "./pages/Achievements";
import Feed from "./pages/Feed";
import Availability from "./pages/Availability";
import Analytics from "./pages/Analytics";
import Seasons from "./pages/Seasons";
import AdminEventEditor from "./pages/AdminEventEditor";
import Support from "./pages/Support";
import LeagueGames from "./pages/LeagueGames";
import LeagueGameDetail from "./pages/LeagueGameDetail";
import AdminSupport from "./pages/AdminSupport";
import { SuperAdminLayout } from "./components/admin/SuperAdminLayout";
import SuperAdminDashboard from "./pages/admin/SuperAdminDashboard";
import SuperAdminClubs from "./pages/admin/SuperAdminClubs";
import SuperAdminUsers from "./pages/admin/SuperAdminUsers";
import SuperAdminSubscriptions from "./pages/admin/SuperAdminSubscriptions";
import SuperAdminSettings from "./pages/admin/SuperAdminSettings";
import SuperAdminLeagues from "./pages/admin/SuperAdminLeagues";
import SuperAdminNsaImport from "./pages/admin/SuperAdminNsaImport";
import MyAccount from "./pages/MyAccount";
import HonestyBar from "./pages/HonestyBar";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import { useMyRoles } from "@/hooks/use-data";
import { useMyClub } from "@/hooks/use-club";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import { SiteFooter } from "@/components/SiteFooter";
import { SuperAdminMenu } from "@/components/SuperAdminMenu";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { subdomain: clubSubdomain } = useClubContext();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) {
    // On club subdomains, redirect to club landing page (root) instead of auth
    if (clubSubdomain) {
      return <Navigate to="/" replace />;
    }
    const redirectTo = `${location.pathname}${location.search || ""}`;
    return <Navigate to={`/auth?redirectTo=${encodeURIComponent(redirectTo)}`} replace />;
  }
  return <>{children}</>;
}

function AuthGate() {
  const { user, signOut } = useAuth();
  const { subdomain: clubSubdomain } = useClubContext();
  const { data: roles, isLoading: rolesLoading } = useMyRoles();
  const { data: clubData, isLoading: clubDataLoading } = useMyClub();
  const [params] = useSearchParams();
  const redirectTo = (params.get("redirectTo") || "").trim();
  const hardLogout = params.get("hardLogout") === "1" || params.get("logout") === "1";
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    if (!hardLogout || !user) return;

    setLoggingOut(true);
    signOut().finally(() => {
      if (active) setLoggingOut(false);
    });

    return () => {
      active = false;
    };
  }, [hardLogout, user, signOut]);

  if (hardLogout && (user || loggingOut)) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  if (!user) {
    if (clubSubdomain) return <ClubAuth />;
    return <Auth />;
  }

  if (rolesLoading || (clubSubdomain && clubDataLoading)) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  const isPlatformAdmin = !clubSubdomain && (roles || []).includes("admin");
  const isClubAdmin = clubData?.membership?.role === "admin";
  const defaultRedirect = clubSubdomain
    ? (isClubAdmin ? "/club-admin" : "/")
    : (isPlatformAdmin ? "/admin" : "/");

  const safeRedirect =
    redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? (redirectTo === "/dashboard" ? defaultRedirect : redirectTo)
      : defaultRedirect;
  return <Navigate to={safeRedirect} replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { data: roles, isLoading } = useMyRoles();
  const { subdomain } = useClubContext();

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const allowed = (roles || []).includes("admin") || (roles || []).includes("moderator");
  if (!allowed) return <Navigate to="/" replace />;

  // Super-admin panel is global — must be accessed on the root host (no club subdomain).
  // If the user is on a club subdomain, redirect them to the root host's /admin.
  if (subdomain && typeof window !== "undefined") {
    const { protocol, hostname, port, pathname } = window.location;
    const portSuffix = port ? `:${port}` : "";
    const KNOWN_ROOTS = ["squashhub.co.za", "squashhub.app"];
    let root: string | null = null;
    for (const r of KNOWN_ROOTS) {
      if (hostname === r || hostname.endsWith(`.${r}`)) { root = r; break; }
    }
    if (root) {
      window.location.href = `${protocol}//${root}${portSuffix}/admin`;
      return null;
    }
    // Lovable preview / localhost: clear remembered preview tenant so the
    // super-admin panel renders without a club context, then continue.
    try {
      window.sessionStorage.removeItem("active_preview_tenant_subdomain");
    } catch {
      // ignore
    }
    // If the URL still carries ?club=, strip it once and reload cleanly.
    const url = new URL(window.location.href);
    if (url.searchParams.has("club")) {
      url.searchParams.delete("club");
      window.location.replace(url.toString());
      return null;
    }
    // No ?club= and we just cleared storage — render the panel.
    return <>{children}</>;
  }

  return <>{children}</>;
}

function MobileOnlyBottomNav() {
  const isMobile = useIsMobile();
  if (!isMobile) return null;
  return <BottomNav />;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const { subdomain: clubSubdomain, club: clubFromHost, isLoading: clubLoading } = useClubContext();
  const location = useLocation();
  const backgroundLocation = (location.state as any)?.backgroundLocation as typeof location | undefined;

  if (loading || clubLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // If on a club subdomain (e.g. wsc.squashhub.co.za), show club landing for unauthenticated users
  // Authenticated users see the normal dashboard routes
  const isClubSubdomain = !!clubSubdomain;

  const routeLocation = backgroundLocation || location;

  const isAdminRoute = (routeLocation.pathname || "/").startsWith("/admin");

  const isTvRoute = (routeLocation.pathname || "/").startsWith("/tv");

  const associationSettingsRedirect = (() => {
    const params = new URLSearchParams(location.search);
    params.set("tab", "settings");
    const query = params.toString();
    return query ? `/?${query}` : "/?tab=settings";
  })();

  const showFooter = (() => {
    const p = routeLocation.pathname || "/";
    if (p === "/booking-response") return false;
    if (p.startsWith("/match-tracker/")) return false;
    if (isTvRoute) return false;
    if (isAdminRoute) return false;
    return true;
  })();

  // Desktop sidebar shell only for authenticated, non-admin, non-TV routes
  const shellEnabled = !!user && !isAdminRoute && !isTvRoute;

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-background relative overflow-x-hidden">
      {user && !isAdminRoute && <ClubBrandedBackground />}
      <DesktopShell enabled={shellEnabled}>
      <Routes location={routeLocation}>
        <Route path="/" element={
          isClubSubdomain && !user
            ? <ClubLanding hostClub={clubFromHost} />
            : user
              ? <Dashboard />
              : <Home />
        } />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/tournaments" element={<Tournaments />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/auth" element={<AuthGate />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/bookings" element={<ProtectedRoute><Bookings /></ProtectedRoute>} />
        <Route path="/ladder" element={<ProtectedRoute><Ladder /></ProtectedRoute>} />
        <Route path="/challenges/new" element={<Navigate to="/ladder" replace />} />
        <Route path="/challenges" element={<ProtectedRoute><Challenges /></ProtectedRoute>} />
        <Route path="/match-tracker/:bookingId" element={<ProtectedRoute><MatchTracker /></ProtectedRoute>} />
        <Route path="/match-marker" element={<ProtectedRoute><MatchMarker /></ProtectedRoute>} />
        <Route path="/tv" element={<MarkerTv />} />
        <Route path="/tv/club/:subdomain" element={<MarkerTv />} />
        <Route path="/tv/club/:subdomain/court/:court" element={<MarkerTv />} />
        <Route path="/tv/:code" element={<MarkerTv />} />
        <Route path="/add-result" element={<ProtectedRoute><AddMatchResult /></ProtectedRoute>} />
        <Route path="/players/:id" element={<ProtectedRoute><PlayerProfile /></ProtectedRoute>} />
        <Route path="/integrations/strava/callback" element={<ProtectedRoute><StravaCallback /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/my-account" element={<ProtectedRoute><MyAccount /></ProtectedRoute>} />
        <Route path="/achievements" element={<ProtectedRoute><Achievements /></ProtectedRoute>} />
        <Route path="/feed" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
        <Route path="/availability" element={<ProtectedRoute><Availability /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="/seasons" element={<ProtectedRoute><Seasons /></ProtectedRoute>} />
        <Route path="/register-club" element={<ProtectedRoute><RegisterClub /></ProtectedRoute>} />
        <Route path="/settings" element={
          <ProtectedRoute>
            {(clubFromHost as any)?.tenant_type === "association"
              ? <Navigate to={associationSettingsRedirect} replace />
              : <Settings />}
          </ProtectedRoute>
        } />
        <Route path="/club-admin" element={<ProtectedRoute><ClubAdmin /></ProtectedRoute>} />
        <Route path="/honesty-bar" element={<ProtectedRoute><HonestyBar /></ProtectedRoute>} />
        <Route path="/club-champs/:champId" element={<ProtectedRoute><ClubChampsView /></ProtectedRoute>} />
        <Route path="/league-games" element={<ProtectedRoute><LeagueGames /></ProtectedRoute>} />
        <Route path="/league-games/:fixtureId" element={<ProtectedRoute><LeagueGameDetail /></ProtectedRoute>} />
        <Route path="/c/:subdomain" element={<ClubLanding />} />
        <Route path="/league" element={<LeagueSignup />} />
        <Route path="/admin" element={<AdminRoute><SuperAdminLayout /></AdminRoute>}>
          <Route index element={<SuperAdminDashboard />} />
          <Route path="clubs" element={<SuperAdminClubs />} />
          <Route path="users" element={<SuperAdminUsers />} />
          <Route path="leagues" element={<SuperAdminLeagues />} />
          <Route path="nsa-import" element={<SuperAdminNsaImport />} />
          <Route path="subscriptions" element={<SuperAdminSubscriptions />} />
          <Route path="settings" element={<SuperAdminSettings />} />
          <Route path="support" element={<AdminSupport />} />
          <Route path="events/new" element={<AdminEventEditor />} />
          <Route path="events/:id" element={<AdminEventEditor />} />
        </Route>
        <Route path="/booking-response" element={<BookingResponse />} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {backgroundLocation && (
        <Routes location={location}>
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        </Routes>
      )}
      </DesktopShell>
      {showFooter && <SiteFooter compact={!!user} withBottomNav={!!user} />}
      {user && !isAdminRoute && !isTvRoute && <MobileOnlyBottomNav />}
      {user && !isTvRoute && <OfflineBanner />}
      {user && !isTvRoute && <LiveSessionBanner />}
      {user && <PushNotificationPrompt />}
      {user && <NotificationListener />}
      {user && <NotificationActionModal />}
      {user && <NativePushListener />}
      {user && <NotificationDeepLinkHandler />}
      {user && <RealtimeSync />}
      {user && <OutboxSync />}
      <FeedbackFab />
      {/* Mobile-only floating Super-Admin shortcut (desktop has it in the header) */}
      {user && !isAdminRoute && !isTvRoute && (
        <div className="md:hidden fixed top-2 right-2 z-50">
          <SuperAdminMenu />
        </div>
      )}
      
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ClubProvider>
            <MemberProvider>
              <AppRoutes />
            </MemberProvider>
          </ClubProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
