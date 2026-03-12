import { useState, useRef, useCallback, useEffect } from "react";
import { useLeagueAssociations, useLeagues, useClubMembers, LeagueAssociation, League, ClubMember } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Users, X } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";

// ─── Types ───
interface LeaguePlayer {
  id: string; // registration id (or temp)
  club_member_id: string;
  league_id: string;
  player_rank: number;
  member?: ClubMember;
}

// ─── Main Tab ───
export function LeaguesTab({ clubId }: { clubId: string }) {
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: leagues = [] } = useLeagues(clubId);
  const { data: members = [] } = useClubMembers(clubId);
  const [addAssocOpen, setAddAssocOpen] = useState(false);
  const [addLeagueOpen, setAddLeagueOpen] = useState(false);
  const [manageLeagueId, setManageLeagueId] = useState<string | null>(null);
  const qc = useQueryClient();

  const handleDeleteAssoc = async (id: string) => {
    if (!confirm("Delete this association?")) return;
    const { error } = await fromExt("league_associations").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["league-associations"] }); }
  };

  const handleDeleteLeague = async (id: string) => {
    if (!confirm("Delete this league?")) return;
    const { error } = await fromExt("leagues").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["leagues"] }); }
  };

  const menLeagues = leagues.filter(l => l.name.toLowerCase().includes("men's") || l.name.toLowerCase().startsWith("men"));
  const ladiesLeagues = leagues.filter(l => l.name.toLowerCase().includes("ladies") || l.name.toLowerCase().includes("women"));
  const otherLeagues = leagues.filter(l => !menLeagues.includes(l) && !ladiesLeagues.includes(l));

  const sortLeagues = (list: League[]) =>
    [...list].sort((a, b) => {
      const numA = parseInt(a.name.match(/(\d+)/)?.[1] || "99");
      const numB = parseInt(b.name.match(/(\d+)/)?.[1] || "99");
      return numA - numB;
    });

  const leaguePlayers = members.filter(m => m.plays_league);

  return (
    <div className="space-y-6 mt-4">
      {/* Associations */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">League Associations</h3>
          <AssociationDialog clubId={clubId} open={addAssocOpen} onOpenChange={setAddAssocOpen} />
        </div>
        <div className="space-y-2">
          {associations.map(a => (
            <Card key={a.id} className="p-3 flex items-center justify-between">
              <div>
                <p className="font-medium">{a.name} {a.abbreviation ? `(${a.abbreviation})` : ""}</p>
                <p className="text-xs text-muted-foreground">Fee: R{a.fee_annual ?? 0}/year • Due: Month {a.fee_due_month}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteAssoc(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </Card>
          ))}
          {associations.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No associations added yet</p>}
        </div>
      </div>

      {/* Leagues in two columns */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Leagues</h3>
          <LeagueDialog clubId={clubId} associations={associations} open={addLeagueOpen} onOpenChange={setAddLeagueOpen} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Men's ({menLeagues.length})</h4>
            <div className="space-y-2">
              {sortLeagues(menLeagues).map(l => (
                <LeagueCard key={l.id} league={l} associations={associations} onDelete={handleDeleteLeague} onManage={setManageLeagueId} />
              ))}
              {menLeagues.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No men's leagues</p>}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Ladies ({ladiesLeagues.length})</h4>
            <div className="space-y-2">
              {sortLeagues(ladiesLeagues).map(l => (
                <LeagueCard key={l.id} league={l} associations={associations} onDelete={handleDeleteLeague} onManage={setManageLeagueId} />
              ))}
              {ladiesLeagues.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No ladies leagues</p>}
            </div>
          </div>
        </div>

        {otherLeagues.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Other ({otherLeagues.length})</h4>
            <div className="space-y-2">
              {sortLeagues(otherLeagues).map(l => (
                <LeagueCard key={l.id} league={l} associations={associations} onDelete={handleDeleteLeague} onManage={setManageLeagueId} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Manage players dialog */}
      {manageLeagueId && (
        <ManageLeaguePlayers
          leagueId={manageLeagueId}
          league={leagues.find(l => l.id === manageLeagueId)!}
          clubId={clubId}
          members={leaguePlayers}
          open={!!manageLeagueId}
          onOpenChange={(o) => !o && setManageLeagueId(null)}
        />
      )}
    </div>
  );
}

// ─── League Card ───
function LeagueCard({ league, associations, onDelete, onManage }: {
  league: League;
  associations: LeagueAssociation[];
  onDelete: (id: string) => void;
  onManage: (id: string) => void;
}) {
  const { data: regs = [] } = useQuery({
    queryKey: ["league-registrations", league.id],
    queryFn: async () => {
      const { data, error } = await fromExt("member_league_registrations")
        .select("*")
        .eq("league_id", league.id)
        .order("player_rank");
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{league.name} {league.code ? `(${league.code})` : ""}</p>
          <p className="text-xs text-muted-foreground">
            {associations.find(a => a.id === league.association_id)?.name || "No association"}
            {regs.length > 0 && ` • ${regs.length} player${regs.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onManage(league.id)} title="Manage players">
            <Users className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(league.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Manage League Players (drag & drop) ───
function ManageLeaguePlayers({ leagueId, league, clubId, members, open, onOpenChange }: {
  leagueId: string;
  league: League;
  clubId: string;
  members: ClubMember[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [players, setPlayers] = useState<LeaguePlayer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Load existing registrations
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await fromExt("member_league_registrations")
        .select("*")
        .eq("league_id", leagueId)
        .order("player_rank");
      if (!error && data) {
        setPlayers(data.map((r: any) => ({
          id: r.id,
          club_member_id: r.club_member_id,
          league_id: r.league_id,
          player_rank: r.player_rank ?? 0,
          member: members.find(m => m.id === r.club_member_id),
        })));
      }
      setLoaded(true);
    })();
  }, [open, leagueId, members]);

  const assignedMemberIds = players.map(p => p.club_member_id);

  // Filter available members based on league gender
  const isLadies = league.name.toLowerCase().includes("ladies") || league.name.toLowerCase().includes("women");
  const availableMembers = members.filter(m =>
    !assignedMemberIds.includes(m.id) &&
    (isLadies ? m.gender === "Ladies" : m.gender !== "Ladies")
  );

  const addPlayer = (member: ClubMember) => {
    setPlayers(prev => [...prev, {
      id: `new-${Date.now()}-${member.id}`,
      club_member_id: member.id,
      league_id: leagueId,
      player_rank: prev.length + 1,
      member,
    }]);
  };

  const removePlayer = (idx: number) => {
    setPlayers(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((p, i) => ({ ...p, player_rank: i + 1 }));
    });
  };

  const handleDragStart = (idx: number) => { dragItem.current = idx; };
  const handleDragEnter = (idx: number) => { dragOverItem.current = idx; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const items = [...players];
    const dragged = items.splice(dragItem.current, 1)[0];
    items.splice(dragOverItem.current, 0, dragged);
    dragItem.current = null;
    dragOverItem.current = null;
    setPlayers(items.map((p, i) => ({ ...p, player_rank: i + 1 })));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete all existing registrations for this league
      await fromExt("member_league_registrations").delete().eq("league_id", leagueId);

      if (players.length > 0) {
        const { error } = await fromExt("member_league_registrations").insert(
          players.map((p, i) => ({
            club_member_id: p.club_member_id,
            league_id: leagueId,
            player_rank: i + 1,
          }))
        );
        if (error) throw error;
      }

      toast.success(`${players.length} player(s) saved`);
      qc.invalidateQueries({ queryKey: ["league-registrations", leagueId] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const getMemberName = (p: LeaguePlayer) => {
    if (p.member) return p.member.name || p.member.profiles?.name || "Unknown";
    const m = members.find(m => m.id === p.club_member_id);
    return m?.name || m?.profiles?.name || "Unknown";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{league.name} – Players</DialogTitle>
        </DialogHeader>

        {!loaded ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            {/* Current players – draggable */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">
                Ranked Players ({players.length}) — drag to reorder
              </Label>
              {players.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-md">
                  No players assigned. Add from the list below.
                </p>
              )}
              <div className="space-y-1">
                {players.map((p, idx) => (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragEnter={() => handleDragEnter(idx)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                    className="flex items-center gap-2 p-2 bg-muted/50 rounded-md cursor-grab active:cursor-grabbing hover:bg-muted border border-transparent hover:border-border transition-colors"
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="w-6 text-xs font-bold text-primary text-center">{idx + 1}</span>
                    <span className="text-sm flex-1 truncate">{getMemberName(p)}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => removePlayer(idx)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Available members to add */}
            {availableMembers.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">
                  Available {isLadies ? "Ladies" : "Men"} ({availableMembers.length}) — click to add
                </Label>
                <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                  {availableMembers.map(m => (
                    <button
                      key={m.id}
                      onClick={() => addPlayer(m)}
                      className="text-left text-xs p-2 rounded-md hover:bg-primary/10 border border-transparent hover:border-primary/30 transition-colors truncate"
                    >
                      <Plus className="w-3 h-3 inline mr-1 text-primary" />
                      {m.name || m.profiles?.name || "Unknown"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving ? "Saving…" : `Save ${players.length} Player(s)`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Constants ───
const LEAGUE_OPTIONS = Array.from({ length: 14 }, (_, i) => {
  const num = i + 1;
  const suffix = num === 1 ? "st" : num === 2 ? "nd" : num === 3 ? "rd" : "th";
  return `${num}${suffix}`;
});

// ─── Association Dialog ───
function AssociationDialog({ clubId, open, onOpenChange }: { clubId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [form, setForm] = useState({ name: "", abbreviation: "", fee_annual: 0, fee_due_month: 1, fee_payable_to: "", fee_payment_details: "" });
  const qc = useQueryClient();

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const { error } = await fromExt("league_associations").insert({ ...form, club_id: clubId });
    if (error) toast.error(error.message);
    else { toast.success("Association added"); onOpenChange(false); setForm({ name: "", abbreviation: "", fee_annual: 0, fee_due_month: 1, fee_payable_to: "", fee_payment_details: "" }); qc.invalidateQueries({ queryKey: ["league-associations"] }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Association</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add League Association</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Northerns Squash Federation" /></div>
          <div className="space-y-1"><Label>Abbreviation</Label><Input value={form.abbreviation} onChange={e => setForm(p => ({ ...p, abbreviation: e.target.value }))} placeholder="e.g. NSF" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Annual Fee (R)</Label><Input type="number" value={form.fee_annual} onChange={e => setForm(p => ({ ...p, fee_annual: Number(e.target.value) }))} /></div>
            <div className="space-y-1"><Label>Due Month</Label><Input type="number" min={1} max={12} value={form.fee_due_month} onChange={e => setForm(p => ({ ...p, fee_due_month: Number(e.target.value) }))} /></div>
          </div>
          <div className="space-y-1"><Label>Payable To</Label><Input value={form.fee_payable_to} onChange={e => setForm(p => ({ ...p, fee_payable_to: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Payment Details</Label><Input value={form.fee_payment_details} onChange={e => setForm(p => ({ ...p, fee_payment_details: e.target.value }))} /></div>
          <Button onClick={handleSave} className="w-full">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── League Dialog (bulk add) ───
function LeagueDialog({ clubId, associations, open, onOpenChange }: { clubId: string; associations: LeagueAssociation[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [selectedMen, setSelectedMen] = useState<string[]>([]);
  const [selectedLadies, setSelectedLadies] = useState<string[]>([]);
  const [prefix, setPrefix] = useState("");
  const [startNum, setStartNum] = useState(1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [associationId, setAssociationId] = useState("");
  const qc = useQueryClient();

  const handleToggle = (league: string, gender: "men" | "ladies") => {
    const setter = gender === "men" ? setSelectedMen : setSelectedLadies;
    setter(prev => prev.includes(league) ? prev.filter(l => l !== league) : [...prev, league]);
  };

  const buildEntries = () => {
    const parseNum = (l: string) => parseInt(l);
    const sortedMen = [...selectedMen].sort((a, b) => parseNum(a) - parseNum(b));
    const sortedLadies = [...selectedLadies].sort((a, b) => parseNum(a) - parseNum(b));
    const all = [...sortedMen.map(l => ({ label: l, gender: "Men's" })), ...sortedLadies.map(l => ({ label: l, gender: "Ladies" }))];

    let codeNum = startNum;
    return all.map(({ label, gender }) => {
      const code = prefix ? `${prefix}${String(codeNum).padStart(3, "0")}` : null;
      codeNum++;
      return { name: `${gender} ${label} League ${year}`, code, association_id: associationId || null, club_id: clubId };
    });
  };

  const entries = buildEntries();

  const handleSave = async () => {
    if (entries.length === 0) return;
    const { error } = await fromExt("leagues").insert(entries);
    if (error) toast.error(error.message);
    else { toast.success(`${entries.length} league(s) added`); onOpenChange(false); setSelectedMen([]); setSelectedLadies([]); setPrefix(""); setStartNum(1); setYear(new Date().getFullYear()); setAssociationId(""); qc.invalidateQueries({ queryKey: ["leagues"] }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Leagues</Button></DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Leagues</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block font-semibold">Men's Leagues</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {LEAGUE_OPTIONS.map(l => (
                  <label key={`men-${l}`} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                    <input type="checkbox" checked={selectedMen.includes(l)} onChange={() => handleToggle(l, "men")} className="rounded border-input" />
                    {l} League
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block font-semibold">Ladies Leagues</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {LEAGUE_OPTIONS.map(l => (
                  <label key={`ladies-${l}`} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                    <input type="checkbox" checked={selectedLadies.includes(l)} onChange={() => handleToggle(l, "ladies")} className="rounded border-input" />
                    {l} League
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Code Prefix</Label>
              <Input value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} placeholder="e.g. WCS" maxLength={10} />
            </div>
            <div className="space-y-1">
              <Label>Start Number</Label>
              <Input type="number" min={1} value={startNum} onChange={e => setStartNum(Number(e.target.value) || 1)} />
            </div>
            <div className="space-y-1">
              <Label>Year</Label>
              <Input type="number" min={2020} max={2099} value={year} onChange={e => setYear(Number(e.target.value) || new Date().getFullYear())} />
            </div>
          </div>

          {prefix && entries.length > 0 && (
            <div className="bg-muted/50 rounded-md p-3 text-xs space-y-0.5 max-h-32 overflow-y-auto">
              <p className="font-semibold text-muted-foreground mb-1">Preview codes:</p>
              {entries.map((e, i) => (
                <p key={i} className="text-muted-foreground">{e.code} → {e.name}</p>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <Label>Association</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={associationId} onChange={e => setAssociationId(e.target.value)}>
              <option value="">None</option>
              {associations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <Button onClick={handleSave} className="w-full" disabled={entries.length === 0}>
            Add {entries.length} League(s)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
