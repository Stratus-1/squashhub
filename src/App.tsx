import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { NotificationListener } from "@/components/NotificationListener";
import { NativePushListener } from "@/components/NativePushListener";
import { RealtimeSync } from "@/components/RealtimeSync";
import { OutboxSync } from "@/components/OutboxSync";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";
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
import NewChallenge from "./pages/NewChallenge";
import StravaCallback from "./pages/StravaCallback";
import MatchTracker from "./pages/MatchTracker";
import PlayerProfile from "./pages/PlayerProfile";
import Admin from "./pages/Admin";
import BookingResponse from "./pages/BookingResponse";
import Achievements from "./pages/Achievements";
import Feed from "./pages/Feed";
import Availability from "./pages/Availability";
import Analytics from "./pages/Analytics";
import Seasons from "./pages/Seasons";
import NotFound from "./pages/NotFound";
import { useMyRoles } from "@/hooks/use-data";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
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
  if (!allowed) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-background relative overflow-x-hidden">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/auth" element={user ? <Navigate to="/dashboard" replace /> : <Auth />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/bookings" element={<ProtectedRoute><Bookings /></ProtectedRoute>} />
        <Route path="/ladder" element={<ProtectedRoute><Ladder /></ProtectedRoute>} />
        <Route path="/challenges/new" element={<ProtectedRoute><NewChallenge /></ProtectedRoute>} />
        <Route path="/challenges" element={<ProtectedRoute><Challenges /></ProtectedRoute>} />
        <Route path="/match-tracker/:bookingId" element={<ProtectedRoute><MatchTracker /></ProtectedRoute>} />
        <Route path="/players/:id" element={<ProtectedRoute><PlayerProfile /></ProtectedRoute>} />
        <Route path="/integrations/strava/callback" element={<ProtectedRoute><StravaCallback /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/achievements" element={<ProtectedRoute><Achievements /></ProtectedRoute>} />
        <Route path="/feed" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
        <Route path="/availability" element={<ProtectedRoute><Availability /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="/seasons" element={<ProtectedRoute><Seasons /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
        <Route path="/booking-response" element={<BookingResponse />} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {user && <BottomNav />}
      {user && <OfflineBanner />}
      {user && <PushNotificationPrompt />}
      {user && <NotificationListener />}
      {user && <NativePushListener />}
      {user && <RealtimeSync />}
      {user && <OutboxSync />}
      <PwaUpdatePrompt />
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
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
