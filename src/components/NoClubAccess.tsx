import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

/**
 * Shown when an authenticated user lands on a club subdomain where they
 * have NO `club_members` row (neither member nor visitor). Prevents the
 * old redirect/flicker loop between Dashboard and /auth and gives the
 * user a clear next step: register as a visitor or sign out.
 */
export function NoClubAccess() {
  const { user, signOut } = useAuth();
  const { club } = useClubContext();
  const navigate = useNavigate();
  const clubName = club?.name || "this club";

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 space-y-4">
        <div className="flex items-center gap-2 text-amber-600">
          <ShieldAlert className="w-5 h-5" />
          <h1 className="text-lg font-semibold">Access not available</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          You’re signed in as <span className="font-medium">{user?.email}</span>, but you’re not
          registered as a member or visitor at <span className="font-medium">{clubName}</span>.
          Only members and visitors of a club can sign in to it.
        </p>
        <p className="text-sm text-muted-foreground">
          To continue, either register as a visitor at {clubName} or sign out and log in to your
          own club.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            className="flex-1"
            onClick={() => navigate("/auth?intent=visitor", { replace: true })}
          >
            Register as visitor
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={async () => {
              await signOut();
              navigate("/", { replace: true });
            }}
          >
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
