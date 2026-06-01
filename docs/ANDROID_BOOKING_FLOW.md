# Android — Booking Flow (Build Spec)

Mirror of the web `Bookings.tsx` flow, stripped to the minimum Android Studio
needs. All calls use `supabase-kt` against:

- URL: `https://bzbuppwzljadulwntjys.supabase.co`
- Anon key: same as web `VITE_SUPABASE_PUBLISHABLE_KEY`

Assumptions: user is signed in. You already resolved `clubId`, `memberId`,
`userId` at app start (see `ANDROID_API_REFERENCE.md` §0).

---

## Screens to build (in order)

1. **Courts Grid** — date picker on top, table of `Court × Time slot`.
   Tap an empty cell → opens "New Booking" sheet. Tap a booked cell → opens
   "Booking Detail".
2. **New Booking sheet** — court + time pre-filled, pick duration, opponent
   (member / visitor / none), friendly toggle, lights toggle, **Book** button.
3. **Booking Detail sheet** — court, time, opponent, **Cancel**, **Share
   (WhatsApp/Email)**, **Add Result**.
4. **My Bookings** — list of upcoming + past bookings for the active member.

That's the whole feature.

---

## Data model (only these 2 tables)

### `courts`
| col | type |
|---|---|
| id | int (PK) |
| club_id | uuid |
| name | text (e.g. "Court 1") |

### `bookings`
| col | type | notes |
|---|---|---|
| id | uuid | client-generated `UUID.randomUUID()` is fine |
| club_id | uuid | **required**, always filter by this |
| court_id | int | |
| date | date | `yyyy-MM-dd` |
| start_time | time | `HH:mm:ss` |
| end_time | time | `HH:mm:ss` |
| user_id | uuid | the booker's auth user id |
| club_member_id | uuid | the booker's `club_members.id` |
| opponent_member_id | uuid? | nullable |
| opponent_id | uuid? | opponent's auth user id (nullable) |
| guest_name | text? | for visitors / external (nullable) |
| is_friendly | bool | `true` = no challenge created |
| lights_requested | bool | |
| status | text | `active` \| `cancelled` |
| source | text | always `"squashhub"` from Android |
| challenge_id | uuid? | set later if a challenge was created |

DB has a unique index that blocks double-booking. On conflict you'll get
Postgres code `23505` — show "Court already booked for that slot".

---

## Flow 1 — Load the grid (`CourtsGridScreen`)

### Step A — get courts for the club (cache for the session)
```kotlin
val courts = supabase.from("courts").select("id, name") {
  filter { eq("club_id", clubId) }
  order("id", Order.ASCENDING)
}.decodeList<Court>()
```

### Step B — get bookings for the chosen date
```kotlin
val bookings = supabase.from("bookings").select(
  "id, court_id, date, start_time, end_time, status, " +
  "club_member_id, opponent_member_id, guest_name, is_friendly, lights_requested, " +
  "booker:club_member_id(id, name, avatar_url), " +
  "opponent:opponent_member_id(id, name)"
) {
  filter {
    eq("club_id", clubId)
    eq("date", "2026-06-01")        // selected day, yyyy-MM-dd
    eq("status", "active")
  }
}.decodeList<Booking>()
```

### Step C — render
Time slots: `06:00` → `22:00` in 30-min steps (or whatever your club uses).
For each `(court, slot)` cell:
- find `b` in `bookings` where `b.court_id == court.id` and
  `slot >= b.start_time && slot < b.end_time`
- if found → busy cell (show booker name)
- else → empty cell (tap → open "New Booking" with `court` + `slot` pre-filled)

### Step D — realtime refresh
```kotlin
supabase.channel("bookings:$clubId")
  .postgresChangeFlow<PostgresAction>(schema = "public") {
    table = "bookings"; filter = "club_id=eq.$clubId"
  }
  .collect { refreshGrid() }
```

---

## Flow 2 — New Booking sheet

### Step A — load opponent picker (members in this club)
```kotlin
val players = supabase.from("club_members").select(
  "id, user_id, name, ladder_position"
) { filter { eq("club_id", clubId) } }.decodeList<Player>()
```

