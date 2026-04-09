import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useMemberContext } from "@/contexts/MemberContext";

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
 * Captain/Chairman/Secretary/Admin roles always return true.
 */
export function useHasPermission(permission: PermissionSlug): boolean {
  const { activeMember } = useMemberContext();
  const memberId = activeMember?.id;
  const memberRole = activeMember?.role;

  // Captain and admin roles always have full access
  const isFullAccess = memberRole === "captain" || memberRole === "admin";

  const { data: perm } = useMemberPermission(isFullAccess ? undefined : memberId);

  if (isFullAccess) return true;
  if (!perm) return false;

  // Check custom permissions
  if (perm.custom_permissions?.includes(permission)) return true;

  // Check role-based permissions
  if (perm.club_permission_roles?.permissions?.includes(permission)) return true;

  return false;
}

/**
 * Get all effective permissions for the current member.
 * Returns all slugs for captain/admin, otherwise merges role + custom.
 */
export function useMyPermissions(): Set<string> {
  const { activeMember } = useMemberContext();
  const memberRole = activeMember?.role;
  const isFullAccess = memberRole === "captain" || memberRole === "admin";
  const { data: perm } = useMemberPermission(isFullAccess ? undefined : activeMember?.id);

  if (isFullAccess) return new Set(PERMISSION_SLUGS.map(s => s.value));

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
    }) => {
      const { data, error } = await fromExt("club_member_permissions")
        .upsert(
          {
            club_member_id: params.club_member_id,
            permission_role_id: params.permission_role_id ?? null,
            custom_permissions: params.custom_permissions ?? [],
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
