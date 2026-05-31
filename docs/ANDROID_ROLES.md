# Android — Role Resolution on Login

How the Android app should determine **who** the logged-in user is and **what they can do**. Mirrors what the web app does in `MemberContext` + `useHasPermission`.

There are **two completely separate role systems** in SquashHub. Don't confuse them.

| System | Table | Scope | Purpose |
|---|---|---|---|
| **Platform role** | `public.user_roles` | Per `auth.user` (global) | Super Admin / staff access to `/admin/*` |
| **Club role** | `public.club_members.role` | Per club membership | Day-to-day app role inside one club |

---

## 1. Run this sequence right after `signInWithPassword` / Google sign-in

```
1. session = supabase.auth.currentSession  → get auth.uid()
2. isSuperAdmin = check user_roles for role='admin'
3. membership   = fetch club_members row for (user_id, club_id-of-subdomain)
4. clubRole     = membership.role  ('admin' | 'captain' | 'member' | 'visitor')
5. isClubAdmin  = clubRole == 'admin'  (captain is NOT admin — league-scoped only)
6. permissions  = fetch club_member_permissions for membership.id (optional, granular)
```

If **no membership row** exists for the resolved club → show **"You are not part of this club"** screen. Do NOT log the user out — they may belong to a different subdomain.

---

## 2. Platform Super Admin check

Enum `app_role`: `admin | moderator | user`.

```kotlin
// supabase-kt
val roles = supabase.from("user_roles")
    .select(columns = Columns.list("role")) {
        filter { eq("user_id", auth.currentUserOrNull()!!.id) }
    }
    .decodeList<UserRole>()

val isSuperAdmin = roles.any { it.role == "admin" }
```

RLS already restricts this table to `auth.uid() = user_id`, so any authenticated user can read **their own** rows safely. Never trust a client-side super-admin flag for sensitive actions — RLS on each target table is the real guard.

**What it unlocks**: the `/admin/*` area (Clubs & Associations, Users, Leagues, NSA Import, Subscriptions, Support, platform Settings). On Android: show a "Platform Admin" entry in the drawer.

---

## 3. Club membership + club role

Enum `club_member_role`: `admin | captain | member | visitor`.

```kotlin
val members = supabase.from("club_members")
    .select(columns = Columns.list(
        "id, club_id, user_id, role, name, email, club_member_number, gender, avatar_url, ladder_position"
    )) {
        filter {
            eq("club_id", activeClubId)   // resolved from subdomain
            eq("user_id", authUserId)
        }
        order("joined_at", Order.ASCENDING)
    }
    .decodeList<ClubMember>()
```

Take the **first row** as the primary membership. Then:

| `role` value | Treat as | Notes |
|---|---|---|
| `admin` | **Full club admin** | All admin tabs unlocked |
| `captain` | **Normal member** in the app; team captain for league features only | Do NOT grant admin UI |
| `member` | Normal member | Default |
| `visitor` | Read-only / limited | Hide write actions |

> ⚠️ **Critical rule from project memory**: `captain` is league-scoped only. It must NEVER grant full club admin rights. Only `role = 'admin'` does.

---

## 4. Family / shared logins (multiple `club_members` for same email)

Same email may map to multiple members (e.g. spouse + kids sharing a login). After step 3, also query by email:

```kotlin
val linked = supabase.from("club_members")
    .select(...) {
        filter {
            eq("club_id", activeClubId)
            eq("email", authUserEmail.lowercase())
        }
    }
    .decodeList<ClubMember>()
```

- If `linked.size > 1` → show an **account picker** on first launch.
- Persist the chosen `activeMemberId` in `SharedPreferences` keyed `active_member_${clubId}_${userId}`.
- All subsequent queries (ladder, challenges, bookings, results) must filter by **`activeMember.id`**, not `auth.uid()`.

---

## 5. Granular admin permissions (optional, only if `role != 'admin'`)

A non-admin member can still be granted specific admin capabilities (e.g. only "Bookings" + "Bar"). Read these:

```kotlin
val perm = supabase.from("club_member_permissions")
    .select(columns = Columns.raw("*, club_permission_roles(*)")) {
        filter { eq("club_member_id", activeMember.id) }
    }
    .decodeSingleOrNull<MemberPermission>()
```

Effective permission set:

```
if (clubRole == "admin" || isSuperAdmin) → ALL permissions
else if (perm?.is_full_admin == true)    → ALL permissions
else if (perm?.club_permission_roles?.is_full_admin == true) → ALL
else union of:
   perm.custom_permissions                     (string array)
   perm.club_permission_roles.permissions      (string array)
```

Available permission slugs (must match web exactly):
`club, settings, fees, courts, banking, finance, members, users, visitors, ladder, leagues, champs, bar, access, communications`

Use this set to show/hide admin sections in the drawer. Example:
```kotlin
fun canSee(slug: String): Boolean =
    isSuperAdmin || clubRole == "admin" || effectivePerms.contains(slug)
```

---

## 6. Recommended session state object

Cache this on the Android client once on login and update via Realtime on `club_members` for `eq(user_id, authUserId)`:

```kotlin
data class Session(
    val authUserId: String,
    val email: String,
    val isSuperAdmin: Boolean,
    val clubId: String,
    val activeMember: ClubMember,   // chosen if family
    val linkedMembers: List<ClubMember>,
    val clubRole: String,           // admin | captain | member | visitor
    val isClubAdmin: Boolean,       // clubRole == "admin"
    val effectivePerms: Set<String>
)
```

Drawer/menu visibility rules:

| Item | Show when |
|---|---|
| Platform Admin area | `isSuperAdmin` |
| Club Admin → all tabs | `isClubAdmin` |
| Club Admin → individual tab (e.g. Bookings admin) | `canSee("courts")` etc. |
| League scoring / captain tools | `clubRole == "captain"` **or** `isClubAdmin` |
| Normal user dashboard | always (if `activeMember` resolved) |
| "Not part of this club" screen | membership lookup returned 0 rows |

---

## 7. Things NOT to do (security)

- ❌ Don't store `isAdmin` in `SharedPreferences` and trust it across launches without re-checking the DB.
- ❌ Don't read `profiles` to determine role — `profiles` is **auth only** (decoupled identity rule). All identity/role data comes from `club_members` + `user_roles`.
- ❌ Don't infer super-admin from email domain or hardcoded UUIDs.
- ❌ Don't allow a `captain` to access admin screens. League captain ≠ club admin.
- ✅ Do rely on RLS as the final authority — the UI hides things, the DB enforces them.
