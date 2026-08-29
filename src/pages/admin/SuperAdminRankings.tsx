import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SEO } from "@/components/SEO";
import { SportyHqLookupPanel } from "@/components/admin/SportyHqLookupPanel";
import { AssociationRankingsTab } from "@/components/association-admin/AssociationRankingsTab";
import { RankingRolloutPanel } from "@/components/admin/RankingRolloutPanel";

export default function SuperAdminRankings() {
  return (
    <div className="space-y-4">
      <SEO title="Player Rankings | SquashHub Admin" description="National player rankings, league data sync and SportyHQ ratings." />
      <div>
        <h1 className="text-xl font-semibold">Player Rankings</h1>
        <p className="text-[13px] text-muted-foreground">
          National (SSA-level) player strength: SquashHub's own league-rubber ranking plus public SportyHQ ratings.
        </p>
      </div>

      <Tabs defaultValue="sportyhq">
        <TabsList>
          <TabsTrigger value="sportyhq">SportyHQ ratings</TabsTrigger>
          <TabsTrigger value="league">League rankings</TabsTrigger>
          <TabsTrigger value="rollout">Club rollout</TabsTrigger>
        </TabsList>
        <TabsContent value="sportyhq" className="pt-3">
          <SportyHqLookupPanel />
        </TabsContent>
        <TabsContent value="league" className="pt-3">
          <AssociationRankingsTab clubId="" />
        </TabsContent>
        <TabsContent value="rollout" className="pt-3">
          <RankingRolloutPanel />
        </TabsContent>
        <TabsContent value="fedtree" className="pt-3">
          <FederationTreeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
