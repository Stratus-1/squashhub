import { Card } from "@/components/ui/card";
import { Mail } from "lucide-react";

/**
 * Email marketing admin panel.
 * The email_templates and email_campaigns tables have not been created yet,
 * so this component renders a placeholder until the migration is applied.
 */
export function AdminEmailMarketing({ enabled }: { enabled: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold font-heading">Email marketing</p>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Email marketing tables are not available yet. Apply the email marketing
        migration to enable templates and campaigns.
      </p>
    </Card>
  );
}
