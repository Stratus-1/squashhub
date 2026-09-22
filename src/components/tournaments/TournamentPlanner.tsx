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
import { useAssociationTenant } from "@/hooks/use-association-tenant";
import { useOrgHierarchyLite } from "@/hooks/use-tournament-eligibility";
import { orgDescendants } from "@/lib/tournaments/eligibility";
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
  // An association tenant (a regional league) has no courts of its own — its
  // venues and its entrant pool are the clubs affiliated to it.
  const assoc = useAssociationTenant(mode === "club" ? clubId : undefined);
  const { data: hierarchy } = useOrgHierarchyLite();

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

  // An association owns no courts, so the venue picker must be visible up front —
  // without it the Courts step has nothing to offer.
  useEffect(() => {
    if (assoc.isAssociation) setShowVenues(true);
  }, [assoc.isAssociation]);

  const activeOwner =
    mode === "club"
      ? (assoc.isAssociation ? assoc.orgId : clubOrg?.id) ?? null
      : ownerOrgId ?? bodies.find((b) => b.kind === "national")?.id ?? null;
  const owner = mode === "club" ? orgs.find((o) => o.id === activeOwner) || null : bodies.find((b) => b.id === activeOwner) || null;

  // Clubs beneath the owning body in the Super Admin organisation tree — the
  // same hierarchy eligibility uses, so venues and entrants agree.
  const treeClubs = useMemo(() => {
    if (!hierarchy || !activeOwner) return [] as { id: string; name: string }[];
    const within = orgDescendants(activeOwner, hierarchy.rels);
    const out: { id: string; name: string }[] = [];
    hierarchy.orgs.forEach((o) => {
      if (o.kind === "club" && o.club_id && within.has(o.id)) {
        out.push({ id: o.club_id, name: hierarchy.clubNames.get(o.club_id) || o.name });
      }
    });
    return out;
  }, [hierarchy, activeOwner]);

  // For an association the Federation tree is authoritative. An old league
  // affiliation must not make an unrelated club a venue or player source.
  const venueChoices = useMemo(() => {
    if (mode === "platform" && !activeOwner) return [];
    return [...treeClubs].sort((a, b) => a.name.localeCompare(b.name));
  }, [treeClubs, mode, activeOwner]);

  const effectiveHostClubId = mode === "platform" && !venueChoices.some((c) => c.id === hostClubId)
    ? ""
    : hostClubId;

  // Flag contradictory legacy affiliations to admins, without offering them
  // as tournament venues or entrants.
  const missingFromTree = useMemo(() => {
    if (!assoc.isAssociation || !activeOwner || !hierarchy) return [] as string[];
    const inTree = new Set(treeClubs.map((c) => c.id));
    return assoc.clubs.filter((c) => !inTree.has(c.id)).map((c) => c.name);
  }, [assoc.isAssociation, assoc.clubs, treeClubs, activeOwner, hierarchy]);

  // Switching the owning body must not carry a venue from another region.
  useEffect(() => {
    setExtraClubIds((previous) => {
      const allowed = new Set(venueChoices.map((c) => c.id));
      const filtered = new Set([...previous].filter((id) => allowed.has(id)));
      return filtered.size === previous.size ? previous : filtered;
    });
  }, [venueChoices]);

  const filteredClubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? venueChoices.filter((c) => c.name.toLowerCase().includes(q)) : venueChoices;
  }, [venueChoices, search]);

  const toggleClub = (id: string) => {
    setExtraClubIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // A plain club admin never sees the multi-venue picker — only elevated users
  // (platform / federation) and associations plan events across clubs.
  const canPickVenues = mode === "platform" || isSuperAdmin || assoc.isAssociation;

  const label = dark ? "text-white/50" : "text-muted-foreground";
  const field = dark ? "bg-white/[0.06] border-white/10 text-white" : "";

  const scope: "club" | "association" | "federation" =
    mode === "club"
      ? assoc.isAssociation
        ? "association"
        : "club"
      : owner?.kind === "national"
        ? "federation"
        : "association";

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
                  {clubOrg?.name || assoc.name || "This club"}
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
              <Label className={cn("text-[11px] uppercase tracking-wide", label)}>
                {assoc.isAssociation ? "Venues" : "Primary host club"}
              </Label>
              {mode === "club" ? (
                <div className={cn("flex items-center gap-2 text-sm h-9", dark ? "text-white" : "text-foreground")}>
                  {assoc.isAssociation
                    ? extraClubIds.size > 0
                      ? `${extraClubIds.size} club${extraClubIds.size === 1 ? "" : "s"} hosting`
                      : "Pick the clubs whose courts are used"
                    : clubs.find((c) => c.id === clubId)?.name || "This club"}
                </div>
              ) : (
                 <Select value={effectiveHostClubId} onValueChange={setHostClubId}>
                  <SelectTrigger className={field}>
                    <SelectValue placeholder="Select host club" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                     {venueChoices.map((c) => (
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
                {assoc.isAssociation
                  ? `Venues — clubs whose courts can be used (${extraClubIds.size} selected)`
                  : `Additional venues & entrant pool (${extraClubIds.size} selected)`}
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
                       .filter((c) => c.id !== effectiveHostClubId)
                      .map((c) => (
                        <label key={c.id} className={cn("flex items-center gap-2 text-xs", dark ? "text-white/80" : "text-foreground")}>
                          <Checkbox checked={extraClubIds.has(c.id)} onCheckedChange={() => toggleClub(c.id)} />
                          <span className="truncate">{c.name}</span>
                        </label>
                      ))}
                     {filteredClubs.length === 0 && <p className={cn("text-xs col-span-full", label)}>No clubs in this body's Federation tree. Add a club in Federation before choosing its courts.</p>}
                  </div>
                  <p className={cn("text-[11px]", label)}>
                    {assoc.isAssociation
                      ? "Every court registered at the clubs you tick becomes available when you build the schedule."
                      : "Courts and members of these clubs become available in the wizard alongside the host club."}
                  </p>
                  {missingFromTree.length > 0 && (
                    <p className={cn("text-[11px]", dark ? "text-amber-300" : "text-amber-600")}>
                       {missingFromTree.length} legacy affiliation{missingFromTree.length === 1 ? " is" : "s are"} outside this association's Federation tree
                       ({missingFromTree.slice(0, 4).join(", ")}{missingFromTree.length > 4 ? "…" : ""}).
                       These clubs are excluded from this tournament. Review their affiliation in Federation.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

       {effectiveHostClubId ? (
        <div className={cn(dark && "rounded-lg bg-background text-foreground p-3")}>
          <ClubChampsTab
             key={`${activeOwner ?? "club"}-${effectiveHostClubId}`}
             clubId={effectiveHostClubId}
            ownerOrgId={mode === "club" ? null : activeOwner}
            eligibilityOrgId={mode === "club" ? assoc.orgId : null}
            scope={scope}
             participatingClubIds={Array.from(extraClubIds).filter((id) => venueChoices.some((c) => c.id === id))}
          />
        </div>
      ) : (
        <p className={cn("text-sm", label)}>Select an owning body and a host club to plan a tournament.</p>
      )}
    </div>
  );
}
