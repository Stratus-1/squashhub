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
