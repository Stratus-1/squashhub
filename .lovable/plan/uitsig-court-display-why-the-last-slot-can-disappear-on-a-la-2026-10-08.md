# Uitsig court display: why the last slot can disappear on a laptop

## Findings (checked, no code changed)

- **The live app is not the problem.** The published display already uses Uitsig's real settings: 45-minute slots from 05:15, with the last slot at 21:45. The timeline runs to the end of that slot. Nothing is hard-coded, and the booking data is correct.
- **The screen always tries to fit the whole day into the browser window, with no scrolling.** It takes exactly the window's height and stops the page scrolling. Every slot row shrinks to fit: at laptop sizes (1366×650 and 1093×520, which is roughly 125% zoom) all 23 rows still fit. That is why you can see 21:45 even on a phone, just very small.
- **Why the admin saw it stop at 21:00 (likely, not confirmed):** the board never scrolls, so anything that covers or cuts off the bottom of the browser window hides the last rows with no way to scroll to them. Typical causes on a laptop are:
  - a browser window that isn't maximised, or extends behind the Windows taskbar or dock
  - an app or kiosk browser that reports a taller window than you can actually see
  - a cropped screenshot

  At laptop height each row is only about 20 px, so hiding just 40 to 60 px at the bottom removes exactly the 21:45 row (and 22:30). That matches the screenshot.
- **Extra finding:** the page itself measures about 69 px taller than the window, because of a hidden element below the board. It doesn't push the board down, but it is untidy.
- **A side effect of my last preview change:** the new "22:30" closing label overlaps the "21:45" label at laptop heights. Its rows are too close together for both labels to fit.

## Recommended minimal fix (display page only)
1. **Size the board to the space you can actually see,** using the browser's "visible height" (`100dvh`) instead of the full window height. This also covers phone address bars and kiosk browsers.
2. **Never cut rows off silently.** Give each slot row a small readable minimum height. If the screen is too short for the whole day, the timeline scrolls inside the board instead of hiding the last rows. On a normal full-screen TV everything still fits with no scrolling.
3. **Fix the closing-time label:** show "22:30" only when there's room, and nudge it so it never overlaps "21:45".
4. **Remove the extra 69 px** below the display page so the page can't scroll at all.

**Unchanged:** colours, clock, the current-time line, booking names, view-only behaviour and the club's slot settings.

## Check before and after
- Uitsig settings at 1920×1080 (TV), 1366×650 and 1093×520 (laptop, and 125% zoom), and a phone: every row from 05:15 to 21:45 is visible or reachable by scrolling, with no overlapping labels.
- A club with 30- and 60-minute slots looks the same as today.

## Question
If you have the admin's laptop screenshot, browser name and screen size, I'll confirm which cause it was. If not, the fix above covers all of them.
