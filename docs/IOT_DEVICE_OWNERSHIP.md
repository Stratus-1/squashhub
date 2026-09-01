# IoT Device Ownership

The club admin IoT page is the single management surface for Shelly-connected club hardware.

## Required UI

- Keep one `IoT / Shelly` admin tile as the entry point for device integrations.
- Do not expose a separate `Door Access` tile for Shelly door relays.
- Do not expose separate Shelly light setup panels in the admin page.
- Show registered devices in three peer cards: `Lights`, `Access`, and `Gadgets`.
- Keep one `+ Add` action in the IoT header. It must ask whether the device is a light, access device, or gadget.
- Each registered device is represented by a compact category icon. Clicking the icon opens the device details modal.
- The details modal is the place for device metadata, Shelly identity, location, notes, status, editing, and testing.

## Lovable change constraint

Future UI changes must preserve this ownership model. If a device integration needs additional configuration, add it to the IoT flow or its device modal. Do not recreate parallel Door Access, Court Lights, or Shelly setup surfaces elsewhere in Club Administration.

The separate access policy/configuration domain may continue to exist in code for non-device access rules, but Shelly device registration and operation belong only to IoT. Court booking logic may retain its own billing fields; that is not a second device-management UI.
