import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isChairmanRole } from "@/lib/chairman-permissions";
import { fromExt } from "@/lib/supabase-ext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useIsSuperAdmin, useSuperAdminStatus } from "@/hooks/use-club";
import { useFinancialAccess } from "@/hooks/use-financial-access";
import { useClubContext } from "@/contexts/ClubContext";
import { supabase } from "@/integrations/supabase/client";
import { ALL_CHILD_SLUGS, expandPermissions, permissionGranted } from "@/lib/permissions/fine-permissions";

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
  { value: "events", label: "Events (create club events)" },
  { value: "bar", label: "Bar / POS" },
  { value: "access", label: "Access Control" },
  { value: "devices", label: "Devices & Gadgets (lights, gates, geysers)" },
  { value: "communications", label: "Communications" },
  { value: "affiliation", label: "Affiliation (own tournaments for the club's association)" },
  { value: "federation", label: "Federation (own tournaments for any body)", superAdminOnly: true },
  { value: "bookings_unlimited", label: "Unlimited Bookings (bypass daily/peak/event caps)" },
  { value: "bookings_unlimited_non_peak", label: "Unlimited Non-Peak Bookings (bypass caps outside peak hours)" },
  { value: "ops_booking", label: "Ops Bookings (maintenance / cleaning, free)" },
  { value: "bookings_others", label: "Bookings for others (make or cancel other members' bookings)" },
  { value: "documents", label: "Rules & Documents (upload and share)" },
  { value: "agm", label: "AGM and voting" },
] as const;

/** A whole-area slug, or one of its finer parts such as "finance.enter". */
export type PermissionSlug = typeof PERMISSION_SLUGS[number]["value"] | (string & {});

/** Slugs only a platform super admin may hand out. */
export const SUPER_ADMIN_ONLY_SLUGS: string[] = PERMISSION_SLUGS
  .filter((s) => (s as any).superAdminOnly)
  .map((s) => s.value);


