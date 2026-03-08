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
    <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top,1rem))] pb-2">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold font-heading tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground truncate">{subtitle}</p>}
      </div>
      {showNotifications && user && <NotificationsDropdown />}
    </div>
  );
}
