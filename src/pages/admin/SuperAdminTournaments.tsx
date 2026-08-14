import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Swords, Plus, Eye, ShieldCheck, ScrollText, Flag, Building2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateOwnedTournament,
  useHostClubs,
  useOwnerOrganisations,
  useTournamentsByOwner,
} from "@/hooks/use-tournaments";
import { TournamentGovernanceDialog } from "@/components/tournaments/TournamentGovernanceDialog";
import { TournamentRulesDialog } from "@/components/tournaments/TournamentRulesDialog";

const today = () => new Date().toISOString().slice(0, 10);

export default function SuperAdminTournaments() {
  const navigate = useNavigate();
  const { data: orgs = [] } = useOwnerOrganisations();
  const { data: clubs = [] } = useHostClubs();
  const create = useCreateOwnedTournament();

  const bodies = useMemo(
    () => orgs.filter((o) => o.kind === "national" || o.kind === "association"),
    [orgs],
  );
  const [ownerOrgId, setOwnerOrgId] = useState<string | null>(null);
  const activeOwner = ownerOrgId ?? bodies.find((b) => b.kind === "national")?.id ?? null;
  const owner = bodies.find((b) => b.id === activeOwner) || null;

  const { data: tournaments = [], isLoading } = useTournamentsByOwner(activeOwner);
  const [governance, setGovernance] = useState<{ id: string; name: string } | null>(null);
  const [rules, setRules] = useState<{ id: string; name: string } | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    host_club_id: "",
    gender: "open",
    match_type: "singles",
    start_date: today(),
    end_date: today(),
    num_groups: 2,
    description: "",
  });

  const submit = async () => {
    if (!activeOwner) return toast.error("Select an owning body first");
    if (!form.name.trim()) return toast.error("Give the tournament a name");
    if (!form.host_club_id) return toast.error("Choose a host venue");
    if (form.end_date < form.start_date) return toast.error("End date is before the start date");
    try {
      const t = await create.mutateAsync({
        name: form.name.trim(),
        owner_org_id: activeOwner,
        host_club_id: form.host_club_id,
        gender: form.gender,
        match_type: form.match_type,
        start_date: form.start_date,
        end_date: form.end_date,
        num_groups: Math.max(1, Number(form.num_groups) || 1),
        description: form.description.trim() || null,
      });
      toast.success("Tournament created — open Governance to set sanctioning and fees");
      setOpen(false);
      setForm((f) => ({ ...f, name: "", description: "" }));
      setGovernance({ id: t.id, name: form.name.trim() });
    } catch (e: any) {
      toast.error(e.message || "Could not create the tournament");
    }
  };

  return (
    <div className="space-y-5 max-w-7xl">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Swords className="w-5 h-5" /> Tournaments
        </h2>
        <p className="text-xs text-white/50">
          Plan and run association and federation competitions on the shared tournament engine. Any club nationwide can
          host, and entries may be drawn from members across all clubs.
        </p>
      </div>

      <Card className="bg-white/[0.04] border-white/10 backdrop-blur-md">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1 min-w-[260px]">
              <Label className="text-[11px] uppercase tracking-wide text-white/50">Owning body</Label>
              <Select value={activeOwner ?? ""} onValueChange={setOwnerOrgId}>
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
            <Button onClick={() => setOpen(true)} disabled={!activeOwner}>
              <Plus className="w-4 h-4 mr-1" /> New tournament
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-white/50">
            {owner?.kind === "national" ? <Flag className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
            {owner ? `${owner.name} — ${owner.kind === "national" ? "national federation" : "association"} level` : "No body selected"}
          </div>

          {isLoading && <p className="text-sm text-white/60">Loading…</p>}
          {!isLoading && tournaments.length === 0 && (
            <p className="text-sm text-white/60">
              No tournaments owned by this body yet. Use <strong>New tournament</strong> to plan one.
            </p>
          )}

          {tournaments.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] p-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">{t.name}</div>
                <div className="text-[11px] text-white/50">
                  {t.start_date} → {t.end_date} · {t.match_type === "doubles" ? "Doubles" : "Singles"} ·{" "}
                  {clubs.find((c) => c.id === t.club_id)?.name || "Host club"}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="outline" className="text-[10px] text-white/70 border-white/20">{t.status}</Badge>
                <Button variant="outline" size="sm" onClick={() => navigate(`/club-champs/${t.id}`)}>
                  <Eye className="w-4 h-4 mr-1" /> Open
                </Button>
                <Button variant="outline" size="sm" onClick={() => setGovernance({ id: t.id, name: t.name })}>
                  <ShieldCheck className="w-4 h-4 mr-1" /> Governance
                </Button>
                <Button variant="outline" size="sm" onClick={() => setRules({ id: t.id, name: t.name })}>
                  <ScrollText className="w-4 h-4 mr-1" /> Rules
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New {owner?.kind === "national" ? "national" : "association"} tournament</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tournament name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. SA National Closed 2026"
              />
            </div>
            <div className="space-y-1">
              <Label>Host venue (any club)</Label>
              <Select value={form.host_club_id} onValueChange={(v) => setForm({ ...form, host_club_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select host club" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {clubs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Extra venues and host compensation are set in Governance → Venues.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="men">Men</SelectItem>
                    <SelectItem value="ladies">Ladies</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Format</Label>
                <Select value={form.match_type} onValueChange={(v) => setForm({ ...form, match_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="singles">Singles</SelectItem>
                    <SelectItem value="doubles">Doubles</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Groups / draws</Label>
                <Input
                  type="number" min={1}
                  value={form.num_groups}
                  onChange={(e) => setForm({ ...form, num_groups: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>End date</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Shown to entrants"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>Create tournament</Button>
          </div>
        </DialogContent>
      </Dialog>

      <TournamentGovernanceDialog champ={governance} onOpenChange={(v) => !v && setGovernance(null)} />
      <TournamentRulesDialog champ={rules} onOpenChange={(v) => !v && setRules(null)} />
    </div>
  );
}
