import { lazy, Suspense, useEffect, useState } from "react";
import { CapabilityRoute } from "@/components/CapabilityRoute";
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
import { InstallPrompt } from "@/components/InstallPrompt";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { NotificationListener } from "@/components/NotificationListener";
import { NotificationActionModal } from "@/components/NotificationActionModal";
import { NativePushListener } from "@/components/NativePushListener";
import { NotificationDeepLinkHandler } from "@/components/NotificationDeepLinkHandler";
import { DelegationRequestDialog } from "@/components/DelegationRequestDialog";
import { RealtimeSync } from "@/components/RealtimeSync";
import { OutboxSync } from "@/components/OutboxSync";
import { OfflineBanner } from "@/components/OfflineBanner";
import { FeedbackFab } from "@/components/FeedbackFab";
import { LiveSessionBanner } from "@/components/LiveSessionBanner";
import { ViewingAsBanner } from "@/components/ViewingAsBanner";

import { ClubBrandedBackground } from "@/components/ClubBrandedBackground";
const Home = lazy(() => import("./pages/Home"));
const Clubs = lazy(() => import("./pages/Clubs"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Bookings = lazy(() => import("./pages/Bookings"));
const Ladder = lazy(() => import("./pages/Ladder"));
const Challenges = lazy(() => import("./pages/Challenges"));
const Profile = lazy(() => import("./pages/Profile"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Events = lazy(() => import("./pages/Events"));
const Tournaments = lazy(() => import("./pages/Tournaments"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const Auth = lazy(() => import("./pages/Auth"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const SetPassword = lazy(() => import("./pages/SetPassword"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const PayReturn = lazy(() => import("./pages/PayReturn"));
const ScanPay = lazy(() => import("./pages/ScanPay"));
const BarPaymentSuccess = lazy(() => import("./pages/BarPaymentSuccess"));
const StitchPaymentBridge = lazy(() => import("./pages/StitchPaymentBridge"));
const StravaCallback = lazy(() => import("./pages/StravaCallback"));
const MatchTracker = lazy(() => import("./pages/MatchTracker"));
const MatchMarker = lazy(() => import("./pages/MatchMarker"));
const BellsMarker = lazy(() => import("./pages/BellsMarker"));
const MarkerTv = lazy(() => import("./pages/MarkerTv"));
const TournamentMatchLive = lazy(() => import("./pages/TournamentMatchLive"));
const AddMatchResult = lazy(() => import("./pages/AddMatchResult"));
const PlayerProfile = lazy(() => import("./pages/PlayerProfile"));
const RegisterClub = lazy(() => import("./pages/RegisterClub"));
const LeagueSignup = lazy(() => import("./pages/LeagueSignup"));
const ClubAdmin = lazy(() => import("./pages/ClubAdmin"));
const ClubChampsView = lazy(() => import("./pages/ClubChampsView"));
const ClubLanding = lazy(() => import("./pages/ClubLanding"));
const ClubAuth = lazy(() => import("./pages/ClubAuth"));
const BookingResponse = lazy(() => import("./pages/BookingResponse"));
const TournamentInvite = lazy(() => import("./pages/TournamentInvite"));
const Achievements = lazy(() => import("./pages/Achievements"));
const Feed = lazy(() => import("./pages/Feed"));
const Availability = lazy(() => import("./pages/Availability"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Seasons = lazy(() => import("./pages/Seasons"));
const AdminEventEditor = lazy(() => import("./pages/AdminEventEditor"));
const Support = lazy(() => import("./pages/Support"));
const Help = lazy(() => import("./pages/Help"));
const SuperAdminHelpVideos = lazy(() => import("./pages/admin/SuperAdminHelpVideos"));
const LeagueGames = lazy(() => import("./pages/LeagueGames"));
const LeagueGameDetail = lazy(() => import("./pages/LeagueGameDetail"));
const AdminSupport = lazy(() => import("./pages/AdminSupport"));
const SuperAdminLayout = lazy(() =>
  import("./components/admin/SuperAdminLayout").then((m) => ({ default: m.SuperAdminLayout })),
);
const SuperAdminDashboard = lazy(() => import("./pages/admin/SuperAdminDashboard"));
const SuperAdminClubs = lazy(() => import("./pages/admin/SuperAdminClubs"));
const SuperAdminFederation = lazy(() => import("./pages/admin/SuperAdminFederation"));
const SuperAdminTournaments = lazy(() => import("./pages/admin/SuperAdminTournaments"));
const SuperAdminRankings = lazy(() => import("./pages/admin/SuperAdminRankings"));
const SuperAdminUsers = lazy(() => import("./pages/admin/SuperAdminUsers"));
const SuperAdminSubscriptions = lazy(() => import("./pages/admin/SuperAdminSubscriptions"));
const SuperAdminSettings = lazy(() => import("./pages/admin/SuperAdminSettings"));
const SuperAdminLeagues = lazy(() => import("./pages/admin/SuperAdminLeagues"));
const SuperAdminOutreach = lazy(() => import("./pages/admin/SuperAdminOutreach"));
const SuperAdminOutreachCampaigns = lazy(() => import("./pages/admin/SuperAdminOutreachCampaigns"));
const SuperAdminOutreachCampaignEditor = lazy(() => import("./pages/admin/SuperAdminOutreachCampaignEditor"));
const MyAccount = lazy(() => import("./pages/MyAccount"));
const HonestyBar = lazy(() => import("./pages/HonestyBar"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));
import { useMyRoles } from "@/hooks/use-data";
import { useMyClub, useMyClubMember, useIsSuperAdmin } from "@/hooks/use-club";
import { useIsAssociationAdmin } from "@/hooks/use-association-admin";
import { NoClubAccess } from "@/components/NoClubAccess";
import { fromExt } from "@/lib/supabase-ext";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";

import Sla from "./pages/Sla";
import LightsIntegration from "./pages/LightsIntegration";
import { SiteFooter } from "@/components/SiteFooter";
import { SuperAdminMenu } from "@/components/SuperAdminMenu";

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error: any) => {
      const fe = friendlyError(error);
      // Only auto-toast permission errors globally; let individual mutations
      // continue to handle their own non-permission errors as before.
      if (fe.isPermission) {
        toast.error(fe.title, {
          description: fe.description,
          action: {
            label: "Open Support",
            onClick: () => {
              if (typeof window !== "undefined") window.location.href = "/support";
            },
          },
        });
      }
    },
  }),
});

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

/**
 * On a club subdomain, block Dashboard rendering for users who have no
 * `club_members` row (member OR visitor) at this club. Prevents the
 * Dashboard ↔ /auth redirect flicker for users from another club.
 */
function SubdomainMembershipGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { subdomain, club } = useClubContext();
  const { data: myClubMember, isLoading } = useMyClubMember();
  const isSuperAdmin = useIsSuperAdmin();
  const isAssociationAdmin = useIsAssociationAdmin(club?.id);
  const [hasMembershipElsewhere, setHasMembershipElsewhere] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id || !subdomain || !club?.id || myClubMember || isSuperAdmin || isAssociationAdmin) {
      setHasMembershipElsewhere(null);
      return;
    }

    setHasMembershipElsewhere(null);
    fromExt("club_members")
      .select("id, club_id")
      .eq("user_id", user.id)
      .neq("club_id", club.id)
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("[SubdomainMembershipGate] membership check failed", error);
          setHasMembershipElsewhere(false);
          return;
        }
        setHasMembershipElsewhere(!!data);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, subdomain, club?.id, myClubMember, isSuperAdmin, isAssociationAdmin]);

  // Only gate on club subdomains, once the club context and user are known.
  if (!user || !subdomain || !club?.id) return <>{children}</>;
  // Platform super-admins and association admins can access association tenants
  // without needing a local club_members row.
  if (isSuperAdmin || isAssociationAdmin) return <>{children}</>;
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!myClubMember) {
    if (hasMembershipElsewhere === null) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      );
    }

    // First-time member signups have an auth/profile record but no club member
    // row yet. Let Dashboard open the member onboarding wizard, which creates
    // the club_members row. Users who already belong elsewhere remain visitor-only.
    if (!hasMembershipElsewhere) return <>{children}</>;
    return <NoClubAccess />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const { subdomain: clubSubdomain, club: clubFromHost, isLoading: clubLoading } = useClubContext();
  const location = useLocation();
  const backgroundLocation = (location.state as any)?.backgroundLocation as typeof location | undefined;
  const routeLocation = backgroundLocation || location;
  const isAdminRoute = (routeLocation.pathname || "/").startsWith("/admin");
  const isTvRoute = (routeLocation.pathname || "/").startsWith("/tv");

  // Marketing / public-facing routes keep the dark navy+amber brand theme.
  // The in-app experience now defaults to DARK; users can opt into light
  // via the theme toggle in the header / Settings.
  useEffect(() => {
    const p = routeLocation.pathname || "/";
    const isMarketingRoute =
      (!user && p === "/") ||
      p === "/auth" ||
      p === "/auth/callback" ||
      p === "/reset-password" ||
      p === "/league" ||
      p === "/clubs" ||

      p === "/terms" ||
      p === "/privacy" ||
      p === "/sla" ||
      p === "/lights" ||
      p.startsWith("/c/") ||
      p.startsWith("/tv");

    const root = document.documentElement;
    const userPref = localStorage.getItem("theme"); // "dark" | "light" | null
    if (isMarketingRoute) {
      root.classList.add("dark");
    } else if (userPref === "light") {
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
    }
  }, [routeLocation.pathname, user]);

  // One-time hint after login letting users know they can switch to light mode.
  useEffect(() => {
    if (!user) return;
    const userPref = localStorage.getItem("theme");
    const hintShown = localStorage.getItem("theme-hint-shown");
    if (hintShown || userPref === "light") return;
    const t = setTimeout(() => {
      import("sonner").then(({ toast }) => {
        toast("Dark mode is on by default", {
          description: "Prefer light? Tap the sun/moon icon in the header any time.",
          duration: 6000,
        });
      });
      localStorage.setItem("theme-hint-shown", "1");
    }, 1200);
    return () => clearTimeout(t);
  }, [user]);


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
  const routeFallback = (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-background relative overflow-x-hidden">
      {user && !isAdminRoute && <ClubBrandedBackground />}
      <DesktopShell enabled={shellEnabled}>
        <Suspense fallback={routeFallback}>
          <Routes location={routeLocation}>
        <Route path="/" element={
          isClubSubdomain && !user
            ? <ClubLanding hostClub={clubFromHost} hostSubdomain={clubSubdomain} />
            : user
              ? <SubdomainMembershipGate><Dashboard /></SubdomainMembershipGate>
              : <Home />
        } />
        <Route path="/welcome" element={<Home />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/clubs" element={<Clubs />} />

        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/events" element={<CapabilityRoute capability="events"><Events /></CapabilityRoute>} />
        <Route path="/events/:id" element={<CapabilityRoute capability="events"><EventDetail /></CapabilityRoute>} />
        <Route path="/tournaments" element={<CapabilityRoute capability="tournaments"><Tournaments /></CapabilityRoute>} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/lights" element={<LightsIntegration />} />

        <Route path="/sla" element={<Sla />} />
        <Route path="/lights" element={<LightsIntegration />} />
        <Route path="/auth" element={<AuthGate />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
        <Route path="/pay/stitch" element={<ProtectedRoute><StitchPaymentBridge /></ProtectedRoute>} />
        <Route path="/pay/return" element={<PayReturn />} />
        <Route path="/s/:code" element={<ScanPay />} />
        <Route path="/s/:code/success" element={<BarPaymentSuccess />} />
        <Route path="/c/:subdomain/s/:code" element={<ScanPay />} />
        <Route path="/c/:subdomain/s/:code/success" element={<BarPaymentSuccess />} />
        <Route path="/bookings" element={<ProtectedRoute><CapabilityRoute capability="bookings"><Bookings /></CapabilityRoute></ProtectedRoute>} />
        <Route path="/ladder" element={<ProtectedRoute><CapabilityRoute capability="ladder"><Ladder /></CapabilityRoute></ProtectedRoute>} />
        <Route path="/challenges/new" element={<Navigate to="/ladder" replace />} />
        <Route path="/challenges" element={<ProtectedRoute><CapabilityRoute capability="ladder"><Challenges /></CapabilityRoute></ProtectedRoute>} />
        <Route path="/match-tracker/:bookingId" element={<ProtectedRoute><MatchTracker /></ProtectedRoute>} />
        <Route path="/match-marker" element={<ProtectedRoute><MatchMarker /></ProtectedRoute>} />
        <Route path="/bells-marker/:matchId" element={<ProtectedRoute><CapabilityRoute capability="tournaments"><BellsMarker /></CapabilityRoute></ProtectedRoute>} />
        <Route path="/tournament-live/:matchId" element={<ProtectedRoute><CapabilityRoute capability="tournaments"><TournamentMatchLive /></CapabilityRoute></ProtectedRoute>} />
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
        <Route path="/register-club" element={<RegisterClub />} />
        <Route path="/settings" element={
          <ProtectedRoute>
            {(clubFromHost as any)?.tenant_type === "association"
              ? <Navigate to={associationSettingsRedirect} replace />
              : <Settings />}
          </ProtectedRoute>
        } />
        <Route path="/club-admin" element={<ProtectedRoute><ClubAdmin /></ProtectedRoute>} />
        <Route path="/honesty-bar" element={<ProtectedRoute><CapabilityRoute capability="bar"><HonestyBar /></CapabilityRoute></ProtectedRoute>} />
        <Route path="/club-champs/:champId" element={<ProtectedRoute><CapabilityRoute capability="tournaments"><ClubChampsView /></CapabilityRoute></ProtectedRoute>} />
        <Route path="/league-games" element={<ProtectedRoute><CapabilityRoute capability="leagues"><LeagueGames /></CapabilityRoute></ProtectedRoute>} />
        <Route path="/league-games/:fixtureId" element={<ProtectedRoute><CapabilityRoute capability="leagues"><LeagueGameDetail /></CapabilityRoute></ProtectedRoute>} />
        <Route path="/c/:subdomain" element={<ClubLanding />} />
        <Route path="/c/:subdomain/auth" element={<ClubAuth />} />
        <Route path="/league" element={<LeagueSignup />} />
        <Route path="/admin" element={<AdminRoute><SuperAdminLayout /></AdminRoute>}>
          <Route index element={<SuperAdminDashboard />} />
          <Route path="clubs" element={<SuperAdminClubs />} />
          <Route path="federation" element={<SuperAdminFederation />} />
          <Route path="tournaments" element={<SuperAdminTournaments />} />
          <Route path="users" element={<SuperAdminUsers />} />
          <Route path="rankings" element={<SuperAdminRankings />} />
          <Route path="affiliations" element={<SuperAdminLeagues />} />
          <Route path="leagues" element={<Navigate to="/admin/affiliations" replace />} />
          <Route path="outreach" element={<SuperAdminOutreach />} />
          <Route path="outreach/campaigns" element={<SuperAdminOutreachCampaigns />} />
          <Route path="outreach/campaigns/:id" element={<SuperAdminOutreachCampaignEditor />} />
          <Route path="subscriptions" element={<SuperAdminSubscriptions />} />
          <Route path="settings" element={<SuperAdminSettings />} />
          <Route path="support" element={<AdminSupport />} />
          <Route path="help" element={<SuperAdminHelpVideos />} />
          <Route path="events/new" element={<AdminEventEditor />} />
          <Route path="events/:id" element={<AdminEventEditor />} />
        </Route>
        <Route path="/booking-response" element={<BookingResponse />} />
        {/* Public, recipient-specific tournament invitation link (email / in-app / WhatsApp) */}
        <Route path="/i/test/:champId" element={<TournamentInvite />} />
        <Route path="/i/:token" element={<TournamentInvite />} />
        <Route path="/c/:subdomain/i/test/:champId" element={<TournamentInvite />} />
        <Route path="/c/:subdomain/i/:token" element={<TournamentInvite />} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
        <Route path="/help" element={<ProtectedRoute><Help /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
          </Routes>
          {backgroundLocation && (
            <Routes location={location}>
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            </Routes>
          )}
        </Suspense>
      </DesktopShell>
      {showFooter && <SiteFooter compact={!!user} withBottomNav={!!user} />}
      {user && !isAdminRoute && !isTvRoute && <MobileOnlyBottomNav />}
      {user && !isTvRoute && <OfflineBanner />}
      {user && !isTvRoute && <LiveSessionBanner />}
      {user && !isTvRoute && <ViewingAsBanner />}
      {user && <PushNotificationPrompt />}
      {user && !isTvRoute && <InstallPrompt />}
      {!isTvRoute && <UpdatePrompt />}
      {user && <NotificationListener />}
      {user && <NotificationActionModal />}
      {user && <NativePushListener />}
      {user && <NotificationDeepLinkHandler />}
      {user && <DelegationRequestDialog />}
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
