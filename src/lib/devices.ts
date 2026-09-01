/**
 * Client-side model for the club IoT device registry (`club_devices`).
 *
 * Devices are grouped by *what a member calls them*, not by what hardware
 * happens to be behind them:
 *
 *   lights  — one court-light relay per configured court
 *   access  — the main entrance plus optional doors, gates and turnstiles
 *   gadgets — geysers, pumps, heaters, signage, anything else
 *
 * Court booking logic may still use court records for billing and automation,
 * but the Shelly device itself is managed through this registry.
 */
import {
  DoorOpen,
  Fan,
  Flame,
  Lightbulb,
  Lock,
  Monitor,
  Plug,
  Droplets,
  ParkingCircle,
  Snowflake,
  Sparkles,
  Thermometer,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";

export const DEVICE_CATEGORIES = ["lights", "access", "gadgets"] as const;
export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];

export type DeviceControlMode = "toggle" | "pulse";
export type DeviceProvider = "shelly" | "other";

export interface ClubDevice {
  id: string;
  club_id: string;
  category: DeviceCategory;
  name: string;
  icon: string | null;
  location: string | null;
  notes: string | null;
  enabled: boolean;
  sort_order: number;
  control_mode: DeviceControlMode;
  provider: DeviceProvider;
  shelly_device_id: string | null;
  shelly_channel: number;
  pulse_ms: number;
  ble_mac: string | null;
  auto_off_minutes: number | null;
  last_state: boolean | null;
  last_state_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceCategoryMeta {
  slug: DeviceCategory;
  label: string;
  /** One line explaining what belongs in this group, shown in the admin form. */
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the group header accent. */
  accent: string;
  /** Only club admins / members holding the 'devices' permission may see it. */
  restricted: boolean;
  /** Sensible default control mode when adding a device to this group. */
  defaultControlMode: DeviceControlMode;
  emptyHint: string;
}

export const DEVICE_CATEGORY_META: Record<DeviceCategory, DeviceCategoryMeta> = {
  lights: {
    slug: "lights",
    label: "Court lights",
    description:
      "One Shelly light relay for every court in the club's court list. Booking automation and light-fee billing stay attached to the court.",
    icon: Lightbulb,
    accent: "text-amber-600 dark:text-amber-400",
    restricted: false,
    defaultControlMode: "toggle",
    emptyHint: "Add courts under Courts & Bookings to create court-light setup slots.",
  },
  access: {
    slug: "access",
    label: "Access",
    description:
      "The main club entrance, plus any additional doors, gates or turnstiles controlled by a Shelly relay.",
    icon: DoorOpen,
    accent: "text-emerald-600 dark:text-emerald-400",
    restricted: false,
    defaultControlMode: "pulse",
    emptyHint: "No access devices added yet.",
  },
  gadgets: {
    slug: "gadgets",
    label: "Gadgets",
    description:
      "Geysers, air conditioners, pumps, heaters, signage and any other equipment on a smart relay. Only admins and members with the Devices permission can see or switch these.",
    icon: Plug,
    accent: "text-sky-600 dark:text-sky-400",
    restricted: true,
    defaultControlMode: "toggle",
    emptyHint: "No gadgets added yet.",
  },
};

export const DEVICE_CATEGORY_LIST: DeviceCategoryMeta[] = DEVICE_CATEGORIES.map(
  (c) => DEVICE_CATEGORY_META[c],
);

/**
 * Icon allow-list. The database stores a slug rather than a component so the
 * admin can pick an icon without us shipping the whole lucide set to a lookup.
 */
export const DEVICE_ICONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "lightbulb", label: "Light", icon: Lightbulb },
  { value: "sparkles", label: "Floodlight", icon: Sparkles },
  { value: "parking", label: "Parking", icon: ParkingCircle },
  { value: "door", label: "Door", icon: DoorOpen },
  { value: "lock", label: "Gate / lock", icon: Lock },
  { value: "flame", label: "Geyser / boiler", icon: Flame },
  { value: "thermometer", label: "Heater", icon: Thermometer },
  { value: "droplets", label: "Pump / water", icon: Droplets },
  { value: "waves", label: "Pool", icon: Waves },
  { value: "fan", label: "Fan", icon: Fan },
  { value: "wind", label: "Extractor", icon: Wind },
  { value: "snowflake", label: "Aircon / fridge", icon: Snowflake },
  { value: "monitor", label: "Screen / signage", icon: Monitor },
  { value: "plug", label: "Other", icon: Plug },
];

const ICON_BY_SLUG = new Map(DEVICE_ICONS.map((i) => [i.value, i.icon]));

/** Resolve a stored icon slug, falling back to the category's own icon. */
export function deviceIcon(device: Pick<ClubDevice, "icon" | "category">): LucideIcon {
  return (
    (device.icon ? ICON_BY_SLUG.get(device.icon) : undefined) ??
    DEVICE_CATEGORY_META[device.category].icon
  );
}

/** Group a flat device list into the three categories, preserving sort order. */
export function groupDevices(devices: ClubDevice[]): Record<DeviceCategory, ClubDevice[]> {
  const out: Record<DeviceCategory, ClubDevice[]> = { lights: [], access: [], gadgets: [] };
  for (const d of devices) {
    if (out[d.category]) out[d.category].push(d);
  }
  for (const key of DEVICE_CATEGORIES) {
    out[key].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }
  return out;
}

/** Human summary of a device's auto-off / pulse behaviour, for the control row. */
export function describeDeviceBehaviour(device: ClubDevice): string | null {
  if (device.control_mode === "pulse") {
    const seconds = Math.round(device.pulse_ms / 100) / 10;
    return `Pulses for ${seconds}s`;
  }
  if (device.auto_off_minutes) {
    return device.auto_off_minutes >= 60 && device.auto_off_minutes % 60 === 0
      ? `Switches itself off after ${device.auto_off_minutes / 60}h`
      : `Switches itself off after ${device.auto_off_minutes} min`;
  }
  return null;
}
