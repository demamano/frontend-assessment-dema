# Evidence for constraint 2 — no wasted row renders on keystroke

## React DevTools Profiler recording

`profiler-one-keystroke.json` — exported from React DevTools (profile format v5),
recorded on the unvirtualised list with one keystroke typed into the search box
while a detail panel was open. It contains a single commit in which exactly
**2 components rendered (`App` and `DetailPanel`) and 0 of the 5,000 mounted
`OrderRow` components re-rendered**. Load it via the "Load profile" button in the
React DevTools Profiler tab to inspect.

## Instrumentation

Every render of the memoized `OrderRow` component increments `window.__rowRenders`
([App.tsx](../src/App.tsx), first line of the component body). Reading it before and
after a keystroke gives the exact number of row renders that keystroke caused.

## Measured numbers (dev build; React StrictMode doubles the initial counts by design)

| Action | Rows in DOM before → after | Row renders caused |
| --- | --- | --- |
| Initial mount | 0 → 5,000 | 10,000 (5,000 × 2, StrictMode) |
| Type `ORD-1` (all 5,000 still match) | 5,000 → 5,000 | **0** |
| Type `0` → `ORD-100` (narrows) | 5,000 → 1,000 | **0** (4,000 rows unmount, 1,000 survivors untouched) |
| Type `1` → `ORD-1001` (with status=SHIPPED) | 241 → 24 | **0** |

The first attempt already had no wasted renders (memoized rows + stable props from the
start), so these recordings demonstrate that state rather than a before/after diff.

## Reproduce it yourself

1. `npm install && npm run dev`, open http://localhost:5173
2. In the browser console: `window.__rowRenders`
3. Type one character in the search box.
4. Read `window.__rowRenders` again — the delta is 0 for every row whose content did not change.

Or with React DevTools → Profiler: record, type one keystroke, stop — this is
exactly how `profiler-one-keystroke.json` was produced. The flamegraph shows `App`
rendering while every surviving `OrderRow` is grayed out ("did not render").

## Screenshots

- `01-initial-load.png` — 5,000 rows mounted, unfiltered.
- `02-filtered-panel-open.png` — search `ORD-100`, row selected via arrow keys, panel opened with Enter, focus on the panel.
- `03-keystroke-zero-rerenders.png` — search + status filter combined (state visible in the URL).
