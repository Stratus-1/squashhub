# Fix: permission dropdown jumps to top and locks scrolling

## What you're seeing

On the Club Admin → Permissions → Member permissions list, picking a permission role for a member (e.g. Willem Pretorius at Riverside) makes the page jump to the top and the page can no longer be scrolled until you reload.

## Why it happens

Two things happen at the exact moment you choose a role:

1. The member list is sorted so that anyone **with** a permission role floats to the top. As soon as the role is saved, the row you just edited jumps from its place in the list to near the top, and the rest of the table shifts under your cursor — that is the "jumps to top" effect.
2. Because that row moves (and the whole list re-renders while the data refreshes), the dropdown is torn down mid-close instead of closing normally. The dropdown's page-scroll lock is applied on open and removed on close — if it never closes cleanly, the lock stays on the page and scrolling is dead.

## The fix

- Keep the list order **stable while the panel is open**: compute the "who has permissions first" ordering once when the member list loads, and keep each member in that position for the rest of the session instead of re-sorting after every save. New members and refreshes still order correctly; rows no longer leap around under the pointer.
- Save the role change **after** the dropdown has finished closing, so the dropdown always unmounts cleanly and releases the scroll lock.
- Give each row a stable identity so React updates it in place rather than remounting it.
- Add a safety net that clears any leftover page scroll lock (body `overflow`/`pointer-events`) when the permissions panel re-renders, so an interrupted dropdown can never leave the page frozen.

## Technical detail

File: `src/components/club-admin/PermissionsTab.tsx` (`MemberPermissionsSection`)

- `assignableMembers` currently re-sorts on every render using `permMap` (which changes after each `useUpsertMemberPermission` mutation). Replace with a `useMemo` order snapshot keyed on the member id set only, applying the has-permissions sort once and reusing it thereafter.
- Wrap `handleAssignRole` in a deferred call (`requestAnimationFrame` / `setTimeout 0` after the `Select` `onValueChange`) so the Radix `Select` completes its close/unmount before the query invalidation re-renders the table.
- Add a small effect on unmount/re-render that resets `document.body.style.pointerEvents` and `overflow` if they were left set — guards against the Radix scroll-lock leak.
- No schema, RLS, or permission-logic changes; presentation only.

## Verification

Drive the Riverside permissions tab with Playwright: change a member's permission role, confirm the row keeps its position, the page scroll position is preserved, and `document.body` has no residual `overflow: hidden` / `pointer-events: none`.
