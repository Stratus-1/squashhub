import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Shield, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import {
  PERMISSION_SLUGS,
  usePermissionRoles,
  useSavePermissionRole,
  useDeletePermissionRole,
  useUpsertMemberPermission,
  type PermissionRole,
} from "@/hooks/use-club-permissions";

export function PermissionsTab({ clubId }: { clubId: string }) {
  return (
    <div className="space-y-6 mt-4">
      <RolesSection clubId={clubId} />
      <MemberPermissionsSection clubId={clubId} />
    </div>
  );
}

/* ─── Roles Section ─── */

function RolesSection({ clubId }: { clubId: string }) {
  const { data: roles = [] } = usePermissionRoles(clubId);
  const saveRole = useSavePermissionRole();
  const deleteRole = useDeletePermissionRole();
  const [editRole, setEditRole] = useState<PermissionRole | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const handleDelete = async (role: PermissionRole) => {
    if (!confirm(`Delete role "${role.role_name}"?`)) return;
    try {
      await deleteRole.mutateAsync({ id: role.id, club_id: clubId });
      toast.success("Role deleted");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Shield className="w-4 h-4" /> Permission Roles</h3>
          <p className="text-xs text-muted-foreground">Create reusable roles like "Treasurer", "Committee" with preset permissions</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" />Add Role</Button>
      </div>

      {roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No custom roles yet. Captain and Admin have full access by default.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map(role => (
              <TableRow key={role.id}>
                <TableCell className="font-medium">{role.role_name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.map(p => (
                      <Badge key={p} variant="outline" className="text-[10px]">
                        {PERMISSION_SLUGS.find(s => s.value === p)?.label || p}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditRole(role)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(role)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {addOpen && <RoleDialog clubId={clubId} open onOpenChange={() => setAddOpen(false)} />}
      {editRole && <RoleDialog clubId={clubId} open onOpenChange={() => setEditRole(null)} existing={editRole} />}
    </Card>
  );
}

/* ─── Role Dialog ─── */

function RoleDialog({ clubId, open, onOpenChange, existing }: { clubId: string; open: boolean; onOpenChange: (o: boolean) => void; existing?: PermissionRole }) {
  const [name, setName] = useState(existing?.role_name ?? "");
  const [perms, setPerms] = useState<Set<string>>(new Set(existing?.permissions ?? []));
  const [isFullAdmin, setIsFullAdmin] = useState<boolean>(!!existing?.is_full_admin);
  const save = useSavePermissionRole();

  const toggle = (slug: string) => {
    setPerms(prev => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Role name required"); return; }
    try {
      await save.mutateAsync({
        id: existing?.id,
        club_id: clubId,
        role_name: name.trim(),
        permissions: isFullAdmin ? PERMISSION_SLUGS.map(s => s.value) : [...perms],
        is_full_admin: isFullAdmin,
      });
      toast.success(existing ? "Updated" : "Created");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{existing ? "Edit" : "Add"} Permission Role</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Role Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Treasurer, Committee" />
          </div>
          <label className="flex items-start gap-2 text-sm cursor-pointer rounded-md border border-primary/40 bg-primary/5 p-3">
            <Checkbox checked={isFullAdmin} onCheckedChange={(v) => setIsFullAdmin(!!v)} className="mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-medium flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Grant full admin rights</div>
              <p className="text-xs text-muted-foreground">Members with this role get unrestricted access to every section, now and in the future.</p>
            </div>
          </label>
          <div className="space-y-2" aria-disabled={isFullAdmin}>
            <Label className={isFullAdmin ? "text-muted-foreground" : ""}>Permissions</Label>
            <div className={`grid grid-cols-2 gap-2 ${isFullAdmin ? "opacity-50 pointer-events-none" : ""}`}>
              {PERMISSION_SLUGS.map(s => (
                <label key={s.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={isFullAdmin || perms.has(s.value)} onCheckedChange={() => toggle(s.value)} disabled={isFullAdmin} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => { setPerms(new Set(PERMISSION_SLUGS.map(s => s.value))); }} variant="outline" size="sm" disabled={isFullAdmin}>Select All</Button>
            <Button onClick={() => setPerms(new Set())} variant="outline" size="sm" disabled={isFullAdmin}>Clear</Button>
          </div>
          <Button onClick={handleSave} className="w-full" disabled={save.isPending}>
            {save.isPending ? "Saving..." : existing ? "Update Role" : "Create Role"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Member Permissions Section ─── */

function MemberPermissionsSection({ clubId }: { clubId: string }) {
  const { data: members = [] } = useQuery({
    queryKey: ["club-members-for-perms", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("id, name, role, email")
        .eq("club_id", clubId)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string; role: string; email: string }[];
    },
  });

  const { data: club } = useQuery({
    queryKey: ["club-delegates-for-perms", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("clubs")
        .select("chairman_member_id, secretary_member_id, club_captain_member_id")
        .eq("id", clubId)
        .maybeSingle();
      if (error) throw error;
      return data as { chairman_member_id: string | null; secretary_member_id: string | null; club_captain_member_id: string | null } | null;
    },
  });

  const { data: memberPerms = [] } = useQuery({
    queryKey: ["all-member-permissions", clubId],
    queryFn: async () => {
      const memberIds = members.map(m => m.id);
      if (memberIds.length === 0) return [];
      const { data, error } = await fromExt("club_member_permissions")
        .select("*, club_permission_roles(role_name)")
        .in("club_member_id", memberIds);
      if (error) throw error;
      return data as any[];
    },
    enabled: members.length > 0,
  });

  const { data: roles = [] } = usePermissionRoles(clubId);
  const upsert = useUpsertMemberPermission();
  const [editMember, setEditMember] = useState<{ id: string; name: string; role: string } | null>(null);

  const permMap = new Map(memberPerms.map((p: any) => [p.club_member_id, p]));

  const delegateLabel = (memberId: string): string | null => {
    if (!club) return null;
    if (club.chairman_member_id === memberId) return "Chairman";
    if (club.secretary_member_id === memberId) return "Secretary";
    if (club.club_captain_member_id === memberId) return "Club Captain";
    return null;
  };

  const isGrantedFullAdmin = (memberId: string) => !!permMap.get(memberId)?.is_full_admin;

  // Only club role 'admin' is automatic full-access. Officer delegates get auto-assigned
  // a matching role (which can be revoked) and are listed in the editable section below.
  const adminMembers = members.filter((m) => m.role === "admin" || isGrantedFullAdmin(m.id));

  const assignableMembers = members.filter(
    (m) => m.role !== "admin" && !isGrantedFullAdmin(m.id)
  );

  const handleAssignRole = async (memberId: string, roleId: string | null) => {
    try {
      const existing = permMap.get(memberId);
      await upsert.mutateAsync({
        club_member_id: memberId,
        permission_role_id: roleId,
        custom_permissions: existing?.custom_permissions ?? [],
      });
      toast.success("Role assigned");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Member Permissions</h3>
        <p className="text-xs text-muted-foreground">Officers (Chairman, Secretary, Club Captain) are auto-assigned a matching role with full access — change or clear the role below to override.</p>
      </div>

      {adminMembers.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full Admin Access (automatic)</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Club Role</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {adminMembers.map((m) => {
                const granted = isGrantedFullAdmin(m.id);
                const source = m.role === "admin" ? "Admin role" : granted ? "Granted by admin" : "—";
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name || "Unnamed"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">{m.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{source}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className="text-[10px] gap-1"><ShieldCheck className="w-3 h-3" /> Full admin</Badge>
                    </TableCell>
                    <TableCell>
                      {granted && m.role !== "admin" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          title="Revoke full admin"
                          onClick={async () => {
                            if (!confirm(`Revoke full admin from ${m.name}?`)) return;
                            const existing = permMap.get(m.id);
                            try {
                              await upsert.mutateAsync({
                                club_member_id: m.id,
                                permission_role_id: existing?.permission_role_id ?? null,
                                custom_permissions: existing?.custom_permissions ?? [],
                                is_full_admin: false,
                              });
                              toast.success("Full admin revoked");
                            } catch (err: any) {
                              toast.error(err.message);
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Club Role</TableHead>
            <TableHead>Officer</TableHead>
            <TableHead>Permission Role</TableHead>
            <TableHead>Custom</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignableMembers.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                All members are admins — no additional permissions needed.
              </TableCell>
            </TableRow>
          )}
          {assignableMembers.map(m => {
            const perm = permMap.get(m.id);
            return (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.name || "Unnamed"}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px] capitalize">{m.role}</Badge></TableCell>
                <TableCell>
                  {delegateLabel(m.id)
                    ? <Badge variant="secondary" className="text-[10px]">{delegateLabel(m.id)}</Badge>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <Select
                    value={perm?.permission_role_id || "none"}
                    onValueChange={v => handleAssignRole(m.id, v === "none" ? null : v)}
                  >
                    <SelectTrigger className="h-8 text-xs w-[160px]">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.role_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {perm?.custom_permissions?.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {perm.custom_permissions.map((p: string) => (
                        <Badge key={p} variant="secondary" className="text-[10px]">
                          {PERMISSION_SLUGS.find(s => s.value === p)?.label || p}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditMember(m)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {editMember && (
        <MemberPermDialog
          memberId={editMember.id}
          memberName={editMember.name}
          clubId={clubId}
          roles={roles}
          existing={permMap.get(editMember.id)}
          open
          onOpenChange={() => setEditMember(null)}
        />
      )}
    </Card>
  );
}

/* ─── Member Permission Dialog ─── */

function MemberPermDialog({
  memberId, memberName, clubId, roles, existing, open, onOpenChange,
}: {
  memberId: string; memberName: string; clubId: string;
  roles: PermissionRole[]; existing: any; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const [roleId, setRoleId] = useState<string>(existing?.permission_role_id || "none");
  const [customPerms, setCustomPerms] = useState<Set<string>>(new Set(existing?.custom_permissions ?? []));
  const [isFullAdmin, setIsFullAdmin] = useState<boolean>(!!existing?.is_full_admin);
  const upsert = useUpsertMemberPermission();

  const toggle = (slug: string) => {
    setCustomPerms(prev => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  };

  const handleSave = async () => {
    try {
      await upsert.mutateAsync({
        club_member_id: memberId,
        permission_role_id: roleId === "none" ? null : roleId,
        custom_permissions: [...customPerms],
        is_full_admin: isFullAdmin,
      });
      toast.success("Permissions updated");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const selectedRole = roles.find(r => r.id === roleId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Permissions — {memberName}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <label className="flex items-start gap-3 p-3 rounded-md border bg-muted/30 cursor-pointer">
            <Checkbox
              checked={isFullAdmin}
              onCheckedChange={(v) => setIsFullAdmin(!!v)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Grant Full Admin
              </div>
              <p className="text-[11px] text-muted-foreground">
                Gives this member every admin permission (same as a Captain or Chairman). Use for trusted helpers like the IT person.
              </p>
            </div>
          </label>

          <div className={`space-y-1 ${isFullAdmin ? "opacity-50 pointer-events-none" : ""}`}>
            <Label>Permission Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.role_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {selectedRole && (
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedRole.permissions.map(p => (
                  <Badge key={p} variant="outline" className="text-[10px]">
                    {PERMISSION_SLUGS.find(s => s.value === p)?.label || p}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className={`space-y-2 ${isFullAdmin ? "opacity-50 pointer-events-none" : ""}`}>
            <Label>Additional Custom Permissions</Label>
            <p className="text-[10px] text-muted-foreground">Grant extra permissions beyond the assigned role</p>
            <div className="grid grid-cols-2 gap-2">
              {PERMISSION_SLUGS.map(s => (
                <label key={s.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={customPerms.has(s.value)}
                    onCheckedChange={() => toggle(s.value)}
                    disabled={selectedRole?.permissions?.includes(s.value)}
                  />
                  <span className={selectedRole?.permissions?.includes(s.value) ? "text-muted-foreground line-through" : ""}>
                    {s.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleSave} className="w-full" disabled={upsert.isPending}>
            {upsert.isPending ? "Saving..." : "Save Permissions"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
