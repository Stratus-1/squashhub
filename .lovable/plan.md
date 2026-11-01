# Live or device scoring — tournaments and leagues

## Aim
Add an optional **Score on this device** mode so poor venue internet does not interrupt point-by-point scoring. Keep **Live** as the default and preserve existing scoring rules, results, standings and access permissions.

This plan covers tournaments first and league games second. It authorises no changes to live tournament data and no publication during implementation.

## Non-negotiable: protect current Live scoring
- **Live continues exactly as it works today:** same point handling, immediate updates, format rules, saving, spectator display and permissions. No automatic switch to device mode.
- The new local queue and retry worker run **only** after an explicit device-mode choice. Live sessions do not depend on the new storage, reservations or sync worker.
- Keep existing Live write and lock behaviour unchanged for matches without an explicit device reservation. New ownership checks apply only where a device session was deliberately reserved, preventing a competing marker from overwriting that match; existing ongoing Live matches are never adopted or migrated.
- Test Live with the club switch both OFF and ON while Live remains selected, and alongside a different match using device mode. Check points, undo, reload, completion, spectators, league scorecards and tournament progression against the existing behaviour.
- **Release gate:** any change to current Live behaviour blocks rollout. If safe isolation requires a wider Live-scoring rewrite, stop and seek approval rather than expand this work.

## What the scorer sees
- Before starting an eligible match, choose **Live** or **Score on this device**.
- Device mode saves each point, undo, game score and serving state on that phone before attempting to send it.
- A compact status beside **Sync now** shows **Saved on this device**, **Syncing**, **Synced**, or **Needs attention**. Local match completion remains visibly **Awaiting sync** until the server accepts it.
- Reopening the app offers to resume an unfinished match or retry an unsent result.
- Keep the scoring buttons and status clear on phones, without obstructing play.

## When syncing happens
1. **After each game within the match:** automatically attempt to send the latest saved state.
2. **At match completion:** automatically attempt to submit the final result.
3. **When connectivity returns or the app reopens:** retry queued work automatically.
4. **During play when connected:** send coalesced updates in the background, not a separate request for every tap.
5. **Any time:** the scorer can press **Sync now**.

Retries use increasing delays and stop repeatedly retrying permission or conflict errors. A connection indicator alone is not proof of success: only a server acknowledgement marks data as synced.

Spectators see only successfully synced scores. Standings and play-off advancement use accepted completed results, never unfinished or device-only scores. League results count immediately when accepted, without introducing player confirmation; captain-only NSA submission remains unchanged.

## Safeguards and practical limits
- **Prepare while online:** open the saved fixture, load its players and exact rules, and reserve marking on that device before going offline. The first release will not create fixtures or start uncached matches with no connection.
- **One scoring owner per match:** an authoritative reservation prevents another device from casually taking over. Reconnection validates ownership and the saved result version. Any authorised takeover makes the old device's queue stale, not entitled to overwrite newer scores.
- **No silent conflict resolution:** changed players, changed rules, another accepted result or a revoked link produce **Needs attention**. Retain the local score for organiser review; corrections use the existing audited correction path.
- **No double submission:** repeated syncs and lost acknowledgements return the same accepted result rather than recording it or advancing play-offs twice.
- **Exact formats:** use the shared format resolution, including PAR 7/11/15, Best of 3/5, Play all, doubles serving and supported timed formats. A format must pass recovery tests before device mode is offered for it.
- **Permissions stay intact:** league Set up remains restricted to captains, admins, Leagues-permitted members and lineup players. Anyone with existing authorised marking access, including an open league/tournament link, can mark; device mode grants no setup or administration rights.
- **Durability is not a backup guarantee:** scores survive a normal app close, reload or battery shutdown after saving, but cannot survive a lost phone, cleared browser data or failed device storage. Refuse device mode if local storage cannot safely save.
- **Closed-app limitation:** automatic sync is guaranteed only while the app is running or after reopening. Phones may suspend closed/background apps; no promise of unattended background delivery.
- **Expired access:** keep unsent scores, request renewed access when needed and retry only after server validation. Never bypass login or a revoked public link.

