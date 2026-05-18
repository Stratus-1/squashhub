# ZKTeco Face Recognition Integration

The platform already has the bones of face access control: `AccessControlTab.tsx` with a "Face Recognition" method, a `face_enrolment_required` flag on clubs, a `FaceEnrolmentDialog` (selfie via webcam → stored in `member-faces` bucket → `avatar_url` on `club_members`), and a profile-completion prompt that nudges members to enrol. What's missing is a **provider** abstraction so we can talk to ZKTeco (and similar systems like Hikvision/Suprema later) and actually push enrolled faces to the door terminal.

## What we'll build

### 1. Provider model in the Access Control tab
Add a "Provider" dropdown that appears when **Face Recognition** is selected:
- **ZKTeco — ZKBio CVSecurity / ZKBio Access** (cloud or LAN)
- **ZKTeco — Standalone terminal (Push protocol)** (terminal posts to our endpoint)
- **Generic / Other** (manual enrolment only, no API push)

When ZKTeco is picked, show the right fields:
- **ZKBio**: Base URL (e.g. `http://192.168.x.x:8088` or cloud URL), API username, API password, Area/Department ID, Default access level/door group, "Verify connection" button
- **Standalone Push**: Show a generated webhook URL + shared secret that the terminal posts attendance/enrolment to
- Both: a **Test connection** action and **Sync all enrolled members now** action

Store these in the existing `club_secrets` row (new columns: `access_provider`, `zk_base_url`, `zk_username`, `zk_password`, `zk_area_id`, `zk_door_group`, `zk_webhook_secret`).

### 2. Member-side enrolment improvements
Today `FaceEnrolmentDialog` captures a selfie. We'll:
- Keep the selfie path (works for ZKBio — it accepts a Base64 photo per person).
- Add an **"Upload existing photo"** option (file picker) alongside "Use camera" — useful for members who can't get to a camera right now or who want to use a passport-style photo.
- Add a lightweight client-side quality check (min resolution, single face hint — purely advisory, no ML on device) before allowing save.
- After save, enqueue a **provisioning job** so the photo + member ID get pushed to the configured ZKTeco endpoint.

### 3. Enrolment provisioning + sync (edge function)
New edge function `access-provision-member`:
- Input: `club_id`, `club_member_id` (or `user_id`)
- Looks up the provider config from `club_secrets`
- For ZKBio: creates/updates the person (`club_member_number` as personId, full name, photo Base64) and assigns the configured door group
- For Standalone Push: stores the payload in an outbox table — the terminal pulls it via the push-protocol endpoint on its next heartbeat
- Logs the result to a new `access_provisioning_log` table (status, provider response, retry count)

Triggered automatically when:
- A member completes face enrolment
- An admin clicks "Sync all enrolled members now"
- A new member is added to a club that has face recognition enabled

### 4. Door event ingestion (optional, ZK Push)
New edge function `access-zk-push` (verify_jwt = false, secret in URL or header) that:
- Accepts ZKTeco's Push protocol payloads (attendance records, enrolment confirmations)
- Validates the per-club secret
- Writes accepted check-ins to a new `access_events` table (member, door, timestamp, granted/denied)

This gives admins a live "who came in today" feed later, and confirms enrolment actually landed on the device.

### 5. Admin visibility
In the Access Control tab, below the form, show:
- **Enrolment status**: x of y members have a face photo; x of those are pushed to the device
- **Recent door events** (last 20) if `access_events` has data
- Per-member "Re-sync" button on the Members tab when face recognition is the active method

### 6. POPIA / consent
- Update the enrolment dialog copy to spell out: data shared with ZKTeco device at your club, stored locally on the terminal, can be deleted on request.
- Add an explicit consent checkbox the first time a member enrols; record `face_consent_at` on `club_members`.

## Technical details

**New DB columns**
- `club_secrets`: `access_provider text`, `zk_base_url text`, `zk_username text`, `zk_password text`, `zk_area_id text`, `zk_door_group text`, `zk_webhook_secret text`
- `club_members`: `face_consent_at timestamptz`, `face_provisioned_at timestamptz`, `face_provider_person_id text`

**New tables**
- `access_provisioning_log` (club_id, club_member_id, provider, status, request, response, attempts, created_at) — RLS: club admins only
- `access_events` (club_id, club_member_id nullable, provider_person_id, door_name, event_type, occurred_at, raw) — RLS: club admins read, edge function writes via service role

**New edge functions**
- `access-provision-member` (verify_jwt = true) — server-to-ZKBio bridge
- `access-zk-push` (verify_jwt = false) — receives ZK Push payloads, secret-gated

**Frontend changes**
- `AccessControlTab.tsx` — provider dropdown, ZK fields, Test/Sync buttons, status panel
- `FaceEnrolmentDialog.tsx` — add "Upload photo" tab, consent checkbox, call `access-provision-member` after save
- `MembersTab.tsx` — add "Re-sync face" action when face recognition is the active method

## What we won't do yet
- Direct LAN discovery of ZK terminals (requires being on the same network as the device — out of scope for a hosted SaaS)
- Liveness detection / anti-spoofing on enrolment (rely on the terminal's own liveness)
- Hikvision / Suprema providers — the provider abstraction is ready for them but only ZKTeco is wired up now

## Things I need from you before building
1. **Which ZKTeco setup does Nelspruit actually have** — ZKBio CVSecurity (server software with a REST API), a standalone terminal that supports the Push protocol, or just a local terminal that gets enrolled via USB stick? The integration path differs significantly.
2. **Network**: is the ZKBio server reachable from the public internet (with a real URL/port + credentials), or is it LAN-only? If LAN-only we have to use the Push direction (terminal pulls from us).
3. **Are you OK with the camera selfie being the primary enrolment method**, with photo upload as a fallback?
