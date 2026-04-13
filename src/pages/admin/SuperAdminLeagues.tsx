import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Calendar, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function SuperAdminLeagues() {
  const [search, setSearch] = useState("");

  const { data: associations } = useQuery({
    queryKey: ["admin-associations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_league_associations")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: fixtures } = useQuery({
    queryKey: ["admin-fixtures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_league_fixtures")
        .select("*")
        .order("fixture_date", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const filteredFixtures = (fixtures || []).filter((f) =>
    !search ||
    f.division?.toLowerCase().includes(search.toLowerCase()) ||
    f.home_team_code?.toLowerCase().includes(search.toLowerCase()) ||
    f.away_team_code?.toLowerCase().includes(search.toLowerCase()) ||
    f.venue_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">League Management</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage associations, teams, and fixtures</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Associations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{associations?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fixtures</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fixtures?.length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search fixtures by division, team or venue..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {filteredFixtures.map((f) => (
          <Card key={f.id} className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">
                  {f.fixture_date ? format(parseISO(f.fixture_date), "dd MMM yyyy") : "TBC"}
                </span>
                <Badge variant="outline" className="text-xs">{f.division}</Badge>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">{f.home_team_code}</span>
                <span className="text-muted-foreground">vs</span>
                <span className="font-semibold">{f.away_team_code}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {f.venue_name || "TBC"}
              </div>
            </div>
          </Card>
        ))}
        {filteredFixtures.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No fixtures found</p>
        )}
      </div>
    </div>
  );
}
