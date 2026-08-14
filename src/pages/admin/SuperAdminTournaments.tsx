import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Swords, Flag, Building2, ChevronDown, ChevronRight } from "lucide-react";
import { useHostClubs, useOwnerOrganisations } from "@/hooks/use-tournaments";
import { ClubChampsTab } from "@/components/club-admin/ClubChampsTab";

/**
 * Association / federation tournament planning.
 *
 * Deliberately reuses the club wizard (`ClubChampsTab`) so every level plans
 * tournaments the same way — capacity, courts, time slots, leagues, schedule
 * preview. The only difference is the owning body and the fact that any club
 * nationwide can host and contribute entrants.
 */
export default function SuperAdminTournaments() {
  const { data: orgs = [] } = useOwnerOrganisations();
  const { data: clubs = [] } = useHostClubs();

  const bodies = useMemo(
    () => orgs.filter((o) => o.kind === "national" || o.kind === "association"),
    [orgs],
  );
  const [ownerOrgId, setOwnerOrgId] = useState<string | null>(null);
  const activeOwner = ownerOrgId ?? bodies.find((b) => b.kind === "national")?.id ?? null;
  const owner = bodies.find((b) => b.id === activeOwner) || null;

  const [hostClubId, setHostClubId] = useState<string>("");
  const [extraClubIds, setExtraClubIds] = useState<Set<string>>(new Set());
  const [showVenues, setShowVenues] = useState(true);
  const [search, setSearch] = useState("");

  const filteredClubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? clubs.filter((c) => c.name.toLowerCase().includes(q)) : clubs;
  }, [clubs, search]);

  const toggleClub = (id: string) => {
    setExtraClubIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5 max-w-7xl">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Swords className="w-5 h-5" /> Tournaments
        </h2>
        <p className="text-xs text-white/50">
          Plan association and federation competitions with the same wizard the clubs use. Pick the owning body, the
          host venue and any extra clubs whose courts and members take part.
        </p>
      </div>

      <Card className="bg-white/[0.04] border-white/10 backdrop-blur-md">
        <CardHeader className="pb-2">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-white/50">Owning body</Label>
              <Select value={activeOwner ?? ""} onValueChange={(v) => setOwnerOrgId(v)}>
                <SelectTrigger className="bg-white/[0.06] border-white/10 text-white">
                  <SelectValue placeholder="Select federation or association" />
                </SelectTrigger>
                <SelectContent>
                  {bodies.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.kind === "national" ? "🏳 " : "◆ "}
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-white/50">Primary host club</Label>
              <Select value={hostClubId} onValueChange={setHostClubId}>
                <SelectTrigger className="bg-white/[0.06] border-white/10 text-white">
                  <SelectValue placeholder="Select host club" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {clubs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-[11px] text-white/50">
            {owner?.kind === "national" ? <Flag className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
            {owner
              ? `${owner.name} — ${owner.kind === "national" ? "national federation" : "association"} level`
              : "No body selected"}
          </div>

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-white/70 px-0 hover:bg-transparent"
              onClick={() => setShowVenues((v) => !v)}
            >
              {showVenues ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
              Additional venues &amp; entrant pool ({extraClubIds.size} selected)
            </Button>
            {showVenues && (
              <div className="mt-2 space-y-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search clubs…"
                  className="bg-white/[0.06] border-white/10 text-white h-8"
                />
                <div className="max-h-56 overflow-y-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-1 rounded-md border border-white/10 p-2">
                  {filteredClubs
                    .filter((c) => c.id !== hostClubId)
                    .map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-xs text-white/80">
                        <Checkbox checked={extraClubIds.has(c.id)} onCheckedChange={() => toggleClub(c.id)} />
                        <span className="truncate">{c.name}</span>
                      </label>
                    ))}
                </div>
                <p className="text-[11px] text-white/40">
                  Courts and members of these clubs become available in the wizard alongside the host club.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {activeOwner && hostClubId ? (
        <div className="rounded-lg bg-background text-foreground p-3">
          <ClubChampsTab
            key={`${activeOwner}-${hostClubId}`}
            clubId={hostClubId}
            ownerOrgId={activeOwner}
            scope={owner?.kind === "national" ? "federation" : "association"}
            participatingClubIds={Array.from(extraClubIds)}
          />
        </div>
      ) : (
        <p className="text-sm text-white/60">Select an owning body and a host club to plan a tournament.</p>
      )}
    </div>
  );
}
