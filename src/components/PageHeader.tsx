import { useAuth } from "@/contexts/AuthContext";
import { NotificationsDropdown } from "@/components/NotificationsDropdown";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showNotifications?: boolean;
}

export function PageHeader({ title, subtitle, showNotifications = true }: PageHeaderProps) {
  const { user } = useAuth();

  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <div>
        <h1 className="text-xl font-bold font-heading tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {showNotifications && user && <NotificationsDropdown />}
    </div>
  );
}
