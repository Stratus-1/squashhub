import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, UserCheck, Shield, UserX, Pencil } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface UsersTabProps {
  clubId: string;
}

export function UsersTab({ clubId }: UsersTabProps) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  // Fetch club members with linked user_id
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["club-users-members", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("id, name, email, user_id, role, club_member_number, gender, joined_at")
        .eq("club_id", clubId)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch profiles for linked members
  const linkedUserIds = useMemo(
    () => members.filter((m: any) => m.user_id).map((m: any) => m.user_id),
    [members]
  );

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ["club-users-profiles", linkedUserIds],
    enabled: linkedUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, phone, created_at")
        .in("id", linkedUserIds);
      if (error) throw error;
      return data || [];
    },
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, any>();
    profiles.forEach((p: any) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const isLoading = membersLoading || profilesLoading;

  // Build combined view: each member row with their linked profile info
  const rows = useMemo(() => {
    return members.map((m: any) => {
      const profile = m.user_id ? profileMap.get(m.user_id) : null;
      return {
        memberId: m.id,
        memberName: m.name,
        memberEmail: m.email,
        memberNumber: m.club_member_number,
        memberRole: m.role,
        gender: m.gender,
        joinedAt: m.joined_at,
        hasAccount: !!m.user_id,
        userId: m.user_id,
        profileName: profile?.name,
        profileEmail: profile?.email,
        profilePhone: profile?.phone,
        registeredAt: profile?.created_at,
      };
    });
  }, [members, profileMap]);

  const filtered = rows.filter((r: any) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (r.memberName || "").toLowerCase().includes(q) ||
      (r.memberEmail || "").toLowerCase().includes(q) ||
      (r.profileEmail || "").toLowerCase().includes(q) ||
      (r.memberNumber || "").toLowerCase().includes(q)
    );
  });

  const linkedCount = rows.filter((r: any) => r.hasAccount).length;
  const unlinkedCount = rows.filter((r: any) => !r.hasAccount).length;

  const sharedCount = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r: any) => r.userId && m.set(r.userId, (m.get(r.userId) || 0) + 1));
    return m;
  }, [rows]);

  const sharers = editing?.userId
    ? rows.filter((r: any) => r.userId === editing.userId && r.memberId !== editing.memberId).map((r: any) => r.memberName)
    : [];

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-set-login-email", {
        body: { club_member_id: editing.memberId, new_email: newEmail.trim().toLowerCase() },
      });
      let msg = (data as any)?.error;
      if (error && !msg) {
        try { msg = (await (error as any).context?.json())?.error; } catch { /* ignore */ }
        msg = msg || error.message;
      }
      if (msg) throw new Error(msg);
      toast.success(`Login email updated for ${editing.memberName}`);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["club-users-members", clubId] });
      queryClient.invalidateQueries({ queryKey: ["club-users-profiles"] });
    } catch (e: any) {
      toast.error(e.message || "Could not change login email");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Registered Users</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Members with linked login accounts.{" "}
          <span className="font-medium text-emerald-600">{linkedCount} linked</span>
          {" · "}
          <span className="font-medium text-amber-600">{unlinkedCount} unlinked</span>
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search members or users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Member</TableHead>
              <TableHead className="text-xs">Member #</TableHead>
              <TableHead className="text-xs">Role</TableHead>
              <TableHead className="text-xs">Account Status</TableHead>
              <TableHead className="text-xs">Login Email</TableHead>
              <TableHead className="text-xs">Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">No members found</TableCell>
              </TableRow>
            ) : (
              filtered.map((r: any) => (
                <TableRow key={r.memberId}>
                  <TableCell className="text-xs font-medium">{r.memberName || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.memberNumber || "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={r.memberRole === "captain" || r.memberRole === "admin" ? "default" : "outline"}
                      className="text-[10px] gap-0.5"
                    >
                      {r.memberRole === "captain" || r.memberRole === "admin" ? (
                        <Shield className="h-2.5 w-2.5" />
                      ) : null}
                      {r.memberRole}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.hasAccount ? (
                      <Badge variant="secondary" className="text-[10px] gap-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <UserCheck className="h-2.5 w-2.5" /> Linked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-0.5 text-amber-600 border-amber-300">
                        <UserX className="h-2.5 w-2.5" /> No account
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span>{r.profileEmail || r.memberEmail || "—"}</span>
                      {r.userId && (sharedCount.get(r.userId) || 0) > 1 && (
                        <Badge variant="outline" className="text-[10px]">shared ×{sharedCount.get(r.userId)}</Badge>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        aria-label={`Change login email for ${r.memberName}`}
                        onClick={() => { setEditing(r); setNewEmail(""); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.registeredAt ? format(new Date(r.registeredAt), "dd MMM yyyy") : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Change login email — {editing?.memberName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <div>
              <div className="text-muted-foreground">Current login email</div>
              <div className="font-medium">{editing?.profileEmail || "No login yet"}</div>
            </div>
            {editing?.userId && sharers.length > 0 && (
              <div className="rounded border border-border bg-muted/40 p-2">
                Also signs in with this email: <span className="font-medium">{sharers.join(", ")}</span>.
                {" "}{editing.memberName} will get their own login; the others keep the current one.
              </div>
            )}
            <div>
              <div className="text-muted-foreground mb-1">New login email</div>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="name@example.com"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            <Button size="sm" disabled={saving || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())} onClick={save}>
              {saving ? "Saving..." : "Save login email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
