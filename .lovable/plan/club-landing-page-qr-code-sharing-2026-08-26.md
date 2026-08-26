# Club Landing Page QR Code Sharing

## Goal
Give club admins an easy way to generate, brand, and share QR codes that point to their public landing page or directly to the new-membership application flow. Provide both a downloadable QR image and a printable poster/PDF.

## Where it lives
Add a **"Share & QR Code"** card inside the existing **Rules & Constitution** admin tab (`RulesTab.tsx`), below the preview section. This keeps landing-page-related tools in one place without adding a new top-level tab.

## Admin choices (smart QR)
A segmented control lets the admin pick the QR destination:
1. **Landing page** — opens the public club landing page (`https://<subdomain>.squashhub.co.za` or `/c/<subdomain>`).
2. **New membership application** — deep-links to the auth/register flow with the club pre-selected (`/auth?club=<subdomain>&intent=apply`).

Future extensibility: the same component can accept additional `target` values (e.g. a specific tournament invite) without changing the UI shape.

## Branded QR code
- Use the existing `qrcode.react` `QRCodeSVG` component.
- Centre the club logo in the QR code using `imageSettings`.
- If no club logo is uploaded, fall back to a plain branded QR using the club primary colour (`#1E3A5F` / `landing-navy`).
- Render at 512×512 px for download quality.

## Download options
- **PNG download** — convert the rendered SVG to a canvas and download as `png`.
- **Printable poster (PDF)** — generate an A4 PDF with:
  - Club name and logo at the top.
  - The QR code large and centred.
  - A short call-to-action line ("Scan to join <club name>" / "Scan to apply for membership").
  - The URL printed below the code for manual entry.

## Implementation steps
1. **Create `src/components/club-admin/ClubQrShareCard.tsx`**
   - Accepts `club` object (name, subdomain, logo_url) and `target` enum.
   - Builds the correct public URL from `window.location.origin` + club subdomain path.
   - Renders branded `QRCodeSVG` with logo fallback.
   - Implements PNG download via canvas draw.
2. **Create `src/lib/club-qr-poster.ts`**
   - Helper that uses `qrcode.react` + `reportlab` (PDF skill) to generate the A4 poster PDF.
   - Writes to `/mnt/documents/exports/` and returns the file path for `<presentation-artifact>`.
3. **Wire into `RulesTab.tsx`**
   - Add the Share & QR card below the preview modal trigger.
   - Pass the current club data.
4. **Update `src/pages/Auth.tsx` (or auth handler)**
   - Read `intent=apply` query param and, after sign-in/registration, route the user into the membership onboarding wizard instead of the dashboard.
   - If the user already has an account, route to the club onboarding flow.

## Out of scope
- No QR code displayed on the public landing page itself.
- No dynamic short-code QR system (reuse existing `qr-shortcodes.ts` only if needed later).
- No analytics/scan tracking in this iteration.

## Verification
- Build passes.
- Admin can switch between "Landing page" and "Apply for membership" and see the URL update.
- PNG download works and contains the club logo in the centre.
- PDF poster renders correctly on A4 and includes club branding.
