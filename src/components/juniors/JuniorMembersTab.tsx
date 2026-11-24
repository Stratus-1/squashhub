import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JuniorSquadsBoard } from "./JuniorSquadsBoard";
import { genderLabel, type SquadRow } from "@/lib/juniors/squads";

const db = supabase as any;

/** Junior body Members: every junior from the clubs under the body, read-only and synced from each club record. Juniors never get logins here. */
export function JuniorMembersTab({ orgId }: { orgId: string }) {
  const [view, setView] = useState<"list" | "groups">("list");
  const [q, setQ] = useState("");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["junior-squads", null, orgId],
    queryFn: async () => {
      const { data, error } = await db.rpc("junior_squads_for", { _club_id: null, _org_id: orgId });
      if (error) throw error;
      return (data || []) as SquadRow[];
    },
  });
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...data]
      .filter(r => !s || `${r.name ?? ""} ${r.club_name ?? ""}`.toLowerCase().includes(s))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [data, q]);
  const clubs = new Set(data.map(r => r.club_id)).size;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Members — junior players</h2>
        <p className="text-xs text-muted-foreground">
          {data.length} juniors from {clubs} clubs, synced automatically from each club. Change details at the junior's club. Juniors don't log in here — management is listed under Association leaders.
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")}>List</Button>
        <Button size="sm" variant={view === "groups" ? "default" : "outline"} onClick={() => setView("groups")}>By age group</Button>
      </div>
      {view === "groups" ? <JuniorSquadsBoard orgId={orgId} /> : (
        <>
          <Input placeholder="Search name or club" value={q} onChange={e => setQ(e.target.value)} className="max-w-xs h-8" />
          {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p>
            : error ? <p className="text-xs text-destructive">Could not load juniors.</p>
            : rows.length === 0 ? <p className="text-xs text-muted-foreground">No juniors yet. They appear when a club marks a member as playing junior squash.</p>
            : (
              <div className="rounded-md border divide-y">
                {rows.map(r => (
                  <div key={r.member_id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${r.junior_player ? "" : "opacity-50"}`}>
                    <span className="font-medium flex-1 min-w-[10rem]">{r.name ?? "—"}</span>
                    <span className="text-xs text-muted-foreground min-w-[8rem]">{r.club_name ?? ""}</span>
                    <Badge variant="outline">{genderLabel(r.gender_group ?? "unknown")}</Badge>
                    <Badge variant="outline">{r.age_group ?? "Age not set"}</Badge>
                    {!r.junior_player && <Badge variant="secondary">Not playing</Badge>}
                  </div>
                ))}
              </div>
            )}
        </>
      )}
    </div>
  );
}
