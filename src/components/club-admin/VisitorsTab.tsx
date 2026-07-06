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
import { Loader2, Trash2, Search, Pencil, UserPlus, Settings2, Plus, X, DoorOpen } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useMyClub } from "@/hooks/use-club";
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
  const { data: clubData } = useMyClub();
  const club = clubData?.club as any;
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<Visitor | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editMode, setEditMode] = useState<"picker" | "other">("picker");
  const [saving, setSaving] = useState(false);

  // Visitor policy state (persisted on clubs row)
  const [canBook, setCanBook] = useState<boolean>(!!club?.visitors_can_book);
  const [accessCtrl, setAccessCtrl] = useState<boolean>(!!club?.visitors_access_control);
  const [visitorFee, setVisitorFee] = useState<string>(String(club?.visitor_booking_fee ?? 0));
  const [policySaving, setPolicySaving] = useState(false);
  const [policyDirty, setPolicyDirty] = useState(false);

  // Sync when club loads
  useMemo(() => {
    if (club) {
      setCanBook(!!club.visitors_can_book);
      setAccessCtrl(!!club.visitors_access_control);
      setVisitorFee(String(club.visitor_booking_fee ?? 0));
      setPolicyDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id, club?.visitors_can_book, club?.visitors_access_control, club?.visitor_booking_fee]);

  const savePolicy = async () => {
    setPolicySaving(true);
    try {
      const fee = Number(visitorFee) || 0;
      const { error } = await (supabase.from("clubs") as any)
        .update({
          visitors_can_book: canBook,
          visitors_access_control: accessCtrl,
          visitor_booking_fee: fee,
        })
        .eq("id", clubId);
      if (error) throw error;
      toast.success("Visitor policy updated");
      setPolicyDirty(false);
      queryClient.invalidateQueries({ queryKey: ["my-club"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setPolicySaving(false);
    }
  };


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
      // Shadow member rows (created by the tournament wizard to satisfy FKs)
      // store their origin as `club_member_number = 'visitor:<original_uuid>'`.
      // Skip any shadow row whose origin uuid is already in club_visitors so
      // the same person doesn't appear twice.
      const registeredIds = new Set(registeredVisitors.map((v: any) => v.id));
      const visitorMembers = (memberVisitors || [])
        .filter((m: any) => {
          const num = String(m.club_member_number || "");
          if (num.startsWith("visitor:")) {
            const originId = num.slice("visitor:".length);
            if (registeredIds.has(originId)) return false;
          }
          return true;
        })
        .map((m: any) => {
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
    const current = v.home_club_name && v.home_club_name !== "Club visitor" ? v.home_club_name : "";
    setEditValue(current);
    // If current value matches a known option (or blank / No club), use picker; else "other"
    const known = current === "" || current.toLowerCase() === "no club" ||
      homeClubRows.some((r) => r.name.toLowerCase() === current.toLowerCase());
    setEditMode(known ? "picker" : "other");
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

      {/* Visitor policy — bookings & access control */}
      <Card className="p-3 md:p-4 space-y-3 border-primary/30 bg-primary/[0.03]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <DoorOpen className="w-4 h-4 text-primary" />
              Visitor bookings & access
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Controls whether visitors (non-members) can book courts through SquashHub and get access-control entry to the facility.
            </p>
          </div>
          {policyDirty && (
            <Button size="sm" onClick={savePolicy} disabled={policySaving}>
              {policySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Save
            </Button>
          )}
        </div>

        <div className="grid gap-2.5 md:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-2.5 cursor-pointer">
            <div className="min-w-0">
              <div className="text-xs font-semibold">Allow visitor bookings</div>
              <div className="text-[10px] text-muted-foreground">Visitors can book a court from the app.</div>
            </div>
            <Switch
              checked={canBook}
              onCheckedChange={(v) => { setCanBook(v); setPolicyDirty(true); }}
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-2.5 cursor-pointer">
            <div className="min-w-0">
              <div className="text-xs font-semibold">Grant access control</div>
              <div className="text-[10px] text-muted-foreground">Open the door / gate for a visitor at booking time.</div>
            </div>
            <Switch
              checked={accessCtrl}
              onCheckedChange={(v) => { setAccessCtrl(v); setPolicyDirty(true); }}
            />
          </label>
        </div>

        {canBook && (
          <div className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5">
            <div className="flex-1 min-w-0">
              <Label htmlFor="visitor-fee" className="text-xs font-semibold">Visitor booking fee</Label>
              <p className="text-[10px] text-muted-foreground">Charged per booking made by a visitor. Set to 0 for free.</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-muted-foreground">R</span>
              <Input
                id="visitor-fee"
                type="number"
                min={0}
                step="0.01"
                value={visitorFee}
                onChange={(e) => { setVisitorFee(e.target.value); setPolicyDirty(true); }}
                className="w-24 h-8 text-right"
              />
            </div>
          </div>
        )}
      </Card>


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
            <Label htmlFor="edit-home-club">Home club name</Label>
            <Select
              value={editMode === "other" ? "__other__" : (editValue || "__none__")}
              onValueChange={(v) => {
                if (v === "__other__") {
                  setEditMode("other");
                  setEditValue("");
                } else if (v === "__none__") {
                  setEditMode("picker");
                  setEditValue("");
                } else {
                  setEditMode("picker");
                  setEditValue(v);
                }
              }}
            >
              <SelectTrigger id="edit-home-club"><SelectValue placeholder="Select home club" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__none__">— Clear (no club) —</SelectItem>
                {homeClubOptions.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
                <SelectItem value="No club">No club (independent)</SelectItem>
                <SelectItem value="__other__">Other (type in)</SelectItem>
              </SelectContent>
            </Select>
            {editMode === "other" && (
              <Input
                id="home-club"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="Type club name"
                maxLength={100}
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              Manage the dropdown list via the <span className="font-medium">Home Clubs</span> button. Clear to remove.
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
