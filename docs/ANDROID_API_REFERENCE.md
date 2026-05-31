# SquashHub — Android Dashboard Screens & API Reference

Reference for building out the native Android app (Kotlin + `supabase-kt`).
All requests are authenticated as the signed-in user. RLS enforces tenant
isolation; you **must** always filter by the active `club_id` and prefer
`club_member_id` over `user_id`.

Supabase project:
- URL: `https://bzbuppwzljadulwntjys.supabase.co`
- Anon key: see `local.properties` (matches web `VITE_SUPABASE_PUBLISHABLE_KEY`)

---

## 0. Bootstrap — required on app start

Before any dashboard call, resolve the active **club** and **club_member**.
The web equivalent lives in `src/contexts/ClubContext.tsx` / `MemberContext.tsx`.

### 0.1 Resolve current user's club + member
```kotlin
// table: club_members  (one row per user per club; this app is single-tenant per user)
supabase.from("club_members").select(
  Columns.list("id, club_id, name, role, ladder_position, skill_level, avatar_url, gender, plays_league, club:club_id(id, name, subdomain, logo_url)")
) {
  filter { eq("user_id", auth.currentUserOrNull()!!.id) }
  limit(1)
}.decodeSingle<ActiveMember>()
```
Cache `clubId` and `memberId` in a singleton — every screen below uses them.

### 0.2 Optional: family/shared logins
A `user_id` can have multiple `club_members` rows (family accounts). If
`decodeList` returns >1, show an account picker (see web `MemberContext`).

---

## 1. BOOKINGS

### Screens to add
| Screen | Purpose |
|---|---|
| **Courts grid** (day view) | 24h grid of all courts × time slots for a chosen date |
| **My bookings** | List of upcoming + past bookings for the active member |
| **New booking sheet** | Pick court + time + opponent (member or guest) + lights |
| **Booking detail** | Cancel, invite via WhatsApp/Email, mark as match result |

### 1.1 List courts for the club
```kotlin
supabase.from("courts").select("id, name") {
  filter { eq("club_id", clubId) }
  order("id", Order.ASCENDING)
}
```

### 1.2 Load all bookings for a date (grid view)
```kotlin
supabase.from("bookings").select(
  "id, court_id, date, start_time, end_time, status, user_id, club_member_id, opponent_member_id, guest_name, lights_requested, source, is_friendly, " +
  "booker:club_member_id(id, name, avatar_url), opponent:opponent_member_id(id, name)"
) {
  filter {
    eq("club_id", clubId)
    eq("date", "2026-05-31") // yyyy-MM-dd
    eq("status", "active")
  }
}
```
Render a busy-cell when a `(court_id, start_time)` row exists. The unique
index `idx_no_double_booking` prevents double-booking at the DB level.

### 1.3 My upcoming bookings (dashboard widget)
```kotlin
supabase.from("bookings").select("id, court_id, date, start_time, end_time, opponent_member_id, guest_name, court:court_id(name), opponent:opponent_member_id(name)") {
  filter {
    eq("club_id", clubId)
    eq("status", "active")
    gte("date", today)                // yyyy-MM-dd
    or { eq("club_member_id", memberId); eq("opponent_member_id", memberId) }
  }
  order("date"); order("start_time")
  limit(10)
}
```

### 1.4 Create a booking
```kotlin
supabase.from("bookings").insert(mapOf(
  "club_id" to clubId,
  "court_id" to courtId,                 // int
  "date" to "2026-06-01",
  "start_time" to "18:00:00",
  "end_time"   to "18:45:00",
  "user_id" to userId,
  "club_member_id" to memberId,
  "opponent_member_id" to opponentMemberId,    // nullable
  "guest_name" to null,                        // or "John Smith" for visitors
  "lights_requested" to true,
  "is_friendly" to true,
  "source" to "squashhub",
  "status" to "active",
))
```
Duplicate slot → Postgres unique-violation (code `23505`). Surface
"Court already booked for that slot".

### 1.5 Cancel a booking
```kotlin
supabase.from("bookings").update(mapOf("status" to "cancelled")) {
  filter { eq("id", bookingId) }
}
```

### 1.6 Share a booking via WhatsApp / Email — edge function
`POST /functions/v1/booking-invite`
```json
{ "booking_id": "<uuid>", "channel": "whatsapp" | "email", "to": "+27…" | "x@y.com" }
```

### 1.7 Realtime updates
```kotlin
supabase.channel("bookings:$clubId")
  .postgresChangeFlow<PostgresAction>(schema = "public") {
    table = "bookings"; filter = "club_id=eq.$clubId"
  }.collect { /* refresh grid */ }
```

---

## 2. LADDER & CHALLENGES

