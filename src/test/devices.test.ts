import { describe, it, expect } from "vitest";
import {
  DEVICE_CATEGORIES,
  DEVICE_CATEGORY_META,
  DEVICE_ICONS,
  type ClubDevice,
  describeDeviceBehaviour,
  deviceIcon,
  groupDevices,
} from "@/lib/devices";

const device = (over: Partial<ClubDevice> = {}): ClubDevice => ({
  id: over.id ?? "d1",
  club_id: "c1",
  category: "gadgets",
  name: "Geyser",
  icon: null,
  location: null,
  notes: null,
  enabled: true,
  sort_order: 0,
  control_mode: "toggle",
  provider: "shelly",
  shelly_device_id: "abc",
  shelly_channel: 0,
  pulse_ms: 3000,
  ble_mac: null,
  auto_off_minutes: null,
  last_state: null,
  last_state_at: null,
  last_error: null,
  created_at: "2026-08-31T00:00:00Z",
  updated_at: "2026-08-31T00:00:00Z",
  ...over,
});

describe("device categories", () => {
  it("only gadgets is restricted to admins and staff", () => {
    const restricted = DEVICE_CATEGORIES.filter((c) => DEVICE_CATEGORY_META[c].restricted);
    expect(restricted).toEqual(["gadgets"]);
  });

  it("defaults access devices to a momentary pulse and the rest to on/off", () => {
    expect(DEVICE_CATEGORY_META.access.defaultControlMode).toBe("pulse");
    expect(DEVICE_CATEGORY_META.lights.defaultControlMode).toBe("toggle");
    expect(DEVICE_CATEGORY_META.gadgets.defaultControlMode).toBe("toggle");
  });
});

describe("groupDevices", () => {
  it("splits devices into the three groups", () => {
    const grouped = groupDevices([
      device({ id: "a", category: "lights", name: "Patio" }),
      device({ id: "b", category: "access", name: "Side gate" }),
      device({ id: "c", category: "gadgets", name: "Geyser" }),
    ]);
    expect(grouped.lights.map((d) => d.name)).toEqual(["Patio"]);
    expect(grouped.access.map((d) => d.name)).toEqual(["Side gate"]);
    expect(grouped.gadgets.map((d) => d.name)).toEqual(["Geyser"]);
  });

  it("orders by sort_order, then alphabetically", () => {
    const grouped = groupDevices([
      device({ id: "a", category: "lights", name: "Zebra", sort_order: 0 }),
      device({ id: "b", category: "lights", name: "Alpha", sort_order: 0 }),
      device({ id: "c", category: "lights", name: "First", sort_order: -1 }),
    ]);
    expect(grouped.lights.map((d) => d.name)).toEqual(["First", "Alpha", "Zebra"]);
  });

  it("returns every group even when empty, so callers can render headings safely", () => {
    const grouped = groupDevices([]);
    expect(Object.keys(grouped).sort()).toEqual(["access", "gadgets", "lights"]);
    expect(grouped.gadgets).toEqual([]);
  });

  it("ignores rows with an unknown category rather than throwing", () => {
    const grouped = groupDevices([device({ category: "sauna" as never })]);
    expect(grouped.lights.concat(grouped.access, grouped.gadgets)).toEqual([]);
  });
});

describe("deviceIcon", () => {
  it("uses the stored icon slug when it is on the allow-list", () => {
    expect(deviceIcon(device({ icon: "flame" }))).toBe(
      DEVICE_ICONS.find((i) => i.value === "flame")!.icon,
    );
  });

  it("falls back to the category icon for an unset or unknown slug", () => {
    expect(deviceIcon(device({ icon: null, category: "lights" }))).toBe(
      DEVICE_CATEGORY_META.lights.icon,
    );
    expect(deviceIcon(device({ icon: "not-a-real-icon", category: "access" }))).toBe(
      DEVICE_CATEGORY_META.access.icon,
    );
  });
});

describe("describeDeviceBehaviour", () => {
  it("describes a pulse in seconds", () => {
    expect(describeDeviceBehaviour(device({ control_mode: "pulse", pulse_ms: 3000 }))).toBe(
      "Pulses for 3s",
    );
    expect(describeDeviceBehaviour(device({ control_mode: "pulse", pulse_ms: 500 }))).toBe(
      "Pulses for 0.5s",
    );
  });

  it("describes auto-off in whole hours where it divides evenly", () => {
    expect(describeDeviceBehaviour(device({ auto_off_minutes: 120 }))).toBe(
      "Switches itself off after 2h",
    );
    expect(describeDeviceBehaviour(device({ auto_off_minutes: 45 }))).toBe(
      "Switches itself off after 45 min",
    );
  });

  it("says nothing for a plain on/off device", () => {
    expect(describeDeviceBehaviour(device({ auto_off_minutes: null }))).toBeNull();
  });

  it("ignores auto-off on a pulse device, which cannot latch on", () => {
    expect(
      describeDeviceBehaviour(device({ control_mode: "pulse", auto_off_minutes: 30 })),
    ).toBe("Pulses for 3s");
  });
});
