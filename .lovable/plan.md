## Restore the elegant hero overlay

### What went wrong

When I fixed the "washed out text" issue, I replaced the original layered gradient with a flat low-opacity navy wash. That made text readable but stripped the premium feel — the bright squash-court poster image now bleeds through (especially at the bottom where the gradient only hits 85% opacity), and the smooth fade-into-the-page-below is gone.

### Fix (single file: `src/pages/Home.tsx`, hero section only)

**1. Restore a layered, deeper overlay** — replace the current single gradient (line 134) with two stacked layers:

- **Base tint layer**: solid dark navy at ~55% opacity across the whole hero. Kills the bright court poster uniformly so text reads everywhere, including if the video fails.
- **Vignette/fade gradient on top**: vertical gradient that's lighter in the upper-middle (where the headline sits — lets a hint of the video motion show through) and **fully solid at the bottom** so the hero blends seamlessly into the next "Problem Section". Roughly: `from-[hsl(220_50%_6%)]/40 via-[hsl(220_50%_8%)]/65 to-[hsl(220_50%_10%)]` (no `/opacity` on the bottom stop = solid).
- Add a subtle **radial highlight** behind the headline using a third absolutely-positioned div (`bg-[radial-gradient(ellipse_at_30%_40%,transparent,hsl(220_50%_6%)_70%)]`) so the text area glows slightly and the edges darken — the classic "cinematic hero" look.

**2. Lighten the video brightness filter** from `brightness-50` to `brightness-75`. With the stronger overlay layers above, we no longer need to dim the video itself so aggressively — this lets the squash motion actually be visible through the overlay rather than looking muddy.

**3. Keep all text colors as-is** (`text-white`, `text-gray-100`, text-shadows) — they're already correct and were not the problem.

**4. Re-introduce one subtle accent** — change the "run your squash club?" span (line 165) from plain `text-white` back to a brand-amber tint (e.g. `text-amber-300`) so the headline has a focal point again, instead of being one flat block of white.

### What this does NOT change

- No CSS variable, Tailwind config, or other page changes
- Text remains fully readable in all four scenarios (dark/light mode × video loads/fails)
- Section below the hero is untouched
- No changes to the nav bar, buttons, or stats

### Verification

After the edit I'll re-fetch the published hero and confirm the overlay now has depth (darker edges, slight glow behind text, solid fade into next section) and the amber accent is back.
