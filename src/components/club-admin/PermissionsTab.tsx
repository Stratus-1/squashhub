import { useEffect, useMemo, useRef, useState } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import {
  SUPER_ADMIN_ONLY_SLUGS,
  usePermissionRoles,
  useSavePermissionRole,
  useDeletePermissionRole,
  useUpsertMemberPermission,
  type PermissionRole,
} from "@/hooks/use-club-permissions";
import { useIsSuperAdmin } from "@/hooks/use-club";
import { permissionSlugsForTenant, permissionLabel, visibleSlugs } from "@/lib/permission-scope";
import { SetupSteps, SetupStepNav, type SetupStep } from "./setup/SetupSteps";

/**
 * True when the workspace being administered is an association/federation tenant.
 * Resolved from the tenant row actually being edited (the clubId prop), not the
 * viewer's own club — a super admin editing an association must see association wording.
 */
function useIsAssociationTenant(clubId: string): boolean {
  const { data } = useQuery({
    queryKey: ["tenant-type", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("clubs").select("tenant_type").eq("id", clubId).maybeSingle();
      if (error) throw error;
      return (data as { tenant_type: string | null } | null)?.tenant_type ?? null;
    },
    enabled: !!clubId,
  });
  return data === "association" || data === "federation";
}

export function PermissionsTab({ clubId }: { clubId: string }) {
  const [step, setStep] = useState("roles");
  const { data: roles = [] } = usePermissionRoles(clubId);

  const steps: SetupStep[] = [
    { id: "roles", label: "Permission roles", description: "Create reusable roles like Treasurer or Committee, each with a preset list of what they may access.", complete: roles.length > 0 },
    { id: "members", label: "Member permissions", description: "Assign a role — or individual permissions — to each member who helps run the club.", complete: roles.length > 0 },
  ];

  return (
    <div className="space-y-4 mt-4">
      <SetupSteps steps={steps} value={step} onChange={setStep} />
      {step === "roles" && <RolesSection clubId={clubId} />}
      {step === "members" && <MemberPermissionsSection clubId={clubId} />}
      <SetupStepNav steps={steps} value={step} onChange={setStep} />
    </div>
  );
}


/* ─── Roles Section ─── */

