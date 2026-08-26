# Safe Silent Update System

Your summary is correct: after a deploy the new version downloads quietly in the background and **no prompt appears while someone is working**. The banner only surfaces at a safe moment — a page/route change, returning to the app, or when the current task finishes. Critical security releases are the one exception.

## Behaviour

| Situation | What the user sees |
| --- | --- |
| New build deployed, user mid-task (scoring, wizard, form with unsaved input, upload, payment) | Nothing. Update stays parked. |
| User finishes the task or navigates to another page | Small banner: "New version ready — Update now / Later" |
| Taps "Later" | Banner hides for the rest of the session; re-offered on next app open (or next navigation after a long idle) |
| Taps "Update now" | Save state, let in-flight requests settle, reload, land back on the same screen |
| Critical security release | Short countdown notice, then forced reload — still blocked only long enough to flush pending saves |
| Phased rollout | Only the targeted percentage/clubs are offered the update; everyone else stays on the current build until the rollout widens |

## What gets built

### 1. Activity ("busy") detection
New `src/lib/app-activity.ts` — a small ref-counted registry generalising today's `scoring-lock`:
- `beginActivity(kind)` / `endActivity()` plus a `useActivityGuard()` React hook.
- Auto-detected signals: live marker sessions (existing scoring lock feeds in), any open modal/dialog with a dirty form, in-flight mutations from React Query (`useIsMutating`), file uploads, payment redirect flows.
- `isBusy()` is read by the update layer; nothing prompts while it is true.

### 2. Deferred prompt gating
Rework `src/lib/pwa-update.ts` + `UpdatePrompt.tsx`:
- Waiting worker no longer immediately shows the banner — it sets a `pendingUpdate` state.
- Banner shows only when **all** hold true: not busy, no dialog open, and a "safe moment" has occurred (route change via a router listener, tab re-focus after idle, or activity count dropping to zero).
- "Later" records a session-scoped snooze; also honoured on the next cold start via `sessionStorage` (so a fresh app open re-offers it).

### 3. Graceful apply
On "Update now": flush React Query mutations (wait up to ~3s), fire a `sh:before-update` event so screens can persist draft state to `sessionStorage`, then activate the waiting worker and reload. The existing route-restore logic is kept and extended to also restore per-screen draft state.

### 4. Release metadata: criticality + phased rollout
New table `public.app_releases` (platform-admin managed, public read):
`build_id, released_at, severity ('normal' | 'critical'), rollout_percent, target_club_ids[], notes`.
- Client fetches the newest release row on the same 60s poll it already runs.
- Rollout gate: stable hash of `user_id`/device id vs `rollout_percent`, plus optional club allow-list. If not in the cohort, the waiting worker is left parked (no prompt, no activation).
- `severity = 'critical'` bypasses the "Later" snooze and the safe-moment wait: shows a 20s countdown, still flushes pending writes, then reloads.
- Platform admin UI (a card in the existing platform admin area) to set severity and rollout percent per build, so a rollout can be widened without a redeploy.

### 5. No hard refreshes during workflows
`hardRefresh()` and the version-badge check become activity-aware: if busy they warn ("Finish the current task first") instead of reloading.

## Technical notes
- Table gets explicit GRANTs (`select` to `anon` + `authenticated`, `all` to `service_role`) and RLS: public read, write restricted to platform admins.
- `scoring-lock.ts` is kept as a thin wrapper over the new activity registry so existing marker code needs no changes.
- Unit tests for cohort hashing, snooze logic, and the safe-moment gate.
- No change to install prompts, Firebase messaging worker, or preview/iframe SW guards.
