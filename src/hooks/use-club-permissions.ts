import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useIsSuperAdmin } from "@/hooks/use-club";

/** All available permission slugs */
export const PERMISSION_SLUGS = [
  { value: "club", label: "Club Info" },
  { value: "settings", label: "Settings" },
  { value: "fees", label: "Fees" },
  { value: "courts", label: "Courts" },
  { value: "banking", label: "Banking" },
  { value: "finance", label: "Finance" },
  { value: "members", label: "Members" },
  { value: "users", label: "Users" },
  { value: "visitors", label: "Visitors" },
  { value: "ladder", label: "Ladder" },
  { value: "leagues", label: "Leagues" },
  { value: "champs", label: "Tournaments" },
  { value: "bar", label: "Honesty Bar" },
  { value: "access", label: "Access Control" },
] as const;

export type PermissionSlug = typeof PERMISSION_SLUGS[number]["value"];

export interface PermissionRole {
  id: string;
  club_id: string;
  role_name: string;
  permissions: string[];
}

export interface MemberPermission {
  id: string;
  club_member_id: string;
  permission_role_id: string | null;
  custom_permissions: string[];
  is_full_admin?: boolean;
}

/** Fetch permission roles for a club */
export function usePermissionRoles(clubId: string) {
  return useQuery({
    queryKey: ["permission-roles", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_permission_roles")
        .select("*")
        .eq("club_id", clubId)
        .order("role_name");
      if (error) throw error;
      return data as PermissionRole[];
    },
    enabled: !!clubId,
  });
}

/** Fetch a member's permissions record */
export function useMemberPermission(memberId: string | undefined) {
  return useQuery({
    queryKey: ["member-permission", memberId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_member_permissions")
        .select("*, club_permission_roles(*)")
        .eq("club_member_id", memberId!)
        .maybeSingle();
      if (error) throw error;
      return data as (MemberPermission & { club_permission_roles: PermissionRole | null }) | null;
    },
    enabled: !!memberId,
  });
}

/**
 * Check if the current active member has a specific admin permission.
 * Captain/Admin roles always return true.
 */
export function useHasPermission(permission: PermissionSlug): boolean {
  const { activeMember, isAdmin } = useMemberContext();
  const isSuperAdmin = useIsSuperAdmin();
  const memberId = activeMember?.id;

  // Fetch member's club role
  const { data: memberRow } = useQuery({
    queryKey: ["member-role", memberId],
    queryFn: async () => {
      const { data } = await fromExt("club_members").select("role").eq("id", memberId!).single();
      return data as { role: string } | null;
    },
    enabled: !!memberId,
  });

  const memberRole = memberRow?.role;
  // Platform super-admins always have full access. 'captain' = team captain only (league-scoped).
  // Full admin = 'admin' role OR a club delegate (chairman/secretary/club_captain), tracked via MemberContext.isAdmin.
  const isRoleFullAccess = isSuperAdmin || memberRole === "admin" || isAdmin;

  const { data: perm } = useMemberPermission(memberId);

  if (isRoleFullAccess) return true;
  if (perm?.is_full_admin) return true;
  if (!perm) return false;

  if (perm.custom_permissions?.includes(permission)) return true;
  if (perm.club_permission_roles?.permissions?.includes(permission)) return true;

  return false;
}

/**
 * Get all effective permissions for the current member.
 */
export function useMyPermissions(): Set<string> {
  const { activeMember, isAdmin } = useMemberContext();
  const memberId = activeMember?.id;

  const { data: memberRow } = useQuery({
    queryKey: ["member-role", memberId],
    queryFn: async () => {
      const { data } = await fromExt("club_members").select("role").eq("id", memberId!).single();
      return data as { role: string } | null;
    },
    enabled: !!memberId,
  });

  const memberRole = memberRow?.role;
  const isRoleFullAccess = memberRole === "admin" || isAdmin;
  const { data: perm } = useMemberPermission(memberId);

  if (isRoleFullAccess) return new Set(PERMISSION_SLUGS.map(s => s.value));
  if (perm?.is_full_admin) return new Set(PERMISSION_SLUGS.map(s => s.value));

  const perms = new Set<string>();
  if (perm?.custom_permissions) perm.custom_permissions.forEach(p => perms.add(p));
  if (perm?.club_permission_roles?.permissions) perm.club_permission_roles.permissions.forEach(p => perms.add(p));
  return perms;
}

/** Upsert member permissions */
export function useUpsertMemberPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      club_member_id: string;
      permission_role_id?: string | null;
      custom_permissions?: string[];
      is_full_admin?: boolean;
    }) => {
      const { data, error } = await fromExt("club_member_permissions")
        .upsert(
          {
            club_member_id: params.club_member_id,
            permission_role_id: params.permission_role_id ?? null,
            custom_permissions: params.custom_permissions ?? [],
            is_full_admin: params.is_full_admin ?? false,
          },
          { onConflict: "club_member_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["member-permission", vars.club_member_id] });
    },
  });
}

/** CRUD for permission roles */
export function useSavePermissionRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id?: string; club_id: string; role_name: string; permissions: string[] }) => {
      if (params.id) {
        const { error } = await fromExt("club_permission_roles")
          .update({ role_name: params.role_name, permissions: params.permissions })
          .eq("id", params.id);
        if (error) throw error;
      } else {
        const { error } = await fromExt("club_permission_roles")
          .insert({ club_id: params.club_id, role_name: params.role_name, permissions: params.permissions });
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["permission-roles", vars.club_id] });
    },
  });
}

export function useDeletePermissionRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; club_id: string }) => {
      const { error } = await fromExt("club_permission_roles").delete().eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["permission-roles", vars.club_id] });
    },
  });
}
