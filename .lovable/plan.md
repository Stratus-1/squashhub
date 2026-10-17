# Tournament organiser and SportyHQ connection

## First: optional tournament organiser
- Add **Tournament organiser (optional)** to the first setup step, beside the tournament name.
- Suggest the club's tournament lead, or a member with tournament permissions, only when there is one clear candidate. Otherwise leave it unselected.
- Allow another club member to be selected, including an admin or committee member who does not have tournament permissions. Being named organiser does **not** grant admin access or change any permissions.
- Keep **No organiser selected** available; clearing the suggestion stays cleared on reopening.
- Save the selection with this tournament's existing setup answers so it follows the tournament across devices. Templates must not carry a previous organiser into a new tournament.
- For Uitsig Club Champs, verify the intended tournament and unique Kaylee Hunt membership before setting only its organiser. No games, entries, results, payments or other setup settings will change. Approval of this plan authorises this specific organiser assignment; no other live-data changes.

## Then: SportyHQ access assessment
SportyHQ offers an official API, but its public information says documentation and credentials must be requested. It does not confirm that an organiser's normal username/password can connect draws or submit results. There is no SportyHQ App User Connector available in this workspace.

- Request SportyHQ's current API documentation and confirmation of administrator authentication, permitted draw/fixture/result operations, and account authorisation.
- Do not collect or save SportyHQ passwords yet, or show a working connection that has not been verified.
- Once supported access is confirmed, add the organiser's private account connection to their profile. Credentials must be server-only, restricted to the account owner and never returned with public profile details.
- Plan read-only upcoming games/draw import first. Draw export and result submission follow separately, with explicit approval, stable external IDs, duplicate protection and a visible success/failure record.
- Keep SquashHub marking and tournament rules unchanged; a SportyHQ login must not grant SquashHub permissions.

## Technical details
- Reuse the existing `StepAnswers` and `tournaments.beta_lifecycle.answers` persistence, rather than adding a second planning store or modifying the competition engine.
- Keep selection and default queries scoped to the active club; read official office/permission assignments only to suggest a name, not to authorise an action.
- Preserve old tournaments with no organiser field. Check both creation and edit/reopen paths, and strip organiser identity from saved templates.
- No new role fields on profiles or users. Any later integration storage/auth changes require a separate reviewed implementation based on SportyHQ's confirmed contract.

## Checks and delivery boundary
- Test optional selection, one clear default, ambiguous defaults, explicit clearing, template stripping and saved/reopened selection.
- Verify the first-step selector in the signed-in Riverside preview, without creating fixtures, sending messages or operating hardware.
- Verify Kaylee's Uitsig assignment by reading back only the organiser field after the approved update.
- Do not publish. SportyHQ sign-in, imports and exports remain blocked until official access/documentation is supplied; this first phase delivers organiser selection only.