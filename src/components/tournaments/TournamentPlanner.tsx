import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag, Building2, ChevronDown, ChevronRight } from "lucide-react";
import { useHostClubs, useOwnerOrganisations } from "@/hooks/use-tournaments";
import { useIsSuperAdmin } from "@/hooks/use-club";
import { ClubChampsTab } from "@/components/club-admin/ClubChampsTab";
import { cn } from "@/lib/utils";

interface TournamentPlannerProps {
  /**
   * `club` — mounted inside Club Admin: the owning body and host venue are the
   * club itself, so a normal club admin sees the wizard exactly as before.
   * `platform` — Super Admin: pick any owning body and host club nationwide.
   */
  mode: "club" | "platform";
  /** Required in club mode. */
  clubId?: string;
  /** Light-on-dark chrome (Super Admin shell). */
  dark?: boolean;
}

export function TournamentPlanner({ mode, clubId, dark = false }: TournamentPlannerProps) {
  const { data: orgs = [] } = useOwnerOrganisations();
  const { data: clubs = [] } = useHostClubs();
  const isSuperAdmin = useIsSuperAdmin();

  const bodies = useMemo(
    () => orgs.filter((o) => o.kind === "national" || o.kind === "association"),
    [orgs],
  );

  // ── Club mode ──────────────────────────────────────────────────────────────
  const clubOrg = useMemo(
    () => (clubId ? orgs.find((o) => o.club_id === clubId) || null : null),
    [orgs, clubId],
  );

  const [ownerOrgId, setOwnerOrgId] = useState<string | null>(null);
  const [hostClubId, setHostClubId] = useState<string>(mode === "club" ? clubId || "" : "");
  const [extraClubIds, setExtraClubIds] = useState<Set<string>>(new Set());
  const [showVenues, setShowVenues] = useState(mode === "platform");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (mode === "club" && clubId) setHostClubId(clubId);
  }, [mode, clubId]);

  const activeOwner =
    mode === "club"
      ? clubOrg?.id ?? null
      : ownerOrgId ?? bodies.find((b) => b.kind === "national")?.id ?? null;
  const owner = mode === "club" ? clubOrg : bodies.find((b) => b.id === activeOwner) || null;

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

  // A plain club admin never sees the multi-venue picker — only elevated users
  // (platform / federation) plan events across clubs.
  const canPickVenues = mode === "platform" || isSuperAdmin;

  const label = dark ? "text-white/50" : "text-muted-foreground";
  const field = dark ? "bg-white/[0.06] border-white/10 text-white" : "";

  const scope: "club" | "association" | "federation" =
    mode === "club" ? "club" : owner?.kind === "national" ? "federation" : "association";

  return (
    <div className="space-y-4">
      <Card className={cn(dark && "bg-white/[0.04] border-white/10 backdrop-blur-md")}>
        <CardHeader className="pb-2">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className={cn("text-[11px] uppercase tracking-wide", label)}>Owning body</Label>
              {mode === "club" ? (
                <div className={cn("flex items-center gap-2 text-sm h-9", dark ? "text-white" : "text-foreground")}>
                  <Building2 className="w-4 h-4 opacity-60" />
                  {clubOrg?.name || "This club"}
                </div>
              ) : (
                <Select value={activeOwner ?? ""} onValueChange={(v) => setOwnerOrgId(v)}>
                  <SelectTrigger className={field}>
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
              )}
            </div>
            <div className="space-y-1">
              <Label className={cn("text-[11px] uppercase tracking-wide", label)}>Primary host club</Label>
              {mode === "club" ? (
                <div className={cn("flex items-center gap-2 text-sm h-9", dark ? "text-white" : "text-foreground")}>
                  {clubs.find((c) => c.id === clubId)?.name || "This club"}
                </div>
              ) : (
                <Select value={hostClubId} onValueChange={setHostClubId}>
                  <SelectTrigger className={field}>
                    <SelectValue placeholder="Select host club" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {clubs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {mode === "platform" && (
            <div className={cn("flex items-center gap-2 text-[11px]", label)}>
              {owner?.kind === "national" ? <Flag className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
              {owner
                ? `${owner.name} — ${owner.kind === "national" ? "national federation" : "association"} level`
                : "No body selected"}
            </div>
          )}

          {canPickVenues && (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn("px-0 hover:bg-transparent", dark && "text-white/70")}
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
                    className={cn("h-8", field)}
                  />
                  <div className={cn("max-h-56 overflow-y-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-1 rounded-md border p-2", dark && "border-white/10")}>
                    {filteredClubs
                      .filter((c) => c.id !== hostClubId)
                      .map((c) => (
                        <label key={c.id} className={cn("flex items-center gap-2 text-xs", dark ? "text-white/80" : "text-foreground")}>
                          <Checkbox checked={extraClubIds.has(c.id)} onCheckedChange={() => toggleClub(c.id)} />
                          <span className="truncate">{c.name}</span>
                        </label>
                      ))}
                  </div>
                  <p className={cn("text-[11px]", label)}>
                    Courts and members of these clubs become available in the wizard alongside the host club.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {hostClubId ? (
        <div className={cn(dark && "rounded-lg bg-background text-foreground p-3")}>
          <ClubChampsTab
            key={`${activeOwner ?? "club"}-${hostClubId}`}
            clubId={hostClubId}
            ownerOrgId={mode === "club" ? null : activeOwner}
            scope={scope}
            participatingClubIds={Array.from(extraClubIds)}
          />
        </div>
      ) : (
        <p className={cn("text-sm", label)}>Select an owning body and a host club to plan a tournament.</p>
      )}
    </div>
  );
}
