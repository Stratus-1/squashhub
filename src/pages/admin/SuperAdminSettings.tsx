import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function SuperAdminSettings() {
  return (
    <div className="space-y-6">
      <SEO title="Settings — Super Admin" noIndex />
      <div>
        <h2 className="text-2xl font-bold text-foreground">Platform Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Global configuration</p>
      </div>

      <Card className="p-8 flex flex-col items-center justify-center text-center gap-3">
        <Settings className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">Platform settings coming soon</p>
      </Card>
    </div>
  );
}
