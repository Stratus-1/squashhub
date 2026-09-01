import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { extractFunctionError } from "@/lib/shelly-errors";
import type { ClubDevice, DeviceCategory } from "@/lib/devices";

/**
 * Devices for a club, ordered for display.
 *
 * RLS decides what comes back: ordinary members only ever see the `lights` and
 * `access` rows, while club admins and members holding the `devices`
 * permission also see `gadgets`. The client never filters for security — it
 * only renders what the database was willing to return.
 */
export function useClubDevices(clubId?: string) {
  return useQuery({
    queryKey: ["club-devices", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_devices")
        .select("*")
        .eq("club_id", clubId!)
        .order("category")
        .order("sort_order")
        .order("name");
      // Older deployments do not have the registry table yet. Let the admin
      // page fall back to the legacy Shelly sources while the migration rolls
      // out instead of replacing the whole IoT page with an error state.
      if (error) {
        const missingRegistry = error.code === "42P01" || error.code === "PGRST205";
        if (missingRegistry) return [] as ClubDevice[];
        throw error;
      }
      return (data || []) as ClubDevice[];
    },
    enabled: !!clubId,
    staleTime: 30_000,
  });
}

export type DeviceDraft = Partial<ClubDevice> & {
  club_id: string;
  category: DeviceCategory;
  name: string;
};

/** Create or update a device row. */
export function useSaveDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: DeviceDraft) => {
      // Server-owned columns are never written from the client.
      const { id, created_at, updated_at, last_state, last_state_at, last_error, ...rest } = draft;

      if (id) {
        const { data, error } = await fromExt("club_devices")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data as ClubDevice;
      }
      const { data, error } = await fromExt("club_devices").insert(rest).select().single();
      if (error) throw error;
      return data as ClubDevice;
    },
    onSuccess: (device) => {
      qc.invalidateQueries({ queryKey: ["club-devices", device.club_id] });
    },
  });
}

export function useDeleteDevice(clubId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromExt("club_devices").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-devices", clubId] });
    },
  });
}

export type DeviceAction = "on" | "off" | "pulse" | "status";

export interface DeviceCommandResult {
  ok: boolean;
  state: boolean | null;
  online: boolean | null;
  auto_off_seconds?: number | null;
}

/**
 * Switch a device through the `device-control` edge function.
 *
 * There is no Bluetooth fallback here on purpose: the offline BLE path exists
 * for the main door, where a member locked outside has no other way in. A
 * geyser or a floodlight can wait for the network, and a silent local pulse
 * would leave the audit trail and the relay's state out of step.
 */
export function useDeviceControl(clubId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ deviceId, action }: { deviceId: string; action: DeviceAction }) => {
      const { data, error } = await supabase.functions.invoke("device-control", {
        body: { device_id: deviceId, action },
      });
      if (error) {
        throw new Error(await extractFunctionError(error, "Device command failed"));
      }
      return data as DeviceCommandResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-devices", clubId] });
    },
  });
}