### Step B — user fills the form
- court (pre-filled, editable)
- date (pre-filled)
- start time (pre-filled)
- duration: 45 or 60 min — compute `end_time = start_time + duration`
- opponent: pick a `Player` **OR** type a `guestName` **OR** leave blank
- `isFriendly: Boolean` (default true; if false **and** opponent is a member,
  a challenge is auto-created — see Step D)
- `lightsRequested: Boolean`

### Step C — INSERT booking
```kotlin
val bookingId = java.util.UUID.randomUUID().toString()

supabase.from("bookings").insert(mapOf(
  "id" to bookingId,
  "club_id" to clubId,
  "court_id" to courtId,
  "date" to dateStr,                    // "2026-06-01"
  "start_time" to "$startHHmm:00",      // "18:00:00"
  "end_time"   to "$endHHmm:00",        // "19:00:00"
  "user_id" to userId,
  "club_member_id" to memberId,
  "opponent_member_id" to opponentMemberId,   // nullable
  "opponent_id" to opponentUserId,            // nullable
  "guest_name" to guestName,                  // nullable
  "is_friendly" to isFriendly,
  "lights_requested" to lightsRequested,
  "status" to "active",
  "source" to "squashhub",
))
```
Handle errors:
- `23505` → "Court already booked at that time."
- other → toast the message.

### Step D — (optional) auto-create challenge
If `opponentMemberId != null && !isFriendly`:
```kotlin
val challenge = supabase.from("challenges").insert(mapOf(
  "club_id" to clubId,
  "challenger_member_id" to memberId,
  "opponent_member_id" to opponentMemberId,
  "proposed_date" to dateStr,
  "proposed_time" to "$startHHmm:00",
  "court_id" to courtId,
  "status" to "pending",
)) { select() }.decodeSingle<Challenge>()

// link them
supabase.from("bookings").update(mapOf("challenge_id" to challenge.id)) {
  filter { eq("id", bookingId) }
}
```

---

## Flow 3 — Booking Detail sheet

Input: a `Booking` row already loaded in the grid.

### Cancel
```kotlin
supabase.from("bookings").update(mapOf("status" to "cancelled")) {
  filter { eq("id", booking.id) }
}
```

### Share — WhatsApp or Email (edge function)
```kotlin
supabase.functions.invoke("booking-invite", buildJsonObject {
  put("booking_id", booking.id)
  put("channel", "whatsapp")          // or "email"
  put("to", "+27821234567")           // or "x@y.com"
})
```

### Add Result
Navigate to the Add-Match-Result screen pre-filled with `court_id`, `date`,
opponent. See `ANDROID_API_REFERENCE.md` §4.2.

---

## Flow 4 — My Bookings list

```kotlin
val today = LocalDate.now().toString()   // yyyy-MM-dd

supabase.from("bookings").select(
  "id, court_id, date, start_time, end_time, is_friendly, lights_requested, " +
  "guest_name, opponent_member_id, " +
  "court:court_id(name), " +
  "opponent:opponent_member_id(name)"
) {
  filter {
    eq("club_id", clubId)
    eq("status", "active")
    gte("date", today)
    or {
      eq("club_member_id", memberId)
      eq("opponent_member_id", memberId)
    }
  }
  order("date"); order("start_time")
  limit(50)
}.decodeList<MyBooking>()
```

---

## Suggested Kotlin DTOs

```kotlin
@Serializable data class Court(val id: Int, val name: String)

@Serializable data class Booking(
  val id: String,
  val court_id: Int,
  val date: String,
  val start_time: String,
  val end_time: String,
  val status: String,
  val club_member_id: String?,
  val opponent_member_id: String?,
  val guest_name: String?,
  val is_friendly: Boolean = true,
  val lights_requested: Boolean = false,
  val booker: MemberRef? = null,
  val opponent: MemberRef? = null,
)

@Serializable data class MemberRef(
  val id: String, val name: String?, val avatar_url: String? = null
)

@Serializable data class Player(
  val id: String, val user_id: String?,
  val name: String?, val ladder_position: Int?
)
```

---

## Build order (one PR per step)

1. Courts Grid read-only (Flow 1 A+B+C) — list+render only.
2. New Booking sheet INSERT (Flow 2 A+B+C) — no challenge yet.
3. Booking Detail: cancel + share (Flow 3).
4. My Bookings tab (Flow 4).
5. Realtime subscription (Flow 1 D).
6. Auto-challenge on competitive bookings (Flow 2 D).

Each step is independently shippable.