export interface PermissionRole {
  id: string;
  club_id: string;
  role_name: string;
  permissions: string[];
  is_full_admin?: boolean;
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
 * Member Communications is open to club admins, holders of the "communications"
 * permission and every current office bearer. The server decides
 * (`my_can_manage_club_comms`), the same rule the comms tables and sender enforce.
 */
export function useCanManageComms(clubId: string | undefined) {
  return useQuery({
    queryKey: ["can-manage-comms", clubId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("my_can_manage_club_comms", { _club_id: clubId });
      if (error) return false;
      return data === true;
    },
    enabled: !!clubId,
    staleTime: 5 * 60_000,
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
  const { club } = useClubContext();
  const { isChairman } = useFinancialAccess(club?.id);
  const { data: canManageComms } = useCanManageComms(club?.id);

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
  // Super-admin-only slugs (e.g. 'federation') are never implied by club-level full admin.
  const restricted = SUPER_ADMIN_ONLY_SLUGS.includes(permission);

  const { data: perm } = useMemberPermission(memberId);

  if (isSuperAdmin) return true;
  // Explicit grants always count — including restricted slugs handed out by a super admin.
  // A whole area covers its parts; any part lets the member view the area.
  const held = [...(perm?.custom_permissions ?? []), ...(perm?.club_permission_roles?.permissions ?? [])];
  if (permissionGranted(held, permission)) return true;
  // Office bearers manage all of Communications unless they were given only some parts of it.
  if (
    (permission === "communications" || permission.startsWith("communications.")) &&
    canManageComms && !held.some((h) => h.startsWith("communications."))
  ) return true;
  // Implied full access never covers super-admin-only slugs.
  if (restricted) return false;
  if (isChairman || isChairmanRole(perm?.club_permission_roles?.role_name)) return true;
  if (isRoleFullAccess) return true;
  if (perm?.is_full_admin) return true;
  if ((perm as any)?.club_permission_roles?.is_full_admin) return true;

  return false;

}


/**
 * Get all effective permissions for the current member.
 */
export function useMyPermissionsStatus(): { permissions: Set<string>; isLoading: boolean; isFullAdmin?: boolean } {
  const { activeMember, isAdmin, isLoading: memberCtxLoading } = useMemberContext();
  const { isSuperAdmin, isLoading: superAdminLoading } = useSuperAdminStatus();
  const memberId = activeMember?.id;
  const { club } = useClubContext();
  const { isChairman, isLoading: chairmanLoading } = useFinancialAccess(club?.id);
  const commsQuery = useCanManageComms(club?.id);

  const { data: memberRow, isPending: memberRolePending } = useQuery({
    queryKey: ["member-role", memberId],
    queryFn: async () => {
      const { data } = await fromExt("club_members").select("role").eq("id", memberId!).single();
      return data as { role: string } | null;
    },
    enabled: !!memberId,
  });

  const memberRole = memberRow?.role;
  const isRoleFullAccess = isSuperAdmin || memberRole === "admin" || isAdmin;
  const permissionQuery = useMemberPermission(memberId);
  const perm = permissionQuery.data;

  const allSlugs = PERMISSION_SLUGS.map(s => s.value as string);
  // Club-level full admin gets everything except super-admin-only slugs.
  const clubWide = allSlugs.filter(s => !SUPER_ADMIN_ONLY_SLUGS.includes(s));

  if (isSuperAdmin) return { permissions: new Set([...allSlugs, ...ALL_CHILD_SLUGS]), isLoading: false, isFullAdmin: true };

  // Explicit grants first (these may include restricted slugs granted by a super admin),
  // expanded so a whole area includes its parts and any part includes "<area>.view".
  const perms = expandPermissions([
    ...(perm?.custom_permissions ?? []),
    ...(perm?.club_permission_roles?.permissions ?? []),
  ]);
  // Office bearers manage all of Communications unless they were given only some parts of it.
  if (commsQuery.data) {
    const partsOnly = [...perms].some((p) => p.startsWith("communications."));
    if (!partsOnly) expandPermissions(["communications"]).forEach((p) => perms.add(p));
  }

  const impliedFull =
    isRoleFullAccess || isChairman || isChairmanRole(perm?.club_permission_roles?.role_name) || perm?.is_full_admin || (perm as any)?.club_permission_roles?.is_full_admin;
  if (impliedFull) { clubWide.forEach(p => perms.add(p)); ALL_CHILD_SLUGS.forEach(p => perms.add(p)); }

  return {
    permissions: perms,
    isFullAdmin: !!impliedFull,
    isLoading: superAdminLoading || memberCtxLoading || (!!memberId && (memberRolePending || permissionQuery.isPending || chairmanLoading)) || (!!club?.id && commsQuery.isPending),
  };

}

/** Get all effective permissions for the current member. */
export function useMyPermissions(): Set<string> {
  return useMyPermissionsStatus().permissions;

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
      qc.invalidateQueries({ queryKey: ["all-member-permissions"] });
    },
  });
}

/** CRUD for permission roles */
export function useSavePermissionRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id?: string; club_id: string; role_name: string; permissions: string[]; is_full_admin?: boolean }) => {
      if (params.id) {
        const { error } = await fromExt("club_permission_roles")
          .update({ role_name: params.role_name, permissions: params.permissions, is_full_admin: params.is_full_admin ?? false })
          .eq("id", params.id);
        if (error) throw error;
      } else {
        const { error } = await fromExt("club_permission_roles")
          .insert({ club_id: params.club_id, role_name: params.role_name, permissions: params.permissions, is_full_admin: params.is_full_admin ?? false });
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

/**
 * Resolve whether a SPECIFIC member has any admin access of their own
 * (club role = 'admin', full-admin flag, or any granted permission slug).
 * Unlike useMyPermissions this never falls back to the viewer's own rights,
 * so it is safe to use while "viewing as" another member.
 */
export function useMemberHasAdminAccess(memberId: string | undefined): boolean {
  const { data: memberRow } = useQuery({
    queryKey: ["member-role", memberId],
    queryFn: async () => {
      const { data } = await fromExt("club_members").select("role").eq("id", memberId!).single();
      return data as { role: string } | null;
    },
    enabled: !!memberId,
  });

  const { data: perm } = useMemberPermission(memberId);

  if (memberRow?.role === "admin") return true;
  if (perm?.is_full_admin) return true;
  if ((perm as any)?.club_permission_roles?.is_full_admin) return true;
  if ((perm?.custom_permissions?.length ?? 0) > 0) return true;
  if ((perm?.club_permission_roles?.permissions?.length ?? 0) > 0) return true;
  return false;
}
