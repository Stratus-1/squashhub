# IoT offline alerts — findings and recommended architecture (on hold)

## Findings

### 1. How online/offline is determined today
- No continuous health tracking exists. Status is only read on demand from Shelly Cloud (`POST {server}/v2/devices/api/get`, field `online: 0|1`):
  - `device-control`: reads it after a switch command to check the relay really switched (and reports "device is offline").
  - `shelly-diagnostics`: a check that a club admin runs by hand. It covers the door controller (club secrets) and the court light switches (`courts.relay_device_id`).
- `club_devices` stores `last_state`, `last_state_at` and `last_error` from the last command only. There is no last-seen time and no outage history.
- Separate system: `router-poll` already watches club routers/internet (Wi-Fi capability, scheduled poll, `club_router_alert_settings`, offline emails). It watches the router, not the Shelly devices.

### 2. What Shelly offers
- Cloud Control API (auth key, what we use now): you can ask whether a device is online right now. No push and no webhooks; about 1 request per second.
- Shelly Cloud real-time events (WebSocket, `Shelly:Online` events with online 0/1): this is native, event-driven detection. It is only available through Shelly's **Integrator programme**, which needs an integrator token from Shelly and the device owner granting access. It also needs a connection that stays open all the time, and backend functions are short-lived and cannot hold one.
- Webhooks on the device itself (Gen2/3): they fire on device events such as an output or input changing. They cannot report the device's own loss of connection, because the device is offline at that moment.
- MQTT with a "last will" message: possible, but it needs a message server we would run and a setup change on every device.

### 3. Shelly's built-in offline notification
- The Shelly app's "device offline" notification goes only to the Shelly account holder, as an app push or email. There is no public API or webhook to send it to SquashHub, so we cannot use it.

### 4. Recommended architecture
- Short term (usable now): check each device on the server at regular intervals. This reuses the Cloud Control `online` flag we already use, so it is not a competing mechanism. Nothing is ever switched; checks are read-only.
- Long term (preferred native option): apply for Shelly Integrator access. Then run a small, always-on listener outside the backend functions (for example a planned GCP worker). It writes `Shelly:Online` events into the same outage table and alert engine. Polling becomes a backstop at a lower frequency.
- Shared alert engine, whichever way detection happens:
  - Settings for each club (alerts on/off, up to 2 member recipients, grace period).
  - Outage state for each device: offline seen, then confirmed after the grace period, then **one** offline email; back online, then **one** recovery email with the downtime.
  - Unknown status (Shelly Cloud unreachable) never sends an alert.
  - Emails go out through the club's own email (SMTP) settings.
- Optional: combine with `router-poll`. If the club router is also offline, say "club internet down" in a single email instead of one email per device.

### 5. Fallback health check (if native is not available)
- One scheduled job every 2–5 minutes. It only runs for clubs that switched alerts on, and devices are grouped by Shelly server to stay within the rate limit.
- Maximum detection delay = check interval + grace period (for example 2 + 5 = about 7 minutes).
- Cost: 288–720 checks a day.

### 6. Test plan (to run after approval)
1. Tests in code for the outage logic: blip shorter than the grace period sends nothing; confirmed outage sends exactly one email; repeated checks while still offline send nothing more; recovery sends exactly one email; unknown status changes nothing.
2. Set up in the preview on Riverside, or on a test Shelly that is not installed anywhere: enable alerts, pick two test recipients, send the test email, and confirm it arrives through the club's email settings.
3. Real disconnection on a bench or spare Shelly (with the club's agreement, never a live door during play):
   - a. Unplug power or Wi-Fi for about 60 seconds, then reconnect. Expect no email (grace period).
   - b. Unplug for 15 minutes. Expect one offline email within check interval + grace, showing club, device and time. Expect no further emails during the outage.
   - c. Reconnect. Expect one recovery email with the restored time and downtime.
   - d. Check the outage records match the emails, and that door and lights still work normally afterwards.
4. Make sure nothing else changed: door, lights and the Gordon's Bay geofence/Bluetooth fallback still behave as before. Clubs that have alerts switched off see no checks and no emails.

### 7. Code already changed by the previous request (frozen, not expanded)
- Database: new tables `club_iot_alert_settings` and `club_iot_device_health`, with access rules for club admins only. Both are currently empty (0 rows).
- Backend function `iot-connectivity-monitor` (deployed): read-only status checks, outage state machine, SMTP emails, admin test email.
- Scheduled job `iot-connectivity-monitor`, every 2 minutes: **live but inert**, because no club has alerts on.
- UI: `src/components/club-admin/IotConnectivityAlerts.tsx`, added at the top of `DevicesTab.tsx`. Preview only, not published.
- Notes: a rule added to `supabase/AGENTS.md`.
- Door control, lights, geofence and Bluetooth code were not touched.

## Decision needed
- A: Keep the existing changes and finish them as the fallback health check, after review, plus apply to Shelly for Integrator access.
- B: Roll them back now. This removes the UI card, unschedules the job and deletes the function; the empty tables can be kept or dropped.
- Either way, step 1 after approval is to unschedule the 2-minute job until the design is approved.
