## Problem

The hamburger menu items on the homepage don't reliably navigate to the right sections. The target sections (`#top`, `#features`, `#pricing`, `#clubs`) all exist on the page, but the menu buttons are wrapped in Radix `SheetClose asChild`. When tapped, Radix immediately closes the sheet and unmounts the menu, which can cancel the inner button's `onClick` (smooth scroll) before it runs — so the menu just closes and nothing happens, or it jumps to the wrong place.

## Fix

Convert the hamburger Sheet to a **controlled** component and run the action *first*, then close the sheet — instead of relying on `SheetClose asChild` to do both.

### Changes in `src/pages/Home.tsx`

1. Add controlled state for the mobile sheet:
   ```tsx
   const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
   ```

2. Add a small helper that performs the action then closes the menu:
   ```tsx
   const handleMobileNav = (action: () => void) => {
     setMobileMenuOpen(false);
     // Defer scroll/navigate one tick so the sheet starts closing first
     // and the target section is reachable.
     setTimeout(action, 50);
   };
   ```

3. Wire `<Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>`.

4. Remove all `<SheetClose asChild>` wrappers inside the mobile nav and replace each item with a plain `<Button>` whose `onClick` calls `handleMobileNav(...)`:
   - Home → `handleMobileNav(() => scrollTo("top"))`
   - Features → `handleMobileNav(() => scrollTo("features"))`
   - Pricing → `handleMobileNav(() => scrollTo("pricing"))`
   - Find/Create My Association → `handleMobileNav(() => scrollTo("clubs"))`
   - Register Your Club → `handleMobileNav(() => navigate("/auth"))`

5. Drop the now-unused `SheetClose` import.

### Why this works

Closing the sheet via state (rather than via Radix's `SheetClose` intercepting the click) guarantees the `onClick` handler runs to completion. The 50 ms `setTimeout` ensures the target section is laid out and reachable before `scrollIntoView` runs, so smooth-scroll lands on the correct anchor every time.

No other files need to change. Section IDs (`top`, `features`, `clubs`, `pricing`) are already correctly defined on the page.