## Delivery stages
### 1. Shared foundation and tournament practice pilot
- Build durable local sessions and a retry-safe queue, reusing the current scoring engine rather than making a second one.
- Add validated device reservations and an atomic, version-checked sync entry point alongside the existing result writer.
- Integrate device mode into tournament marking; route accepted completion through existing standings, fixture handover and progression.
- Keep the club switch OFF by default. Start with a synthetic Riverside practice tournament, in line with the existing tournament pilot rule. Highveld is a later candidate after sign-off, not automatically enabled by this plan.

### 2. League scoring
- Reuse the same local storage and sync machinery with a league-specific result adapter.
- Preserve fixture, team and rubber identities: each rubber syncs independently into the same scorecard.
- Preserve player/format setup restrictions, captain signatures where already required, and captain-only external NSA submission.
- Test a practice league fixture before enabling a selected club; do not alter Tuesday's live fixtures as part of testing.

### 3. Controlled rollout
- Obtain sign-off after phone tests and compare online scoring with the unchanged Live mode.
- Enable only explicitly chosen clubs, then consider wider rollout separately.
- Disabling new device sessions must still allow authorised pending sessions to finish syncing; never discard queues during rollback.

## Technical approach
- Use a transactional IndexedDB store through a small established wrapper, with versioned records scoped by club, competition, fixture/rubber and scoring session. Store minimal fixture/player display data, no exported member lists or device credentials.
- Persist ordered scoring operations and a reconstructable checkpoint, including undo and doubles serving; persist timer state for supported timed formats.
- Serialize sync per session. Use stable operation/result identifiers, monotonically ordered revisions, ownership validation and expected server versions.
- Keep separate adapters for tournament and league writes; reuse shared domain rules and authoritative result writers, with atomic acceptance and idempotent side effects.
- Inspect current marker persistence, Match Day device access and lock handling before implementation; existing browser storage is not assumed to provide an offline queue or exclusive ownership.
- Tournament integration starts in `src/pages/MatchMarker.tsx`, `src/lib/marker-storage.ts` and `src/hooks/use-champ-marker-lock.ts`. Replace the current single browser-wide draft only for opted-in device sessions; the existing 60-second stale-heartbeat takeover must not invalidate an offline reservation automatically. Trace the league scorecard writer separately before phase 2.
- Review migrations, permissions, generated types and replay behaviour together. Record architectural changes in the relevant project notes during implementation.

## Checks required before sign-off
- Save points offline, undo, complete games and a match, reload, and recover the exact scores and serving state.
- Reconnect and read back the accepted result through fixtures and standings; verify play-off handover happens once.
- Repeat sync after a lost acknowledgement; prove no duplicate result, awards or progression.
- Try two devices, a stale queue, an edited fixture, expired login and a revoked scoring link; prove there is no overwrite or access bypass.
- Verify concrete PAR targets and game-win thresholds, especially PAR 7 Best of 5 requiring three game wins.
- Verify independent league rubbers and immediate accepted results, with setup and NSA submission restrictions unchanged.
- Test web/PWA, Android and iOS reload/recovery, airplane mode, intermittent signal, storage failure and phone layout; state any platform testing still unavailable.
- Check existing Live mode for regressions and confirm clubs with the switch OFF remain unchanged.

## Scope and effort
A medium-sized, staged change—not a quick toggle. The main work is durable recovery, safe ownership and repeatable submission, followed by real-phone testing. Approval starts the tournament foundation and practice pilot; league release and wider rollout remain gated by their checks and sign-off.

No tournament draws, scheduling, payment flows, ladder rules or unrelated screens are redesigned. This protects scoring against weak internet; it does not prevent a Cloud outage, and standings cannot update while the server is unavailable.