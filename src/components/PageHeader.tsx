import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useUnreadNotificationsCount } from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showNotifications?: boolean;
}

export function PageHeader({ title, subtitle, showNotifications = true }: PageHeaderProps) {
  const navigate = useNavigate();
  const { data: unreadCount } = useUnreadNotificationsCount();
  const { user } = useAuth();

  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <div>
        <h1 className="text-xl font-bold font-heading tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {showNotifications && user && (
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => navigate("/notifications")}
        >
          <Bell className="w-5 h-5" />
          {(unreadCount ?? 0) > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent" />
          )}
        </Button>
      )}
    </div>
  );
}
