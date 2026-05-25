import { useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Printer } from "lucide-react";
import { SquashHubSlaContent, SLA_EFFECTIVE_DATE } from "@/components/SquashHubSlaContent";


export default function Sla() {
  return (
    <div className="bottom-nav-safe">
      <SEO
        title="Service Level Agreement"
        description="SquashHub Service Level Agreement — fees, support, data protection and termination terms for participating clubs."
        path="/sla"
      />
      <PageHeader title="Service Level Agreement" subtitle={`Effective: ${SLA_EFFECTIVE_DATE}`} showNotifications={false} />
      <div className="px-4 sm:px-6 lg:px-[5%] pb-20">
        <Card className="border-border/60">
          <CardContent className="p-4 sm:p-6">
            <SquashHubSlaContent />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
