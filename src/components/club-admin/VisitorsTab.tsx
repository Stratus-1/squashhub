import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, Search, Pencil, UserPlus, Settings2, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface Visitor {
  id: string;
  source?: "visitor_registration" | "member_record";
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  home_club_name: string;
  member_number: string | null;
  category: string;
  created_at: string;
}

interface HomeClubOption {
  id: string;
  name: string;
}

export function VisitorsTab({ clubId }: { clubId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<Visitor | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Add Visitor dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addFirstName, setAddFirstName] = useState("");
  const [addLastName, setAddLastName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addCategory, setAddCategory] = useState("Men");
  const [addMemberNumber, setAddMemberNumber] = useState("");
  const [addHomeClubMode, setAddHomeClubMode] = useState<"picker" | "other">("picker");
  const [addHomeClub, setAddHomeClub] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  // Manage home clubs dialog state
  const [manageOpen, setManageOpen] = useState(false);
  const [newHomeClub, setNewHomeClub] = useState("");
  const [addingOption, setAddingOption] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingOptionValue, setEditingOptionValue] = useState("");

  // Curated home-club options for this club
  const { data: homeClubRows = [] } = useQuery({
    queryKey: ["club-visitor-home-clubs", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_visitor_home_clubs")
        .select("id, name")
        .eq("club_id", clubId)
        .order("name");
      if (error) throw error;
      return (data || []) as HomeClubOption[];
    },
  });

  const { data: visitors = [], isLoading } = useQuery({
    queryKey: ["club-visitors", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_visitors")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { data: memberVisitors, error: memberError } = await fromExt("club_members")
        .select("id, name, email, phone, club_member_number, gender, joined_at, home_club_name, profiles:user_id(email, phone)")
        .eq("club_id", clubId)
        .eq("role", "visitor")
        .order("joined_at", { ascending: false });
      if (memberError) throw memberError;

      const registeredVisitors = (data || []).map((v: Visitor) => ({ ...v, source: "visitor_registration" as const }));
      const visitorMembers = (memberVisitors || []).map((m: any) => {
        const parts = String(m.name || "Visitor").trim().split(/\s+/);
        return {
          id: m.id,
          source: "member_record" as const,
          first_name: parts[0] || "Visitor",
          last_name: parts.slice(1).join(" "),
          email: m.email || m.profiles?.email || null,
          phone: m.phone || m.profiles?.phone || null,
          home_club_name: m.home_club_name || "Club visitor",
          member_number: m.club_member_number || null,
          category: m.gender || "Men",
          created_at: m.joined_at,
        };
      });
      return [...registeredVisitors, ...visitorMembers] as Visitor[];
    },
  });

  // Distinct home-club names for the dropdown — curated table + any derived names
  const homeClubOptions = useMemo(() => {
    const set = new Map<string, string>(); // lowercase -> display
    for (const opt of homeClubRows) {
      const n = opt.name.trim();
      if (n) set.set(n.toLowerCase(), n);
    }
    for (const v of visitors) {
      const n = (v.home_club_name || "").trim();
      if (n && n.toLowerCase() !== "no club" && n.toLowerCase() !== "club visitor" && !set.has(n.toLowerCase())) {
        set.set(n.toLowerCase(), n);
      }
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [homeClubRows, visitors]);

  const filtered = visitors.filter((v) => {
    const term = search.toLowerCase();
    if (!term) return true;
    return (
      v.first_name.toLowerCase().includes(term) ||
      v.last_name.toLowerCase().includes(term) ||
      v.home_club_name.toLowerCase().includes(term) ||
      (v.email || "").toLowerCase().includes(term) ||
      (v.phone || "").toLowerCase().includes(term) ||
      (v.member_number || "").toLowerCase().includes(term)
    );
  });

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const visitor = visitors.find((v) => v.id === id);
      if (visitor?.source === "member_record") {
        toast.info("This visitor is linked to an account — edit or remove them from Members.");
        return;
      }
      const { error } = await fromExt("club_visitors").delete().eq("id", id);
      if (error) throw error;
      toast.success("Visitor removed");
      queryClient.invalidateQueries({ queryKey: ["club-visitors", clubId] });
      queryClient.invalidateQueries({ queryKey: ["club-members", clubId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to delete visitor");
    } finally {
      setDeleting(null);
    }
  };

  const openEdit = (v: Visitor) => {
    setEditing(v);
    setEditValue(v.home_club_name && v.home_club_name !== "Club visitor" ? v.home_club_name : "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const value = editValue.trim();
    setSaving(true);
    try {
      if (editing.source === "member_record") {
        const { error } = await fromExt("club_members")
          .update({ home_club_name: value || null })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await fromExt("club_visitors")
          .update({ home_club_name: value || "Visitor" })
          .eq("id", editing.id);
        if (error) throw error;
      }
      toast.success("Home club updated");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["club-visitors", clubId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to update home club");
    } finally {
      setSaving(false);
    }
  };

  const resetAddForm = () => {
    setAddFirstName("");
    setAddLastName("");
    setAddEmail("");
    setAddPhone("");
    setAddCategory("Men");
    setAddMemberNumber("");
    setAddHomeClubMode("picker");
    setAddHomeClub("");
  };

  const submitAdd = async () => {
    const first = addFirstName.trim();
    const last = addLastName.trim();
    const home = addHomeClub.trim();
    if (!first || !last) {
      toast.error("First and last name are required");
      return;
    }
    if (!home) {
      toast.error("Select a home club (or 'No club')");
      return;
    }
    setAddSaving(true);
    try {
      const { error } = await fromExt("club_visitors").insert({
        club_id: clubId,
        first_name: first,
        last_name: last,
        email: addEmail.trim() || null,
        phone: addPhone.trim() || null,
        home_club_name: home,
        member_number: addMemberNumber.trim() || null,
        category: addCategory,
      });
      if (error) throw error;
      // If the typed home club isn't already in the curated list, add it
      if (
        addHomeClubMode === "other" &&
        home.toLowerCase() !== "no club" &&
        !homeClubRows.some((r) => r.name.toLowerCase() === home.toLowerCase())
      ) {
        await fromExt("club_visitor_home_clubs").insert({ club_id: clubId, name: home }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["club-visitor-home-clubs", clubId] });
        });
      }
      toast.success(`${first} ${last} added as visitor`);
      resetAddForm();
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["club-visitors", clubId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to add visitor");
    } finally {
      setAddSaving(false);
    }
  };

  const addHomeClubOption = async () => {
    const name = newHomeClub.trim();
    if (!name) return;
    if (homeClubRows.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      toast.info("That home club is already in the list");
      return;
    }
    setAddingOption(true);
    try {
      const { error } = await fromExt("club_visitor_home_clubs").insert({ club_id: clubId, name });
      if (error) throw error;
      toast.success(`"${name}" added`);
      setNewHomeClub("");
      queryClient.invalidateQueries({ queryKey: ["club-visitor-home-clubs", clubId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to add home club");
    } finally {
      setAddingOption(false);
    }
  };

  const saveHomeClubOption = async (id: string) => {
    const name = editingOptionValue.trim();
    if (!name) return;
    try {
      const { error } = await fromExt("club_visitor_home_clubs").update({ name }).eq("id", id);
      if (error) throw error;
      toast.success("Home club renamed");
      setEditingOptionId(null);
      setEditingOptionValue("");
      queryClient.invalidateQueries({ queryKey: ["club-visitor-home-clubs", clubId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to rename");
    }
  };

  const deleteHomeClubOption = async (id: string, name: string) => {
    const inUse = visitors.some((v) => (v.home_club_name || "").trim().toLowerCase() === name.toLowerCase());
    if (inUse && !confirm(`"${name}" is used by existing visitors. Remove from the dropdown anyway? (Visitors will keep this name on their record.)`)) {
      return;
    }
    try {
      const { error } = await fromExt("club_visitor_home_clubs").delete().eq("id", id);
      if (error) throw error;
      toast.success("Removed from list");
      queryClient.invalidateQueries({ queryKey: ["club-visitor-home-clubs", clubId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to remove");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          Visitors registered for tournaments, competitions, and linked visitor accounts.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setManageOpen(true)}>
            <Settings2 className="w-4 h-4 mr-1.5" /> Home Clubs
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="w-4 h-4 mr-1.5" /> Add Visitor
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search visitors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">
          {visitors.length === 0 ? "No visitors registered yet." : "No visitors match your search."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => (
            <Card key={v.id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">
                    {v.first_name} {v.last_name}
                  </p>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {v.category || "Men"}
                  </Badge>
                  {v.source === "member_record" && (
                    <Badge variant="outline" className="text-[10px] shrink-0">Member record</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {v.home_club_name}
                  {v.member_number ? ` · #${v.member_number}` : ""}
                </p>
                {(v.email || v.phone) && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    {[v.email, v.phone].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => openEdit(v)}
                title="Edit home club"
              >
                <Pencil className="w-4 h-4" />
              </Button>
              {v.source !== "member_record" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive"
                  disabled={deleting === v.id}
                  onClick={() => handleDelete(v.id)}
                >
                  {deleting === v.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Edit visitor's home club */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit home club</DialogTitle>
            <DialogDescription>
              {editing ? `${editing.first_name} ${editing.last_name}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="home-club">Home club name</Label>
            <Input
              id="home-club"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="e.g. White River Squash Club"
              maxLength={100}
            />
            <p className="text-[11px] text-muted-foreground">
              Leave blank to clear. This is shown next to the visitor's name.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add visitor */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetAddForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add visitor</DialogTitle>
            <DialogDescription className="text-xs">
              Register a visitor for tournaments, leagues, or club play.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="av-first" className="text-xs">First name *</Label>
                <Input id="av-first" value={addFirstName} onChange={(e) => setAddFirstName(e.target.value)} maxLength={50} />
              </div>
              <div>
                <Label htmlFor="av-last" className="text-xs">Last name *</Label>
                <Input id="av-last" value={addLastName} onChange={(e) => setAddLastName(e.target.value)} maxLength={50} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="av-email" className="text-xs">Email</Label>
                <Input id="av-email" type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} maxLength={100} />
              </div>
              <div>
                <Label htmlFor="av-phone" className="text-xs">Phone</Label>
                <Input id="av-phone" type="tel" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} maxLength={20} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="av-category" className="text-xs">Category</Label>
                <Select value={addCategory} onValueChange={setAddCategory}>
                  <SelectTrigger id="av-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Men">Men</SelectItem>
                    <SelectItem value="Ladies">Ladies</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="av-membernum" className="text-xs">Member # at home club</Label>
                <Input id="av-membernum" value={addMemberNumber} onChange={(e) => setAddMemberNumber(e.target.value)} maxLength={20} />
              </div>
            </div>
            <div>
              <Label htmlFor="av-home-club" className="text-xs">Home club *</Label>
              <Select
                value={addHomeClubMode === "other" ? "__other__" : (addHomeClub || "")}
                onValueChange={(v) => {
                  if (v === "__other__") {
                    setAddHomeClubMode("other");
                    setAddHomeClub("");
                  } else {
                    setAddHomeClubMode("picker");
                    setAddHomeClub(v);
                  }
                }}
              >
                <SelectTrigger id="av-home-club"><SelectValue placeholder="Select home club" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {homeClubOptions.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                  <SelectItem value="No club">No club (independent)</SelectItem>
                  <SelectItem value="__other__">Other (type in)</SelectItem>
                </SelectContent>
              </Select>
              {addHomeClubMode === "other" && (
                <Input
                  className="mt-2"
                  placeholder="Type club name"
                  value={addHomeClub}
                  onChange={(e) => setAddHomeClub(e.target.value)}
                  maxLength={100}
                />
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                Manage the dropdown list via the <span className="font-medium">Home Clubs</span> button above. New "Other" entries are auto-added to the list.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addSaving}>Cancel</Button>
            <Button onClick={submitAdd} disabled={addSaving}>
              {addSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-1.5" />}
              Add visitor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage home-club options */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage home clubs</DialogTitle>
            <DialogDescription className="text-xs">
              These options appear in the visitor sign-up dropdown — both on the public sign-up form and the Add Visitor dialog. "No club" and "Other" are always shown.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Input
              placeholder="e.g. White River Squash Club"
              value={newHomeClub}
              onChange={(e) => setNewHomeClub(e.target.value)}
              maxLength={100}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addHomeClubOption(); } }}
            />
            <Button onClick={addHomeClubOption} disabled={addingOption || !newHomeClub.trim()}>
              {addingOption ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-1 border rounded-md p-2 bg-muted/20">
            {homeClubRows.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No home clubs yet. Add one above.
              </p>
            ) : (
              homeClubRows.map((opt) => (
                <div key={opt.id} className="flex items-center gap-2 p-1.5 bg-background rounded">
                  {editingOptionId === opt.id ? (
                    <>
                      <Input
                        value={editingOptionValue}
                        onChange={(e) => setEditingOptionValue(e.target.value)}
                        maxLength={100}
                        className="h-8 text-xs"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveHomeClubOption(opt.id); } }}
                      />
                      <Button size="sm" className="h-8" onClick={() => saveHomeClubOption(opt.id)}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => { setEditingOptionId(null); setEditingOptionValue(""); }}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm truncate">{opt.name}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => { setEditingOptionId(opt.id); setEditingOptionValue(opt.name); }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteHomeClubOption(opt.id, opt.name)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setManageOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