function RolesSection({ clubId }: { clubId: string }) {
  const isAssociation = useIsAssociationTenant(clubId);
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
                  {role.is_full_admin ? (
                    <Badge className="text-[10px] gap-1"><ShieldCheck className="w-3 h-3" /> Full admin</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {visibleSlugs(role.permissions, isAssociation).map(p => (
                        <Badge key={p} variant="outline" className="text-[10px]">
                          {permissionLabel(p, isAssociation)}
                        </Badge>
                      ))}
                    </div>
                  )}
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
  const isSuperAdmin = useIsSuperAdmin();
  /** Federation-level slugs may only be handed out by a platform super admin. */
  const isAssociation = useIsAssociationTenant(clubId);
  const grantableSlugs = permissionSlugsForTenant(isAssociation).filter(
    (s) => isSuperAdmin || !SUPER_ADMIN_ONLY_SLUGS.includes(s.value),
  );

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
        permissions: isFullAdmin ? grantableSlugs.map(s => s.value) : [...perms],
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
              {grantableSlugs.map(s => (
                <label key={s.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={isFullAdmin || perms.has(s.value)} onCheckedChange={() => toggle(s.value)} disabled={isFullAdmin} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => { setPerms(new Set(grantableSlugs.map(s => s.value))); }} variant="outline" size="sm" disabled={isFullAdmin}>Select All</Button>
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
  const isAssociation = useIsAssociationTenant(clubId);
  const qc = useQueryClient();
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
        .select("chairman_member_id, secretary_member_id, club_captain_member_id, treasurer_member_id")
        .eq("id", clubId)
        .maybeSingle();
      if (error) throw error;
      return data as { chairman_member_id: string | null; secretary_member_id: string | null; club_captain_member_id: string | null; treasurer_member_id: string | null } | null;
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
    if (club.treasurer_member_id === memberId) return "Treasurer";
    return null;
  };

  const isGrantedFullAdmin = (memberId: string) => !!permMap.get(memberId)?.is_full_admin;

  // Only club role 'admin' is automatic full-access. Officer delegates get auto-assigned
  // a matching role (which can be revoked) and are listed in the editable section below.
  const adminMembers = members.filter((m) => m.role === "admin" || isGrantedFullAdmin(m.id));

  // Stable ordering: compute the "members with permissions first" order once per
  // member-set, then keep it. Re-sorting after every save made the edited row jump
  // to the top mid-interaction, which also tore the dropdown down before it could
  // release its page scroll lock.
  const orderRef = useRef<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const permMapRef = useRef(permMap);
  permMapRef.current = permMap;

  const assignableMembers = useMemo(() => {
    const pool = members.filter((m) => m.role !== "admin" && !isGrantedFullAdmin(m.id));
    const key = pool.map((m) => m.id).sort().join(",");
    if (orderRef.current.key !== key) {
      const pm = permMapRef.current;
      orderRef.current = {
        key,
        ids: [...pool]
          .sort((a, b) => {
            const pa = pm.get(a.id);
            const pb = pm.get(b.id);
            const aHas = !!(pa?.permission_role_id || pa?.custom_permissions?.length);
            const bHas = !!(pb?.permission_role_id || pb?.custom_permissions?.length);
            if (aHas !== bHas) return aHas ? -1 : 1;
            return (a.name || "").localeCompare(b.name || "");
          })
          .map((m) => m.id),
      };
    }
    const index = new Map(orderRef.current.ids.map((id, i) => [id, i]));
    return [...pool].sort((a, b) => (index.get(a.id) ?? 9e9) - (index.get(b.id) ?? 9e9));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, memberPerms]);

  // Safety net: if a dropdown was unmounted mid-close, Radix's scroll lock can be
  // left behind and the page becomes unscrollable. Clear any stale lock.
  useEffect(() => {
    return () => {
      if (document.body.style.pointerEvents === "none") document.body.style.pointerEvents = "";
      if (document.body.style.overflow === "hidden") document.body.style.overflow = "";
    };
  }, []);

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

  /** Change a club-role admin back to a normal member (removes automatic full access). */
  const demoteAdmin = async (memberId: string, name: string) => {
    if (!confirm(`Change ${name || "this member"} from Admin to Member? They will lose automatic full admin access.`)) return;
    try {
      const { error } = await fromExt("club_members").update({ role: "member" }).eq("id", memberId);
      if (error) throw error;
      const existing = permMap.get(memberId);
      if (existing?.is_full_admin) {
        await upsert.mutateAsync({
          club_member_id: memberId,
          permission_role_id: existing?.permission_role_id ?? null,
          custom_permissions: existing?.custom_permissions ?? [],
          is_full_admin: false,
        });
      }
      await qc.invalidateQueries({ queryKey: ["club-members-for-perms", clubId] });
      toast.success("Club role changed to Member");
    } catch (err: any) {
      toast.error(err.message || "Could not change role");
    }
  };


  /** Defer the save until after the Select has finished closing/unmounting. */
  const deferAssignRole = (memberId: string, roleId: string | null) => {
    setTimeout(() => { void handleAssignRole(memberId, roleId); }, 0);
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
                <TableHead className="w-[150px]" />
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
                      <div className="flex gap-1 justify-end">
                        {m.role === "admin" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px]"
                            title="Change club role to Member (removes automatic full admin)"
                            onClick={() => void demoteAdmin(m.id, m.name)}
                          >
                            Change to member
                          </Button>
                        )}
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
                      </div>
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
                    onValueChange={v => deferAssignRole(m.id, v === "none" ? null : v)}
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
                      {visibleSlugs(perm.custom_permissions, isAssociation).map((p: string) => (
                        <Badge key={p} variant="secondary" className="text-[10px]">
                          {permissionLabel(p, isAssociation)}
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
  const isSuperAdmin = useIsSuperAdmin();
  /** Federation-level slugs may only be handed out by a platform super admin. */
  const isAssociation = useIsAssociationTenant(clubId);
  const grantableSlugs = permissionSlugsForTenant(isAssociation).filter(
    (s) => isSuperAdmin || !SUPER_ADMIN_ONLY_SLUGS.includes(s.value),
  );

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
                {visibleSlugs(selectedRole.permissions, isAssociation).map(p => (
                  <Badge key={p} variant="outline" className="text-[10px]">
                    {permissionLabel(p, isAssociation)}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className={`space-y-2 ${isFullAdmin ? "opacity-50 pointer-events-none" : ""}`}>
            <Label>Additional Custom Permissions</Label>
            <p className="text-[10px] text-muted-foreground">Grant extra permissions beyond the assigned role</p>
            <div className="grid grid-cols-2 gap-2">
              {grantableSlugs.map(s => (
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
