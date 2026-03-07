# Mobile (iOS/Android) via Capacitor

This project can be shipped as native iOS/Android apps using Capacitor, while keeping the existing React/Vite codebase.

## Prereqs

- Node.js + npm
- iOS: Xcode (macOS)
- Android: Android Studio + JDK

## One-time setup

1. Install dependencies:
   - `npm i`

2. Set env vars:
   - Web + mobile build needs: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
   - Recommended (auth + OAuth redirects): `VITE_PUBLIC_URL=https://gordon-s-bay-squash-hub.vercel.app`
   - Strava connect button needs: `VITE_STRAVA_CLIENT_ID`

3. Build and sync native projects:
   - `npm run cap:sync`

## Run on device/simulator

- Android: `npm run cap:android`
- iOS: `npm run cap:ios`

## Strava (mobile)

The app supports a deep-link redirect for Strava OAuth on native platforms:

- `gbsquash://integrations/strava/callback`

To enable this:

- iOS: URL scheme is configured in `ios/App/App/Info.plist`
- Android: intent-filter is configured in `android/app/src/main/AndroidManifest.xml`

In Strava’s developer settings, add BOTH redirect URIs:

- `https://gordon-s-bay-squash-hub.vercel.app/integrations/strava/callback` (web)
- `gbsquash://integrations/strava/callback` (native)

The backend logic lives in the Supabase edge function `supabase/functions/strava`.

Required Supabase secrets for the function:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`

## Push notifications (PWA + APK)

This project supports:

- **PWA (installed from Chrome)**: Web Push via service worker + VAPID.
- **APK/iOS builds (Capacitor)**: Native push via **Firebase Cloud Messaging (FCM)**.

### PWA (Web Push)

1. Deploy:
   - `supabase functions deploy push-notifications`
   - `supabase db push`
2. On Android/Chrome: install the PWA from the Vercel site and tap **Enable Notifications** in-app.

### Native (Android/iOS) via FCM + APNS

1. Create a Firebase project and add apps:
   - Android package: `com.gbsquash.hub`
   - (Optional) iOS can also be added to Firebase for analytics/crash reporting, but push delivery in this app is APNS token-based.
2. Download config files:
   - Android: `google-services.json` -> `android/app/google-services.json`
3. Add Supabase secrets for sending pushes:
   - Android (FCM legacy): `FCM_SERVER_KEY`
   - iOS (APNS token-based):
     - `APNS_TEAM_ID`
     - `APNS_KEY_ID`
     - `APNS_PRIVATE_KEY` (the `.p8` contents, including header/footer)
     - `APNS_BUNDLE_ID` (must match the iOS bundle id)
     - `APNS_USE_SANDBOX=true` for dev builds, `false` for production/TestFlight
4. Sync native projects:
   - `npm run cap:sync`
5. Build/run:
   - Android: `npm run cap:android`
   - iOS: `npm run cap:ios`

Note: native push won’t show in the Android notification bar until Firebase is configured and the device token is successfully registered (Enable Notifications prompt).

### iOS Xcode checklist (required for background delivery)

- Enable **Signing & Capabilities**:
  - **Push Notifications**
  - **Background Modes** → **Remote notifications**
- Ensure the iOS bundle id matches `APNS_BUNDLE_ID` and the app id used in Apple Developer.

### Quick test (background)

1. Install the app (APK/TestFlight/device).
2. Tap **Enable Notifications** in-app (stores a token in `device_push_tokens`).
3. Put the app fully in the background.
4. Insert a row into `public.notifications` for your user (Admin dashboard already has a “send notification” action) and confirm it appears in the OS notification tray.