### Screens to add
| Screen | Purpose |
|---|---|
| **Ladder standings** | Full ordered list of members with `ladder_position` |
| **Player profile** | Tap a member to see record, send challenge |
| **Challenge inbox** | Incoming / outgoing challenges with counter-proposal |
| **New challenge sheet** | Pick opponent + date + time + court |

### 2.1 Full ladder
`ladder_position` in `club_members` is the **source of truth**. Same gender
only — the web filters by `gender`.
```kotlin
supabase.from("club_members").select(
  "id, name, avatar_url, ladder_position, skill_level, gender"
) {
  filter {
    eq("club_id", clubId)
    not("ladder_position", FilterOperator.IS, null)
    eq("gender", currentMember.gender) // ladder is gender-scoped
  }
  order("ladder_position", Order.ASCENDING)
}
```

### 2.2 Top 5 (dashboard widget)
Same query as above with `limit(5)`.

### 2.3 My challenges (in + out, pending/accepted)
```kotlin
supabase.from("challenges").select(
  "id, status, proposed_date, proposed_time, counter_date, counter_time, court_id, " +
  "challenger:challenger_member_id(id, name, avatar_url), " +
  "opponent:opponent_member_id(id, name, avatar_url), " +
  "court:court_id(name)"
) {
  filter {
    eq("club_id", clubId)
    or { eq("challenger_member_id", memberId); eq("opponent_member_id", memberId) }
    in_("status", listOf("pending", "accepted"))
  }
  order("created_at", Order.DESCENDING)
}
```

### 2.4 Create a challenge
```kotlin
supabase.from("challenges").insert(mapOf(
  "club_id" to clubId,
  "challenger_member_id" to memberId,
  "opponent_member_id" to opponentId,
  "proposed_date" to "2026-06-05",
  "proposed_time" to "19:00:00",
  "court_id" to courtId,
  "status" to "pending",
))
```

### 2.5 Counter-propose / accept / decline
```kotlin
// counter
update(mapOf("counter_date" to d, "counter_time" to t))
// accept (opponent or challenger after counter)
update(mapOf("status" to "accepted", "confirmed_by" to userId))
// decline
update(mapOf("status" to "declined"))
```
When accepted, the **client** should also `INSERT` into `bookings` with the
agreed slot and `challenge_id = challenges.id` (see web `Challenges.tsx:220`).

### 2.6 Realtime
Subscribe to `challenges` filtered by `club_id` so both parties see
counter-proposals live.

---

## 3. LEAGUE

### Screens to add
| Screen | Purpose |
|---|---|
| **My league matches** | Upcoming fixtures where I'm in the lineup |
| **Fixture detail** | Home/away teams, venue, my position, scorecard |
| **League standings** *(optional)* | Division table |
| **Capture scorecard** | 5/8-position lineup with set scores (captains only) |

### 3.1 Find fixtures I'm playing in
Two-step (matches web `Dashboard.tsx:146`):
```kotlin
// (a) my lineup rows for upcoming fixtures
val lineups = supabase.from("league_fixture_lineups").select(
  "fixture_id, league_id, position, club_id"
) { filter { eq("club_member_id", memberId) } }.decodeList<Lineup>()

val fixtureIds = lineups.map { it.fixture_id }

// (b) hydrate fixtures
supabase.from("platform_league_fixtures").select(
  "id, fixture_date, start_time, venue_name, home_team_code, away_team_code, division, status, court:court_id(name)"
) {
  filter {
    in_("id", fixtureIds)
    gte("fixture_date", today)
    eq("status", "scheduled")
  }
  order("fixture_date")
}
```

### 3.2 Full fixture lineup (both teams) — for fixture detail
```kotlin
supabase.from("league_fixture_lineups").select(
  "position, club_id, club:club_id(name), member:club_member_id(id, name, avatar_url)"
) {
  filter { eq("fixture_id", fixtureId) }
  order("club_id"); order("position")
}
```

### 3.3 Submit a result (captain only)
Update the fixture row:
```kotlin
supabase.from("platform_league_fixtures").update(mapOf(
  "status" to "completed",
  "score" to "3-2",
  "game_scores" to "11-9,8-11,11-6,…",
  "winner_team_code" to "GBA",
  "notes" to ""
)) { filter { eq("id", fixtureId) } }
```
Per-rubber set scores live in `league_fixture_rubbers` (query `\d` if you
need them). RLS only allows captains of the home/away club.

### 3.4 Push result to NSA (national admin site) — edge function
`POST /functions/v1/nsa-submit-result`
```json
{ "fixture_id": "<uuid>" }
```
Uses encrypted captain credentials from `club_secrets`. Returns
`{ ok: true, nsa_fixture_id: 1234 }`.

---

