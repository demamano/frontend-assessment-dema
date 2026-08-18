# NOTES

## Constraints 1 + 2 together, and what it cost

I did **not** virtualise. Every filtered row is real DOM, so Ctrl-P prints the complete filtered list (constraint 1) and Ctrl-F keeps working. On-screen cost is controlled two ways: rows are `memo`ized with stable props — the order objects come from one constant dataset, callbacks are `useCallback`-stable — so a keystroke re-renders **zero** unchanged rows (constraint 2, proven in `evidence/`); and `content-visibility: auto` lets the browser skip layout/paint for off-screen rows while they stay in the DOM. A print stylesheet forces them visible for Ctrl-P.

What I gave up: initial mount renders all 5,000 rows once (~a second on a mid-range machine, vs ~instant when virtualised); full-DOM memory; slight scrollbar estimation jitter from `contain-intrinsic-size`. On browsers without `content-visibility` it degrades to "render everything" — correct, just slower.

## Three decisions

1. **CSS `content-visibility` instead of a virtualisation library.** Rejected: `@tanstack/react-virtual`. Windowing unmounts rows, which breaks print and find-in-page — two stated requirements. The rejected option is correct when printing/searching the full list is not a requirement (or is served by a separate print view), or rows are so interactive that DOM node count itself is the bottleneck.

2. **URL as the single source of truth for filters, via `useSyncExternalStore`.** Rejected: `useState` mirrored into the URL with an effect. That creates two sources of truth that drift, and `useEffect` is banned here anyway. The rejected option is correct only where state must survive without URL access (e.g. embedded widgets) — with a router involved, a router-owned search-param API would be the right variant.

3. **`replaceState` for keystrokes, `pushState` for status toggles.** Rejected: `pushState` for everything. It floods history — Back would step through every typed character. The rejected option is correct if the product genuinely wants per-keystroke navigable history (nobody does).

## Library choice (constraint 5)

I used **zero** libraries beyond React/Vite. A table library would spend most of the 300-line budget's savings fighting the printability requirement.

## useEffect count (constraint 4)

Zero. URL sync is `useSyncExternalStore`; panel autofocus is a module-stable callback ref (runs on mount only); focus return on Escape happens inside the event handler.

## Not finished / known limits

- No sorting or pagination (not asked).
- The detail panel overlays the two rightmost columns on narrow screens.
- Keyboard selection is not persisted in the URL (deliberate: it's not filter state).
- No automated tests.
