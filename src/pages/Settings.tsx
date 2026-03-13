import { PageHeader } from "@/components/PageHeader";
import { DashboardAccountSettings } from "@/components/DashboardAccountSettings";
import { SEO } from "@/components/SEO";

export default function Settings() {
  return (
    <div className="bottom-nav-safe">
      <SEO title="Settings" description="Account settings and preferences." path="/settings" noIndex />
      <PageHeader title="Settings" subtitle="Account & preferences" />
      <div className="px-4 mt-3 mb-4">
        <DashboardAccountSettings />
      </div>
    </div>
  );
}
