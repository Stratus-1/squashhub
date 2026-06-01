# Android Google Sign-In with Lovable Cloud (Supabase Auth)

The Android app must use the **native Google Sign-In SDK** to get a Google **ID token**, then exchange it with Supabase via `signInWithIdToken`. Do **not** try to use the web OAuth redirect flow inside the Android app — that's only for browser/PWA.

---

## 1. Google Cloud Console — required OAuth clients

You need **TWO** OAuth 2.0 Client IDs in the **same GCP project**:

### A. Web application client (used by Supabase server)
- Type: **Web application**
- Authorized redirect URI: `https://bzbuppwzljadulwntjys.supabase.co/auth/v1/callback`
- Copy the **Client ID** and **Client Secret** → paste into **Lovable Cloud → Users → Auth Settings → Google provider**.
- This is the client that Supabase uses to validate ID tokens. The Android `serverClientId` must equal this Web Client ID.

### B. Android application client (used by the device)
- Type: **Android**
- Package name: `com.gbsquash.hub`
- SHA-1 fingerprints (add **all** of):
  - Debug keystore SHA-1 (`./gradlew signingReport`)
  - Release keystore SHA-1
  - **Play App Signing SHA-1** (Play Console → Setup → App integrity → App signing key certificate) — required once the app is on the Play Store.
- No client secret is generated for Android clients — that's normal.

> Both clients must live in the same GCP project so the Android client can request an ID token whose `aud` = the Web Client ID.

---

## 2. Lovable Cloud (Supabase) — Google provider config
- **Enabled**: ✅
- **Client ID** = Web Client ID from (A)
- **Client Secret** = Web Client Secret from (A)
- **Skip nonce check**: leave **off** (we pass a nonce from Android, see below)
- Redirect URL shown by Supabase must match what you put in GCP (A).

---

## 3. Android implementation

Use the modern **Credential Manager + Sign in with Google** library (recommended) — the legacy `GoogleSignInClient` still works but is deprecated.

### Gradle
```kotlin
implementation("androidx.credentials:credentials:1.3.0")
implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
implementation("io.github.jan-tennert.supabase:gotrue-kt:3.1.1")
```

### local.properties (do not commit)
```
SUPABASE_URL=https://bzbuppwzljadulwntjys.supabase.co
SUPABASE_ANON_KEY=<anon key>
GOOGLE_WEB_CLIENT_ID=<Web Application Client ID from step 1A>
```

Expose `GOOGLE_WEB_CLIENT_ID` to code via `BuildConfig` in `build.gradle`.

### Sign-in flow
```kotlin
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.gotrue.providers.Google
import java.security.MessageDigest
import java.util.UUID

suspend fun signInWithGoogle(activity: Activity) {
    val rawNonce = UUID.randomUUID().toString()
    val hashedNonce = MessageDigest.getInstance("SHA-256")
        .digest(rawNonce.toByteArray())
        .joinToString("") { "%02x".format(it) }

    val googleIdOption = GetGoogleIdOption.Builder()
        .setFilterByAuthorizedAccounts(false)
        .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)   // ← Web Client ID
        .setNonce(hashedNonce)
        .build()

    val request = GetCredentialRequest.Builder()
        .addCredentialOption(googleIdOption)
        .build()

    val cm = CredentialManager.create(activity)
    val result = cm.getCredential(activity, request)

    val googleCred = GoogleIdTokenCredential.createFrom(result.credential.data)
    val idToken = googleCred.idToken

    supabase.auth.signInWith(io.github.jan.supabase.gotrue.providers.builtin.IDToken) {
        provider = Google
        this.idToken = idToken
        this.nonce = rawNonce          // raw, not hashed
    }
}
```

After this call, `supabase.auth.currentSessionOrNull()` is populated and you can run the role-resolution flow from [ANDROID_ROLES.md](./ANDROID_ROLES.md).

---

## 4. Common errors

| Error | Cause | Fix |
|---|---|---|
| `Unsupported provider: provider is not enabled` | Google not toggled on in Lovable Cloud | Enable Google in Auth Settings |
| `invalid_grant` / `bad_id_token` / `audience mismatch` | `serverClientId` ≠ Web Client ID configured in Supabase | Use the **Web** Client ID, not the Android one |
| `Nonce mismatch` | Passing hashed nonce to Supabase, or omitting it | Hash nonce for Google, send **raw** nonce to Supabase |
| `DEVELOPER_ERROR` / `[16]` from Credential Manager | SHA-1 missing or wrong package name in Android OAuth client | Add debug + release + Play App Signing SHA-1s |
| `No credentials available` | Test device has no Google account, or `filterByAuthorizedAccounts=true` on first run | Add a Google account to the emulator; keep filter `false` for first sign-in |
| User signs in but has no membership | Auth works; user has no `club_members` row | Show "not part of a club" screen — see ANDROID_ROLES.md |

---

## 5. Quick checklist

- [ ] GCP Web client redirect URI = `https://bzbuppwzljadulwntjys.supabase.co/auth/v1/callback`
- [ ] GCP Android client has package `com.gbsquash.hub` + debug/release/Play SHA-1
- [ ] Lovable Cloud → Google provider: Client ID + Secret = **Web** client values
- [ ] Android `serverClientId` = **Web** Client ID (not the Android one)
- [ ] Raw nonce sent to Supabase, SHA-256 hash sent to Google
- [ ] Same GCP project for both OAuth clients
