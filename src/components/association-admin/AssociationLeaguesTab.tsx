/**
 * Association Leagues — the association's view of its affiliated clubs' teams.
 *
 * Clubs own their teams; the association reads them through the
 * `association_league_teams` / `association_league_team_players` RPCs (scoped
 * server-side to affiliated clubs only). Where a club is not on SquashHub yet,
 * the association can create the team and placeholder players itself, then
 * generate the two-leg season fixtures.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronRight, Search, Trophy, UserPlus, Plus, CalendarPlus, Building2, ScrollText } from "lucide-react";
import { usePlatformAssociation } from "@/hooks/use-platform-association";
import { AssociationFixturesPanel } from "@/components/association-admin/AssociationFixturesPanel";
import { AssociationSeasonDialog } from "@/components/association-admin/AssociationSeasonDialog";
import { useAssociationSeasons } from "@/hooks/use-association-seasons";
import AssociationRulesTab from "@/components/super-admin/league/AssociationRulesTab";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  AssocTeam,
  GroupMode,
  buildAssocTree,
  clubsWithoutTeams,
  filterAssocTree,
  isReserveTeam,
  levelLabel,
  seasonsOf,
  summarize,
  teamLevel,
} from "@/lib/leagues/association-tree";
import { saHolidays } from "@/lib/leagues/holidays";
import { generateTwoLegFixtures, GeneratedFixture } from "@/lib/leagues/two-leg-fixtures";

const ALL = "__all__";
const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AssociationLeaguesTab({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<GroupMode>("level");
  const [season, setSeason] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openTeam, setOpenTeam] = useState<Record<string, boolean>>({});
  const [addTeamClub, setAddTeamClub] = useState<{ id: string; name: string } | null>(null);
  const [addPlayerTeam, setAddPlayerTeam] = useState<AssocTeam | null>(null);
  const [fixturesFor, setFixturesFor] = useState<{ label: string; teams: AssocTeam[] } | null>(null);
  const [seasonsOpen, setSeasonsOpen] = useState(false);

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["assoc-league-teams", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("association_league_teams", { _tenant_id: clubId });
      if (error) throw error;
      return (data || []) as AssocTeam[];
    },
  });

  const { data: clubs = [] } = useQuery({
    queryKey: ["assoc-affiliated-clubs", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("association_affiliated_clubs")
        .select("club_id, clubs:club_id(id, name)")
        .eq("association_tenant_id", clubId)
        .eq("status", "active");
      if (error) throw error;
      return (data || [])
        .map((r: any) => r.clubs)
        .filter(Boolean) as { id: string; name: string }[];
    },
  });

  const { data: platformAssoc } = usePlatformAssociation(clubId);
  const platformAssocId = platformAssoc?.id ?? null;


  const { seasons: openSeasons } = useAssociationSeasons(platformAssocId);
  const seasons = useMemo(() => {
    const fromTeams = seasonsOf(teams);
    const declared = openSeasons.map((s) => s.season_year);
    return Array.from(new Set([...fromTeams, ...declared])).sort((a, b) => b - a);
  }, [teams, openSeasons]);

  const currentYear = new Date().getFullYear();
  useEffect(() => {
    if (season === ALL && seasons.length > 0 && seasons.includes(currentYear)) {
      setSeason(String(currentYear));
    }
  }, [seasons, currentYear]);

  const scoped = useMemo(
    () => (season === ALL ? teams : teams.filter((t) => String(t.season_year ?? "") === season)),
    [teams, season]
  );
  const tree = useMemo(() => filterAssocTree(buildAssocTree(scoped, mode), query), [scoped, mode, query]);
  const missing = useMemo(() => clubsWithoutTeams(clubs, scoped), [clubs, scoped]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["assoc-league-teams", clubId] });

  return (
    <div className="space-y-4">
      <Tabs defaultValue="teams" className="space-y-4">
        <TabsList>
          <TabsTrigger value="teams" className="gap-1.5 text-xs">
            <Trophy className="h-3.5 w-3.5" /> Teams &amp; players
          </TabsTrigger>
          <TabsTrigger value="fixtures" className="gap-1.5 text-xs">
            <CalendarPlus className="h-3.5 w-3.5" /> Rounds &amp; fixtures
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5 text-xs">
            <ScrollText className="h-3.5 w-3.5" /> Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fixtures">
          <AssociationFixturesPanel association={platformAssoc ?? null} tenantId={clubId} />
        </TabsContent>

        <TabsContent value="rules">
          {platformAssocId ? (
            <AssociationRulesTab associationId={platformAssocId} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-xs text-muted-foreground">
                This tenant is not linked to a league association yet, so there are no rules to configure.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="teams" className="space-y-4">
      <Card>

        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Affiliated club leagues
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Every team submitted by your affiliated clubs, with the players registered in each. Clubs still own their
            teams — you can add teams and placeholder players for clubs that are not on SquashHub yet.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search club, team or code"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <Select value={season} onValueChange={setSeason}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Season" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All seasons</SelectItem>
                {seasons.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex rounded-md border overflow-hidden">
              {(["level", "club"] as GroupMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "px-3 h-8 text-xs",
                    mode === m ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                  )}
                >
                  By {m === "level" ? "league" : "club"}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSeasonsOpen(true)}>
              <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Seasons
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAddTeamClub(clubs[0] ?? null)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add team
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">{summarize(scoped)}</p>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : tree.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No teams found for this selection.</p>
          ) : (
            <div className="space-y-1.5">
              {tree.map((node) => {
                const isOpen = open[node.key] ?? true;
                return (
                  <div key={node.key} className="rounded-md border">
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => setOpen((m) => ({ ...m, [node.key]: !isOpen }))}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={isOpen ? "Collapse" : "Expand"}
                      >
                        <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
                      </button>
                      <span className="text-sm font-medium flex-1 truncate">{node.label}</span>
                      <Badge variant="secondary" className="h-5 text-[10px] font-normal">
                        {node.teamCount} teams · {node.playerCount} players
                      </Badge>
                      {mode === "level" && node.teamCount >= 2 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setFixturesFor({ label: node.label, teams: node.teams })}
                        >
                          <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Fixtures
                        </Button>
                      )}
                      {mode === "club" && node.clubId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setAddTeamClub({ id: node.clubId!, name: node.label })}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Team
                        </Button>
                      )}
                    </div>

                    {isOpen && (
                      <div className="border-t divide-y">
                        {node.teams.map((t) => (
                          <TeamRow
                            key={t.team_id}
                            tenantId={clubId}
                            team={t}
                            showClub={mode === "level"}
                            showLevel={mode === "club"}
                            expanded={!!openTeam[t.team_id]}
                            onToggle={() => setOpenTeam((m) => ({ ...m, [t.team_id]: !m[t.team_id] }))}
                            onAddPlayer={() => setAddPlayerTeam(t)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {missing.length > 0 && (
            <div className="rounded-md border border-dashed p-2.5">
              <p className="text-[11px] font-medium mb-1 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> No teams submitted yet
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setAddTeamClub(c)}
                    className="text-[11px] rounded border px-2 py-0.5 hover:bg-muted"
                  >
                    {c.name} <Plus className="inline h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>


      <AddTeamDialog
        tenantId={clubId}
        clubs={clubs}
        preselect={addTeamClub}
        onClose={() => setAddTeamClub(null)}
        onSaved={refresh}
      />
      <AddPlayerDialog tenantId={clubId} team={addPlayerTeam} onClose={() => setAddPlayerTeam(null)} onSaved={refresh} />
      <FixturesDialog
        tenantId={clubId}
        platformAssocId={platformAssocId ?? null}
        group={fixturesFor}
        onClose={() => setFixturesFor(null)}
      />
    </div>
  );
}

function TeamRow({
  tenantId,
  team,
  showClub,
  showLevel,
  expanded,
  onToggle,
  onAddPlayer,
}: {
  tenantId: string;
  team: AssocTeam;
  showClub: boolean;
  showLevel: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAddPlayer: () => void;
}) {
  const { data: players, isLoading } = useQuery({
    queryKey: ["assoc-team-players", team.team_id],
    enabled: expanded,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("association_league_team_players", {
        _tenant_id: tenantId,
        _team_id: team.team_id,
      });
      if (error) throw error;
      return (data || []) as {
        registration_id: string;
        member_id: string;
        player_name: string;
        league_number: string | null;
        player_rank: number | null;
        is_reserve: boolean;
        is_captain: boolean;
      }[];
    },
  });

  return (
    <div>
      <div className="flex items-center gap-2 px-2 py-1.5 pl-8">
        <button type="button" onClick={onToggle} className="text-muted-foreground hover:text-foreground">
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
        <span className="text-xs font-medium truncate">{team.team_name}</span>
        {team.team_code && <span className="text-[10px] text-muted-foreground">{team.team_code}</span>}
        {isReserveTeam(team) && (
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">reserves</span>
        )}
        {showLevel && <span className="text-[10px] text-muted-foreground">{levelLabel(teamLevel(team))}</span>}
        {team.created_by_association && (
          <Badge variant="outline" className="h-4 px-1 text-[9px]">
            association-created
          </Badge>
        )}
        <span className="flex-1" />
        {showClub && <span className="text-[11px] text-muted-foreground truncate">{team.club_name}</span>}
        <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-normal">
          {team.player_count} players
        </Badge>
        {team.created_by_association && (
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={onAddPlayer}>
            <UserPlus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {expanded && (
        <div className="pl-16 pr-3 pb-2 space-y-0.5">
          {isLoading && <p className="text-[11px] text-muted-foreground">Loading players…</p>}
          {players?.length === 0 && <p className="text-[11px] text-muted-foreground">No players registered.</p>}
          {players?.map((p) => (
            <div key={p.registration_id} className="flex items-center gap-2 text-[11px]">
              <span className="w-6 text-muted-foreground">{p.player_rank ?? "–"}</span>
              <span className="truncate">{p.player_name}</span>
              {p.league_number && <span className="text-muted-foreground">{p.league_number}</span>}
              {p.is_captain && <Badge className="h-4 px-1 text-[9px]">captain</Badge>}
              {p.is_reserve && <span className="text-[9px] uppercase text-muted-foreground">reserve</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddTeamDialog({
  tenantId,
  clubs,
  preselect,
  onClose,
  onSaved,
}: {
  tenantId: string;
  clubs: { id: string; name: string }[];
  preselect: { id: string; name: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clubIdSel, setClubIdSel] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [level, setLevel] = useState("1");
  const [category, setCategory] = useState("mens");
  const [isReserve, setIsReserve] = useState(false);
  const [seasonYear, setSeasonYear] = useState(String(new Date().getFullYear()));
  const [saving, setSaving] = useState(false);
  const club = clubIdSel || preselect?.id || "";

  const save = async () => {
    if (!club || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc("association_create_team", {
      _tenant_id: tenantId,
      _club_id: club,
      _name: name.trim(),
      _code: code.trim() || null,
      _level: Number(level) || null,
      _category: category,
      _is_reserve: isReserve,
      _season_year: Number(seasonYear) || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Team created");
    setName("");
    setCode("");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!preselect} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add a team on a club's behalf</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Club</Label>
            <Select value={club} onValueChange={setClubIdSel}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select club" />
              </SelectTrigger>
              <SelectContent>
                {clubs.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Team name</Label>
              <Input className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Team code</Label>
              <Input className="h-8 text-xs" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">League level</Label>
              <Input
                type="number"
                min={1}
                className="h-8 text-xs"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Season</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                value={seasonYear}
                onChange={(e) => setSeasonYear(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mens">Men's</SelectItem>
                  <SelectItem value="ladies">Ladies</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={isReserve} onCheckedChange={(v) => setIsReserve(!!v)} /> Reserves team
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !name.trim() || !club}>
            Create team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddPlayerDialog({
  tenantId,
  team,
  onClose,
  onSaved,
}: {
  tenantId: string;
  team: AssocTeam | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [rank, setRank] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!team || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc("association_add_placeholder_player", {
      _tenant_id: tenantId,
      _team_id: team.team_id,
      _name: name.trim(),
      _league_number: number.trim() || null,
      _player_rank: Number(rank) || null,
      _is_reserve: false,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Player added");
    setName("");
    setNumber("");
    setRank("");
    onSaved();
  };

  return (
    <Dialog open={!!team} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Add player to {team?.team_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Player name</Label>
            <Input className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">League number</Label>
              <Input className="h-8 text-xs" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Rank</Label>
              <Input type="number" className="h-8 text-xs" value={rank} onChange={(e) => setRank(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Placeholder players let fixtures and results run before the club joins SquashHub. When the club signs up,
            these records are claimed by the real member.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
            Add player
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FixturesDialog({
  tenantId,
  platformAssocId,
  group,
  onClose,
}: {
  tenantId: string;
  platformAssocId: string | null;
  group: { label: string; teams: AssocTeam[] } | null;
  onClose: () => void;
}) {
  const year = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${year}-01-15`);
  const [dows, setDows] = useState<number[]>([3]);
  const [twoLegs, setTwoLegs] = useState(true);
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [extra, setExtra] = useState("");
  const [saving, setSaving] = useState(false);

  const holidays = useMemo(() => {
    const y = Number(startDate.slice(0, 4)) || year;
    return [...saHolidays(y), ...saHolidays(y + 1)];
  }, [startDate, year]);

  const skipDates = useMemo(() => {
    const list = holidays.filter((h) => skipped[h.date] !== false).map((h) => h.date);
    const manual = extra
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
    return [...new Set([...list, ...manual])];
  }, [holidays, skipped, extra]);

  const fixtures: GeneratedFixture[] = useMemo(() => {
    if (!group) return [];
    return generateTwoLegFixtures({
      teams: group.teams.map((t) => ({
        team_id: t.team_id,
        team_name: t.team_name,
        team_code: t.team_code,
        club_id: t.club_id,
        club_name: t.club_name,
      })),
      division: group.label,
      startDate,
      playDows: dows,
      skipDates,
      twoLegs,
    });
  }, [group, startDate, dows, skipDates, twoLegs]);

  const save = async () => {
    if (!platformAssocId) return toast.error("This association is not linked to a league season yet.");
    setSaving(true);
    const { data, error } = await supabase.rpc("association_save_fixtures", {
      _tenant_id: tenantId,
      _platform_association_id: platformAssocId,
      _fixtures: fixtures as any,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${data} fixtures created`);
    onClose();
  };

  return (
    <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Rounds &amp; fixtures — {group?.label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">First play date</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Play nights</Label>
              <div className="flex gap-1 flex-wrap pt-1">
                {DOWS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDows((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))}
                    className={cn(
                      "px-2 py-1 rounded text-[11px] border",
                      dows.includes(i) ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={twoLegs} onCheckedChange={(v) => setTwoLegs(!!v)} />
            Two rounds — home leg and return leg (venues swap)
          </label>

          <div>
            <Label className="text-xs">Skip public holidays</Label>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1 max-h-40 overflow-y-auto">
              {holidays.map((h) => (
                <label key={h.date} className="flex items-center gap-2 text-[11px]">
                  <Checkbox
                    checked={skipped[h.date] !== false}
                    onCheckedChange={(v) => setSkipped((m) => ({ ...m, [h.date]: !!v }))}
                  />
                  <span className="truncate">
                    {h.date} · {h.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Other dates to skip (yyyy-mm-dd, comma separated)</Label>
            <Input className="h-8 text-xs" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </div>

          <div className="rounded-md border">
            <div className="px-2 py-1.5 text-xs font-medium border-b">
              Preview — {fixtures.length} fixtures over {new Set(fixtures.map((f) => f.fixture_date)).size} nights
            </div>
            <div className="max-h-56 overflow-y-auto divide-y">
              {fixtures.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1 text-[11px]">
                  <span className="w-20 text-muted-foreground">{f.fixture_date}</span>
                  <span className="w-10 text-muted-foreground">R{f.round_number}</span>
                  <span className="flex-1 truncate">
                    {f.home_team_name} vs {f.away_team_name}
                  </span>
                  <span className="text-muted-foreground truncate">{f.venue_name}</span>
                </div>
              ))}
              {fixtures.length === 0 && <p className="text-[11px] text-muted-foreground p-2">Nothing to schedule.</p>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving || fixtures.length === 0}>
            Create {fixtures.length} fixtures
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssociationLeaguesTab;
