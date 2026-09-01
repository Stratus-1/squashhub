import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ClubDevice } from "@/lib/devices";

const mocks = vi.hoisted(() => ({
  devices: [] as ClubDevice[],
  doorAvailable: false,
  courtLightsOn: false,
  mutateAsync: vi.fn(),
}));

vi.mock("@/hooks/use-club", () => ({
  useMyClub: () => ({ data: { club: { id: "club-1" } } }),
}));

vi.mock("@/hooks/use-club-capabilities", () => ({
  useHasCapability: () => mocks.courtLightsOn,
}));

vi.mock("@/hooks/use-club-devices", () => ({
  useClubDevices: () => ({ data: mocks.devices }),
  useDeviceControl: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));

vi.mock("@/hooks/use-door-control", () => ({
  useDoorControl: () => ({
    available: mocks.doorAvailable,
    nearDoor: true,
    adminOverride: false,
    loading: false,
    openDoor: vi.fn(),
    proximity: { active: false, hint: "", state: "inside", distance: null, accuracy: null, coords: null, triggerRadiusM: 5 },
    club: { id: "club-1" },
  }),
}));

// Imported after the mocks so the component picks them up.
const { DashboardDeviceControls } = await import("@/components/DashboardDeviceControls");

const device = (over: Partial<ClubDevice> = {}): ClubDevice => ({
  id: "d1",
  club_id: "club-1",
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

describe("DashboardDeviceControls", () => {
  beforeEach(() => {
    mocks.devices = [];
    mocks.doorAvailable = false;
    mocks.courtLightsOn = false;
    mocks.mutateAsync = vi.fn().mockResolvedValue({ ok: true, state: true, online: true });
  });

  it("renders nothing when the club has no controls at all", () => {
    const { container } = render(<DashboardDeviceControls />);
    expect(container.firstChild).toBeNull();
  });

  it("groups devices under Court lights, Access and Gadgets", () => {
    mocks.devices = [
      device({ id: "a", category: "lights", name: "Court 1 court lights" }),
      device({ id: "b", category: "access", name: "Side gate", control_mode: "pulse" }),
      device({ id: "c", category: "gadgets", name: "Clubhouse geyser" }),
    ];
    render(<DashboardDeviceControls />);

    expect(screen.getByText("Club Controls")).toBeTruthy();
    expect(screen.getByText("Court lights")).toBeTruthy();
    expect(screen.getByText("Access")).toBeTruthy();
    expect(screen.getByText("Gadgets")).toBeTruthy();
    expect(screen.getByText("Court 1 court lights")).toBeTruthy();
    expect(screen.getByText("Side gate")).toBeTruthy();
    expect(screen.getByText("Clubhouse geyser")).toBeTruthy();
  });

  it("omits a group heading when that group has nothing in it", () => {
    mocks.devices = [device({ category: "gadgets", name: "Clubhouse geyser" })];
    render(<DashboardDeviceControls />);

    expect(screen.getByText("Gadgets")).toBeTruthy();
    expect(screen.queryByText("Court lights")).toBeNull();
    expect(screen.queryByText("Access")).toBeNull();
  });

  it("marks the Gadgets group as staff-only", () => {
    mocks.devices = [device({ category: "gadgets" })];
    render(<DashboardDeviceControls />);
    expect(screen.getByText("Staff")).toBeTruthy();
  });

  it("gives an on/off device a switch and a momentary device a button", () => {
    mocks.devices = [
      device({ id: "a", category: "gadgets", name: "Geyser", control_mode: "toggle" }),
      device({ id: "b", category: "access", name: "Side gate", control_mode: "pulse" }),
    ];
    render(<DashboardDeviceControls />);

    expect(screen.getByRole("switch", { name: /Switch Geyser on/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Open/i })).toBeTruthy();
    // A pulse device must never render as a switch — its "on" state is momentary.
    expect(screen.queryByRole("switch", { name: /Side gate/i })).toBeNull();
  });

  it("shows the main door in the Access group when it is available", () => {
    mocks.doorAvailable = true;
    render(<DashboardDeviceControls />);
    expect(screen.getByText("Access")).toBeTruthy();
    expect(screen.getByText("Main door")).toBeTruthy();
  });

  it("explains where court lights live instead of offering an unbilled switch", () => {
    mocks.courtLightsOn = true;
    render(<DashboardDeviceControls />);
    expect(screen.getByText("Court lights")).toBeTruthy();
    expect(screen.getByText(/Court lights switch on from your booking/)).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("hides devices an admin has switched off from the dashboard", () => {
    mocks.devices = [
      device({ id: "a", category: "gadgets", name: "Geyser", enabled: true }),
      device({ id: "b", category: "gadgets", name: "Retired pump", enabled: false }),
    ];
    render(<DashboardDeviceControls />);
    expect(screen.getByText("Geyser")).toBeTruthy();
    expect(screen.queryByText("Retired pump")).toBeNull();
  });

  it("surfaces the last error reported by the relay", () => {
    mocks.devices = [device({ last_error: "Geyser is offline." })];
    render(<DashboardDeviceControls />);
    expect(screen.getByText("Geyser is offline.")).toBeTruthy();
  });
});
