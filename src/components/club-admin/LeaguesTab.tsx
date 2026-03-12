import { useState } from "react";
import { useLeagueAssociations, useLeagues, LeagueAssociation, League } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Trophy } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function LeaguesTab({ clubId }: { clubId: string }) {
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: leagues = [] } = useLeagues(clubId);
  const [addAssocOpen, setAddAssocOpen] = useState(false);
  const [addLeagueOpen, setAddLeagueOpen] = useState(false);
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

  return (
    <div className="space-y-6 mt-4">
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

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Leagues</h3>
          <LeagueDialog clubId={clubId} associations={associations} open={addLeagueOpen} onOpenChange={setAddLeagueOpen} />
        </div>
        <div className="space-y-2">
          {leagues.map(l => (
            <Card key={l.id} className="p-3 flex items-center justify-between">
              <div>
                <p className="font-medium">{l.name} {l.code ? `(${l.code})` : ""}</p>
                <p className="text-xs text-muted-foreground">
                  {associations.find(a => a.id === l.association_id)?.name || "No association"}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteLeague(l.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </Card>
          ))}
          {leagues.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No leagues added yet</p>}
        </div>
      </div>
    </div>
  );
}

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

const LEAGUE_OPTIONS = Array.from({ length: 14 }, (_, i) => {
  const num = i + 1;
  const suffix = num === 1 ? "st" : num === 2 ? "nd" : num === 3 ? "rd" : "th";
  return `${num}${suffix}`;
});

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

  // Build entries with auto-generated codes: prefix + sequential number (001, 002...) from highest league (1st) to lowest
  const buildEntries = () => {
    // Sort selected by league number (1st=1, 2nd=2, etc.) ascending so 1st league gets lowest code number
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
    else { toast.success(`${entries.length} league(s) added`); onOpenChange(false); setSelectedMen([]); setSelectedLadies([]); setPrefix(""); setStartNum(1); setAssociationId(""); qc.invalidateQueries({ queryKey: ["leagues"] }); }
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Code Prefix</Label>
              <Input value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} placeholder="e.g. WCS" maxLength={10} />
            </div>
            <div className="space-y-1">
              <Label>Start Number</Label>
              <Input type="number" min={1} value={startNum} onChange={e => setStartNum(Number(e.target.value) || 1)} />
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
