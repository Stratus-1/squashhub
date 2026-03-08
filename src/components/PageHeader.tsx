import { useAuth } from "@/contexts/AuthContext";
import { NotificationsDropdown } from "@/components/NotificationsDropdown";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showNotifications?: boolean;
  showProfile?: boolean;
  profileTo?: string;
}

export function PageHeader({
  title,
  subtitle,
  showNotifications = true,
  showProfile = false,
  profileTo = "/profile",
}: PageHeaderProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top,1rem))] pb-2">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold font-heading tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground truncate">{subtitle}</p>}
      </div>
      {user && (showNotifications || showProfile) && (
        <div className="flex items-center gap-2">
          {showNotifications && <NotificationsDropdown />}
          {showProfile && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => navigate(profileTo)}
              aria-label="Profile"
            >
              <User className="w-5 h-5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