## 4. MATCH RESULTS

### Screens to add
| Screen | Purpose |
|---|---|
| **Recent results** (dashboard widget) | Last N confirmed matches involving me |
| **All matches** | Full match history with W/L badges |
| **Add result** | Pick opponent (member or visitor) + score + notes |
| **Pending confirmations** | Matches submitted by opponent awaiting my confirm |

### 4.1 My recent matches (confirmed)
```kotlin
supabase.from("matches").select(
  "id, match_date, score, game_scores, notes, confirmed, disputed, winner_member_id, " +
  "player_a:player_a_member_id(id, name, avatar_url), " +
  "player_b:player_b_member_id(id, name, avatar_url), " +
  "court:court_id(name)"
) {
  filter {
    eq("club_id", clubId)
    eq("confirmed", true)
    or { eq("player_a_member_id", memberId); eq("player_b_member_id", memberId) }
  }
  order("match_date", Order.DESCENDING)
  limit(20)
}
```

### 4.2 Submit a new result
```kotlin
supabase.from("matches").insert(mapOf(
  "club_id" to clubId,
  "match_date" to "2026-05-31",
  "player_a_member_id" to memberId,
  "player_b_member_id" to opponentMemberId,   // null for visitor
  "notes" to "vs John Smith (visitor)",       // free text; visitors are parsed from notes
  "score" to "3-1",
  "game_scores" to "11-9,11-7,8-11,11-5",
  "winner_member_id" to memberId,
  "submitted_by_member_id" to memberId,
  "confirmed" to false                        // opponent confirms
))
```
If opponent is unlinked/visitor → set `confirmed = true` immediately (no one
to confirm).

### 4.3 Pending confirmations (opponent's view)
```kotlin
filter {
  eq("club_id", clubId)
  eq("confirmed", false)
  eq("disputed", false)
  eq("player_b_member_id", memberId)         // I'm the opponent
  neq("submitted_by_member_id", memberId)
}
```

### 4.4 Confirm / dispute
```kotlin
// confirm
update(mapOf("confirmed" to true)) { filter { eq("id", matchId) } }
// dispute
update(mapOf("disputed" to true)) { filter { eq("id", matchId) } }
```

---

## 5. KEY DB CONCEPTS (do not skip)

1. **Always filter by `club_id`** — RLS will silently return empty if you
   forget it on cross-tenant tables.
2. **Prefer `*_member_id` over `*_user_id`** — `club_members` is the truth
   for identity (family accounts share a `user_id`).
3. **Names**: read `club_members.name`; fall back to `profiles.name` only
   for unlinked rows.
4. **Dates/times** are `date` and `time` (no TZ). Send `yyyy-MM-dd` and
   `HH:mm:ss`.
5. **Ladder is gender-scoped** — filter by `gender` everywhere.

---

## 6. EDGE FUNCTIONS USEFUL FROM ANDROID

Invoke via `supabase.functions.invoke("<name>", body)`:

| Function | Use |
|---|---|
| `booking-invite` | Send WhatsApp/Email invite for a booking |
| `nsa-submit-result` | Captains push a fixture result to NSA |
| `court-lights` | Toggle smart relay for a court (lights on/off) |
| `push-notifications` | Server-side push trigger (FCM) |
| `email-notifications` | Send a transactional email |

All take a JSON body, return JSON. CORS is enabled.

---

## 7. REALTIME CHANNELS WORTH SUBSCRIBING TO

```
bookings        filter: club_id=eq.<clubId>   → refresh grid + my bookings
challenges      filter: club_id=eq.<clubId>   → inbox live updates
matches         filter: club_id=eq.<clubId>   → confirmations
notifications   filter: user_id=eq.<userId>   → bell badge
```

---

## 8. SUGGESTED DASHBOARD UPGRADE (replacing the empty screenshot)

```
┌──────────────────────────────┐
│  Header (club logo + name)   │
├──────────────────────────────┤
│  Hi, Daniel  · Ladder #1     │
│  [intermediate]              │
├──────────────────────────────┤
│  Quick actions (2x2 grid)    │
│  [ Book court ] [ Challenge ]│
│  [ Add result ] [ My league ]│
├──────────────────────────────┤
│  My Bookings (next 3)        │ ← §1.3
├──────────────────────────────┤
│  Pending challenges (badge)  │ ← §2.3
├──────────────────────────────┤
│  Next league match           │ ← §3.1
├──────────────────────────────┤
│  Ladder Top 5                │ ← §2.2
├──────────────────────────────┤
│  Recent results              │ ← §4.1
└──────────────────────────────┘
```

Build the 4 quick-action screens first (Booking grid, Challenge,
Add Result, My League). Everything else is read-only widgets that
hit the queries above.
