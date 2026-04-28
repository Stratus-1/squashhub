# Fix washed-out homepage hero on other users' devices

## Root cause

The hero is designed assuming the background video (`/videos/hero-bg.webm`) always loads and provides a dark backdrop for white text. On the other user's device the video isn't rendering — they are seeing only the light poster image (`hero-court.jpg`) plus a gradient overlay that fades to the page background color.

Combined with light color mode being active, this produces:

- Heading uses `text-foreground` → near-black, washed against the light poster → looks like faded gray
- Description uses `text-gray-200` → essentially invisible on a white/light background
- Only the `text-landing-navy` span ("run your squash club?") and stat numbers stay readable because their color is hard-coded

The video can fail to play for several normal reasons (slow connection, mobile data saver, autoplay blocked, codec not supported, ad-blocker, corporate firewall). Cache refresh does not help because the styling itself isn't safe without the video.

## Fix

Make the hero readable in all conditions — dark video loaded, light poster fallback, light mode, or dark mode — by:

1. **Force a guaranteed-dark backdrop behind the hero text**, independent of theme and video state. Replace the current theme-bound gradient (`from-background/40 via-background/60 to-background`) with a fixed dark overlay (e.g. dark navy → slightly lighter navy, ~50–70% opacity). This works whether the video plays or only the poster shows.

2. **Hard-code the hero text colors** so they don't follow `--foreground`:
   - Heading: white instead of `text-foreground`
   - "run your squash club?" accent: keep amber/golden or switch to a light accent that reads on dark (the current `text-landing-navy` only worked because the video was dark — on the failed-video light fallback it's the only readable piece, but on a proper dark overlay we want it to pop, so use a brand amber/gold or white)
   - Description paragraph: keep `text-gray-200` (already correct for dark backdrop)
   - Tagline under the buttons: keep white

3. **Strengthen the poster fallback**: add a darkening filter (`brightness-50` or a dark tint layer) so even if the video never loads and only `hero-court.jpg` shows, the backdrop is dark enough for white text.

4. **Keep stats and section below intact** — the problem is isolated to the hero overlay.

## Files to change

- `src/pages/Home.tsx` — hero `<section id="top">` only:
  - Add `brightness-50` (or wrap in a dark tint layer) on the `<video>`/poster
  - Replace the theme-bound gradient div with a fixed dark overlay
  - Change heading from `text-foreground` to `text-white`
  - Change the accent span from `text-landing-navy` back to a brand color that reads on dark (white or amber)

No CSS variable, Tailwind config, or other page changes needed.

## What this does NOT change

- Color mode behavior elsewhere on the site
- The dark video itself
- The `--landing-navy` token (other places may still use it; we just stop relying on it for the hero accent)

## Verification

After the change, the hero will render correctly in all four scenarios:
1. Dark mode + video loads ✓
2. Dark mode + video fails (poster only) ✓
3. Light mode + video loads ✓
4. Light mode + video fails (poster only) ← this is the broken case the other user is hitting

I'll re-fetch the published site afterward and visually confirm.
