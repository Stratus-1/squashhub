import { useState, useRef } from "react";
import { useClubMembers, useFeeCategories, ClubMember } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Upload, Search, Edit2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function MembersTab({ clubId }: { clubId: string }) {
  const { data: members = [], isLoading } = useClubMembers(clubId);
  const { data: feeCategories = [] } = useFeeCategories(clubId);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<ClubMember | null>(null);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = members.filter(m => {
    const name = m.profiles?.name || "";
    const email = m.profiles?.email || "";
    const q = search.toLowerCase();
    return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || (m.club_member_number || "").toLowerCase().includes(q);
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this member from the club?")) return;
    const { error } = await fromExt("club_members").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Member removed"); qc.invalidateQueries({ queryKey: ["club-members"] }); }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) { toast.error("CSV must have a header row + data"); return; }

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const emailIdx = headers.indexOf("email");
    if (emailIdx < 0) { toast.error("CSV must have an 'email' column"); return; }

    const nameIdx = headers.indexOf("name");
    const phoneIdx = headers.indexOf("phone");
    const memberNumIdx = headers.indexOf("member_number");
    const leagueIdx = headers.indexOf("plays_league");

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim());
      const email = cols[emailIdx];
      if (!email) continue;

      // Find user by email in profiles
      const { data: profile } = await fromExt("profiles").select("id").eq("email", email).maybeSingle();
      if (!profile) {
        toast.error(`No account found for ${email} — they need to sign up first`);
        continue;
      }

      const { error } = await fromExt("club_members").upsert({
        club_id: clubId,
        user_id: profile.id,
        club_member_number: memberNumIdx >= 0 ? cols[memberNumIdx] : undefined,
        plays_league: leagueIdx >= 0 ? cols[leagueIdx]?.toLowerCase() === "true" : false,
      }, { onConflict: "club_id,user_id" });

      if (!error) imported++;
    }
    toast.success(`Imported ${imported} members`);
    qc.invalidateQueries({ queryKey: ["club-members"] });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members..." className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1" />CSV Import
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
          <AddMemberDialog clubId={clubId} open={addOpen} onOpenChange={setAddOpen} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""}</p>

      <div className="space-y-2">
        {filtered.map(m => (
          <Card key={m.id} className="p-3 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{m.profiles?.name || "—"}</span>
                <Badge variant={m.role === "captain" ? "default" : m.role === "admin" ? "secondary" : "outline"} className="text-[10px]">{m.role}</Badge>
                {m.plays_league && <Badge variant="outline" className="text-[10px] text-primary">League</Badge>}
              </div>
              <p className="text-xs text-muted-foreground truncate">{m.profiles?.email} {m.club_member_number ? `• #${m.club_member_number}` : ""}</p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditMember(m)}><Edit2 className="w-3.5 h-3.5" /></Button>
              {m.role !== "captain" && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(m.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              )}
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No members found</p>}
      </div>

      {editMember && <EditMemberDialog member={editMember} onClose={() => { setEditMember(null); qc.invalidateQueries({ queryKey: ["club-members"] }); }} />}
    </div>
  );
}

function AddMemberDialog({ clubId, open, onOpenChange }: { clubId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [memberNumber, setMemberNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const handleAdd = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { data: profile } = await fromExt("profiles").select("id").eq("email", email.trim()).maybeSingle();
      if (!profile) { toast.error("No account found with that email. They need to sign up first."); return; }
      const { error } = await fromExt("club_members").insert({ club_id: clubId, user_id: profile.id, club_member_number: memberNumber || undefined });
      if (error) throw error;
      toast.success("Member added");
      setEmail(""); setMemberNumber("");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["club-members"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to add member");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm"><UserPlus className="w-4 h-4 mr-1" />Add Member</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1"><Label>Email</Label><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="member@example.com" /></div>
          <div className="space-y-1"><Label>Club Member Number</Label><Input value={memberNumber} onChange={e => setMemberNumber(e.target.value)} placeholder="Optional" /></div>
          <Button onClick={handleAdd} disabled={loading} className="w-full">{loading ? "Adding..." : "Add Member"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({ member, onClose }: { member: ClubMember; onClose: () => void }) {
  const [form, setForm] = useState({
    club_member_number: member.club_member_number || "",
    role: member.role,
    plays_league: member.plays_league,
    league_player_rank: member.league_player_rank ?? "",
    id_number: member.id_number || "",
    address: member.address || "",
  });

  const handleSave = async () => {
    const { error } = await fromExt("club_members").update({
      club_member_number: form.club_member_number || null,
      role: form.role,
      plays_league: form.plays_league,
      league_player_rank: form.league_player_rank ? Number(form.league_player_rank) : null,
      id_number: form.id_number || null,
      address: form.address || null,
    }).eq("id", member.id);
    if (error) toast.error(error.message);
    else { toast.success("Member updated"); onClose(); }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {member.profiles?.name || "Member"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Member Number</Label><Input value={form.club_member_number} onChange={e => setForm(p => ({ ...p, club_member_number: e.target.value }))} /></div>
          <div className="space-y-1">
            <Label>Role</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as any }))}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="captain">Captain</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.plays_league} onChange={e => setForm(p => ({ ...p, plays_league: e.target.checked }))} />
            <Label>Plays League</Label>
          </div>
          {form.plays_league && (
            <div className="space-y-1"><Label>Player Rank (1-4)</Label><Input type="number" min={1} max={4} value={form.league_player_rank} onChange={e => setForm(p => ({ ...p, league_player_rank: e.target.value }))} /></div>
          )}
          <div className="space-y-1"><Label>ID Number</Label><Input value={form.id_number} onChange={e => setForm(p => ({ ...p, id_number: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Address</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
          <Button onClick={handleSave} className="w-full">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
