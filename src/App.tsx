import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ClubProvider, useClubContext } from "@/contexts/ClubContext";
import { DynamicPwaManifest } from "@/components/DynamicPwaManifest";
import { MemberProvider } from "@/contexts/MemberContext";
import { BottomNav } from "@/components/BottomNav";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { NotificationListener } from "@/components/NotificationListener";
import { NotificationActionModal } from "@/components/NotificationActionModal";
import { NativePushListener } from "@/components/NativePushListener";
import { NotificationDeepLinkHandler } from "@/components/NotificationDeepLinkHandler";
import { InstallAppPrompt } from "@/components/InstallAppPrompt";
import { RealtimeSync } from "@/components/RealtimeSync";
import { OutboxSync } from "@/components/OutboxSync";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";
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
import EventDetail from "./pages/EventDetail";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import ResetPassword from "./pages/ResetPassword";

import StravaCallback from "./pages/StravaCallback";
import MatchTracker from "./pages/MatchTracker";
import MatchMarker from "./pages/MatchMarker";
import AddMatchResult from "./pages/AddMatchResult";
import PlayerProfile from "./pages/PlayerProfile";
import RegisterClub from "./pages/RegisterClub";
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
import AdminSupport from "./pages/AdminSupport";
import { SuperAdminLayout } from "./components/admin/SuperAdminLayout";
import SuperAdminDashboard from "./pages/admin/SuperAdminDashboard";
import SuperAdminClubs from "./pages/admin/SuperAdminClubs";
import SuperAdminUsers from "./pages/admin/SuperAdminUsers";
import SuperAdminSubscriptions from "./pages/admin/SuperAdminSubscriptions";
import SuperAdminSettings from "./pages/admin/SuperAdminSettings";
import MyAccount from "./pages/MyAccount";
import HonestyBar from "./pages/HonestyBar";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import { useMyRoles } from "@/hooks/use-data";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import { SiteFooter } from "@/components/SiteFooter";

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

  // Wait for roles to load before deciding where to redirect
  if (rolesLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  // On a club subdomain, always redirect to club home (never /admin)
  const isAdmin = !clubSubdomain && (roles || []).includes("admin");
  const defaultRedirect = isAdmin ? "/admin" : "/";

  const safeRedirect =
    redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? (redirectTo === "/dashboard" ? defaultRedirect : redirectTo)
      : defaultRedirect;
  return <Navigate to={safeRedirect} replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { data: roles, isLoading } = useMyRoles();

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

  return <>{children}</>;
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

  const showFooter = (() => {
    const p = routeLocation.pathname || "/";
    if (p === "/booking-response") return false;
    if (p.startsWith("/match-tracker/")) return false;
    if (isAdminRoute) return false;
    return true;
  })();

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-background relative overflow-x-hidden">
      {user && !isAdminRoute && <ClubBrandedBackground />}
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
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/club-admin" element={<ProtectedRoute><ClubAdmin /></ProtectedRoute>} />
        <Route path="/honesty-bar" element={<ProtectedRoute><HonestyBar /></ProtectedRoute>} />
        <Route path="/club-champs/:champId" element={<ProtectedRoute><ClubChampsView /></ProtectedRoute>} />
        <Route path="/c/:subdomain" element={<ClubLanding />} />
        <Route path="/admin" element={<AdminRoute><SuperAdminLayout /></AdminRoute>}>
          <Route index element={<SuperAdminDashboard />} />
          <Route path="clubs" element={<SuperAdminClubs />} />
          <Route path="users" element={<SuperAdminUsers />} />
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
      {showFooter && <SiteFooter compact={!!user} withBottomNav={!!user} />}
      {user && !isAdminRoute && <BottomNav />}
      {user && <OfflineBanner />}
      {user && <LiveSessionBanner />}
      <InstallAppPrompt />
      {user && <PushNotificationPrompt />}
      {user && <NotificationListener />}
      {user && <NotificationActionModal />}
      {user && <NativePushListener />}
      {user && <NotificationDeepLinkHandler />}
      {user && <RealtimeSync />}
      {user && <OutboxSync />}
      <PwaUpdatePrompt />
      <FeedbackFab />
      
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
            <DynamicPwaManifest />
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
