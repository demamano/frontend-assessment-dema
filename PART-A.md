# Part A — Written Questions

**Position applied for:** Front-End Engineer <!-- TODO: replace with the exact title from the job posting -->

---

## Section 1 — Code

### Q1

Factually wrong: `React.memo` does a **shallow** comparison (`Object.is` per prop), not a deep one. And the diagnosis is backwards — a rebuilt `columns` array fails by **reference inequality**; an actual deep compare would *pass*, because the contents are equal every render.

The `useMemo` fix works only if `columns` is the sole unstable prop and its dependency array doesn't change per keystroke. It fails if any other prop changes identity each render, or if `columns` is memoized with deps that themselves change on every keystroke.

Two other independent defeaters: (1) inline callback props like `onEdit={() => …}`, recreated every render; (2) row objects recreated per keystroke, e.g. a `.filter().map()` that returns new product objects each time.

Actual cause: the keystroke updates search state in a common ancestor, and React re-renders that subtree by default. Broken memoization doesn't cause the re-render — it just makes it cost 500 rows.

### Q2

**Defects, ranked:**

1. **A failed update silently sticks.** The `catch` swallows the error, `patch.undo()` is never called, and — because `invalidatesTags` only fires when a mutation *fulfills* — a rejected PATCH triggers **no** refetch. Conditions: any PATCH failure (network, 4xx/5xx) while the user views the unfiltered list. What they see: the row flips to the new status and stays there; the save never happened, no error appears, and the truth only returns on a manual reload. First because it silently shows wrong data indefinitely — an integrity failure, not a latency one; ops trusts a status that is false.

2. **Optimistic update targets the wrong cache entry.** `updateQueryData('getProducts', {} …)` patches only the cache entry whose arg is exactly `{}`. Conditions: user has any filter/param applied (the normal case). What they see: click "activate", nothing changes for the round-trip until the invalidation refetch lands — reported as "the button is slow / does nothing", and double-clicks follow.

3. **Blanket `['Product']` invalidation refetches every cached `getProducts` variant on every mutation.** Conditions: several filter combinations cached, or rapid bulk status edits. What they see: spinners/flicker across lists and request storms after each click.

**False comment:** "the invalidation will refetch anyway" — false on the failure path it annotates: `invalidatesTags` does not run for rejected mutations, so nothing refetches and the un-reverted patch persists (defect 1).

**Looks wrong but is fine:** mutating the draft (`row.status = status`) inside `updateQueryData`. It looks like illegal state mutation, but the callback runs inside Immer, which turns mutations into an immutably-produced next state.

### Q3

```tsx
export const SupplierBadge = memo(function SupplierBadge({ supplierId }: { supplierId: string }) {
  const { data, isLoading, isError } = useGetSupplierQuery(supplierId);
  if (isLoading) return <Skeleton className="h-5 w-24" />;
  if (isError || !data?.name) return null;
  return <span className="rounded bg-muted px-2 py-0.5 text-xs">{data.name.toUpperCase()}</span>;
});
```

Removed:

1. **The `useState` + `useEffect` mirror of query data.** It forces a second render per row after every fetch commit (200 rows → 200 post-paint re-renders) and creates a second, lagging source of truth — the cross-row bug below.
2. **`useMemo` on `toUpperCase()`.** Uppercasing a short string is cheaper than the memo bookkeeping ×200 rows; it also memoized the *stale* mirrored state.
3. **The `useSupplierName` hook.** Pure indirection that hid the duplication.

**The cross-row bug** is fixed by removal 1. Sequence: rows are keyed by index; sorting/filtering makes the instance that showed supplier A receive `supplierId` B. Render shows `name` = "A" while B loads (or, if `data.name` for B is empty/undefined, the `if (data?.name)` guard means `setName` **never** runs). Result: B's row wears A's name — briefly in the happy path, permanently in the empty-name path. Deriving the label from `data` directly makes stale state impossible.

**Not solved by the rewrite:** 200 rows still issue 200 independent supplier queries — an N+1 request fan-out. The real fix is in the data/API layer: a batch `getSuppliers(ids)` endpoint, or embedding the supplier name in the list rows the table already fetches.

### Q4

1. **Painted values, in order:** `idle` (before click) → `saving` (flushed when the handler suspends at `await`) → `idle` (final).

2. `saved` is assigned, but the very next statement in the same post-`await` continuation runs `setLabel(label === 'saving' ? 'done' : label)`. `label` is the **stale closure value `'idle'`** — captured at the render before the click — so it assigns `'idle'`. React 18 batches both `setLabel` calls into one re-render; only the last value (`idle`) is committed, so `saved` is never painted. `done` is never assigned at all (the stale `label` isn't `'saving'`), and `failed` isn't reached (success path).

3. Final value: **`idle`**. The user has lost all evidence the save happened — the button looks untouched, which invites a second click and a duplicate request.

4. Smallest fix: **delete the last line** (`setLabel(label === 'saving' ? 'done' : label);`). The sequence becomes idle → saving → saved (or failed), all correct.

---

## Section 2 — Design and judgement

### Q5

```ts
type Meta = { page: number; pageSize: number; total: number };
type AppError = { code: ErrorCode | 'UNKNOWN_ERROR'; message: string; field?: string };
type Result<T> =
  | { ok: true; data: T; meta: Meta }
  | { ok: false; error: AppError };

type FailurePresenter =
  | { on: 'form'; fields: ReadonlySet<string>; fieldMap?: Record<string, string>;
      setFieldError: (field: string, message: string) => void;
      setFormError: (message: string) => void }
  | { on: 'toast' }
  | { on: 'silent' };

// The one thing consumers call:
declare function apiCall<T>(req: ApiRequest, failure: FailurePresenter): Promise<Result<T>>;
```

One layer parses the envelope, normalizes the error, and *presents* the failure according to the declared presenter; callers only ever see `Result<T>` and typically just use the `ok: true` branch.

1. **Non-null `data` without casts:** the envelope is already a discriminated union. `if (res.error === null)` narrows to the branch where `data: T` and `meta` are non-null; the layer maps that branch to `{ ok: true, data, meta }`. Pure narrowing, no assertion.
2. **New `ErrorCode` = compile error:** the single code→behaviour/copy mapping is an exhaustive `switch` whose `default` calls `assertNever(code: never)`. A new union member is no longer assignable to `never` — compilation fails at exactly the spot needing a decision.
3. **Unknown runtime code:** before that switch, a runtime guard (`isKnownCode(c): c is ErrorCode` over an array of known codes) catches values the compiler never saw and normalizes them to `{ code: 'UNKNOWN_ERROR', message: server's message }`, which still routes to the toast / form-level banner — the user sees the backend's message rather than nothing. (2 is compile-time exhaustiveness; 3 is runtime defense.) The `silent` presenter stays silent by contract — that's its required behaviour, not swallowing.
4. **`error.field` mismatch:** `setFieldError('warehouse_id')` on a form registered as `warehouseId` renders nowhere — the message is silently lost. Fixed in the form presenter: it owns `fields` and a per-form `fieldMap` (server name → form name); any unmatched field falls back to `setFormError` so the message is always visible, and the mismatch is logged so the map gets updated.

### Q6

**Reject.** Virtualisation unmounts off-screen rows, which breaks both of this team's actual workflows: Ctrl-P prints only the rendered window — the clipboard sheet silently loses ~95% of the filtered orders (worst kind of failure: it *looks* complete); Ctrl-F cannot find order numbers that aren't in the DOM, so the pre-print lookup step dies too. The people it breaks for are the warehouse floor — the only users of this screen.

Instead: keep every row in the DOM and make rows cheap. Flatten each row to plain memoized markup (no per-row hooks, no heavy cell components, precomputed formatting), then add `content-visibility: auto` with `contain-intrinsic-size` so the browser skips layout/paint for off-screen rows while they remain real DOM — printable, and still findable by Ctrl-F in Chromium. A print stylesheet forces full rendering on Ctrl-P. If six seconds was mostly JS, memoized cheap rows fix it; profile to confirm rather than assume.

Cost, stated plainly: initial DOM construction for 3,000 rows still takes a few hundred ms; full-DOM memory stays; scrollbar length is estimated so it can jitter; `content-visibility` benefits depend on the browser — on an old browser it degrades to today's behaviour, no worse. Verify on the warehouse machines.

### Q7

**(b), the forms.** Silent destruction of typed work is unrecoverable data loss, and it teaches users the product can't be trusted — a freeze is visible and survivable, lost input is not. It can also fire *during* the demo: server-side validation failing while a supplier watches their data vanish is disqualifying; a known 4-second load can be scripted around (open the table before you talk over it).

What stays broken because of my choice: the 12,000-row table still freezes the tab ~4 seconds on load, including at the demo.

To the person who wanted (a): "You're right that the freeze is embarrassing, and it's my first task after the demo — booked. But losing a user's typed data mid-demo would end the conversation; slow-but-correct won't."

### Q8

**Conflicting pairs:**

- **2 vs 3.** "Select all" includes products on pages never loaded, but the dialog must show the *exact* SKUs affected. You cannot display what you haven't fetched, and fetching every matching product to display defeats the reason the pages weren't loaded (the match set is unbounded). **Keep 2** (as server-side "update by filter" or an ids-only fetch). Ticket: confirmation shows exact count + first 50 SKUs + "download full list (CSV)". Question: *is a count plus sample acceptable for confirmation, or do you audit exact SKUs — and if exact, is an ids-only endpoint acceptable?*

- **4 vs 5.** Above 500 ids the client must send multiple requests; any request can fail independently, so client-side chunking can never be atomic. Atomicity across chunks is only possible server-side. **Keep 4** (a real API constraint). Ticket: chunked submission, per-chunk results, retry of failed chunks; atomicity dropped unless backend adds a transactional bulk endpoint. Question: *can the backend expose one transactional bulk operation (or accept a filter server-side)? If yes, 5 comes back.*

- **5 vs 6.** "All or nothing" can never produce a toast saying "X succeeded, Y failed" — 6's copy presumes exactly the partial failure 5 forbids. **Keep 6** (it matches chunked reality). Ticket: result toast with succeeded/failed counts and a "view failures / retry" list. Question: *when a later chunk fails, do already-applied chunks stay applied or get best-effort reverted?*

(1 vs 2 is an ambiguity, not a contradiction: "selection persists while filters change" needs snapshot-of-ids semantics pinned down for filter-based select-all.)

**Survive unchanged: three — #1, #4, #6.**

---

## Section 3 — Review and judgement under pressure

### Q9

**Verdict: Request changes.**

1. **FilterBar.tsx** — `clear()` sets `window.location.href = '/products'`: a full page reload, which is exactly what AC-2 forbids. Remove the redirect; clearing must go through state (see #2).
2. **FilterBar.tsx** — `clear()` never propagates: it resets local `suppliers` but never calls `onChange`, so even without the redirect the list would keep the old filter. Call `onChange({ ...value, suppliers: [] })`.
3. **FilterBar.tsx** — the description claims this is now "a controlled component", but it isn't: `suppliers`/`draft` live in local state and `value` is never used to render them; the two can diverge (e.g. parent resets, UI still shows chips). Either derive the UI from `value` and make `onChange` the only writer, or drop the claim. Also: added suppliers can't be removed individually, and empty/duplicate `draft` values are addable — handle both.
4. **useProducts.ts** — `refetchOnMountOrArgChange: true` is unrelated to both ACs and changes fetch behaviour for every consumer of the hook (refetch on every mount, cache defeated). Revert; if there's a real staleness problem, separate PR with justification.
5. **date.ts** — unrelated scope ("we should do this everywhere" belongs in its own PR), and the diff shows no corresponding removal or import change in `OrderTable.tsx`, so this likely duplicates the function or breaks the build. Split it out.

**Deliberately not commented on:** the missing Enter-to-add and other Add-button ergonomics — blocking correctness issues above dominate, and I'd review UX once the ACs are actually met.

**AC-1 (multiple suppliers):** cannot tell from the diff alone — the UI collects `string[]`, but nothing shows that `Filters`/the API accept `suppliers`. I'd check the `Filters` type and the query serialization, then run it. **AC-2 (clear without reload):** not met — see comments 1 and 2.

### Q10

**First 60 minutes:** (0–5) Confirm scope: compare `origin/development` against my local clone and CI's last checkout; identify the pre-push tip SHA. Immediately enable force-push/deletion protection on `development` so it can't happen again mid-recovery. (5–15) Message the two blocked developers (below). Announce in the team channel: nobody pulls, rebases onto, or pushes `development` until the all-clear. (15–40) Restore: push the recovered tip back (`git push origin <sha>:development`), sourcing the freshest copy from a local clone, CI workspace, or GitHub's push-events API. The four PR branches are recoverable from GitHub's `refs/pull/<n>/head` even though their source branches were deleted — fetch each and push it back under its original name. (40–60) Verify: PRs show their commits again, CI green on `development`, a second developer confirms the SHA matches what they had. All-clear message.

**Blocked developers:** at minute ~5: "development was force-pushed and lost 11 commits; I'm restoring from a good copy. Don't pull or push; your local work is safe — ETA ~10:00." Again at all-clear, with exact pull instructions.

**Business owner:** same day, after resolution: production unaffected, no work lost, protection now enforced. Before resolution only if it will run past midday or threatens a date — they hear it from me, not secondhand.

**Permanent change:** branch protection on `development` (no force-push, no deletion, PR-only merges). Agreed by the engineering lead and the repo admin; announced to the team. Blameless — the fix is the guardrail, not punishing the developer.

### Q11

**To the developer (≤120 words):**

> Hi [name] — about the 900-line PRs. Your work is some of the strongest on the team, which is exactly why I need it reviewable. Last week's PR wasn't reviewed — it was approved under deadline pressure, and at that size review is theatre. When something in it breaks, nobody but you can debug or revert it safely. From next sprint: PRs at ~300 lines or a stacked chain of smaller ones, and new behaviour lands with tests. This isn't process for its own sake — it's what lets me merge your work fast instead of it sitting in review for days. If something genuinely can't be split, flag it to me before opening it and we'll plan the review together.

**To the business owner (≤80 words):**

> Quick note on shipping speed. We're capping the size of each change we merge. Large all-at-once changes look fast, but they're where our rework and incidents come from — they're hard to check and expensive to undo. Smaller, checked changes ship sooner and break less, so overall delivery speeds up within a couple of sprints. Short term you'll see more frequent, smaller releases — that's the plan working, not delivery slowing down.

---

## Section 4 — Experience

> **⚠️ THESE TWO ANSWERS MUST BE YOUR OWN.** Q12 and Q13 ask about *your personal* history; an invented answer is easily probed in an interview. Below is the structure to fill in — replace every bracketed prompt with your real experience, then delete this note.

### Q12

**[FILL IN — a real bug you introduced. Structure to cover, ≤200 words:]**

- *Mechanical fault:* [e.g. "I compared dates with `new Date(a) > new Date(b)` where `b` was `yyyy-MM-dd` parsed as UTC midnight, so orders placed before 02:00 local time landed on the previous day's report."]
- *Discovery:* [who noticed — a user, support, a dashboard? e.g. "The finance team noticed daily totals disagreed with the payment provider by a few orders each day."]
- *Time live:* [honest number — "about three weeks".]
- *What changed in how I work (not the code):* [e.g. "I now write a failing test around any date/timezone boundary before fixing it, and I stopped shipping changes that touch reporting without comparing one day's output against the source system."]

### Q13

**Screen 1 — [FILL IN name/type, ≤80 words]:** what it did and who used it; who built the API and how you agreed the contract (e.g. OpenAPI spec first? shared TS types? a meeting and a wiki page?); the single hardest technical thing.

**Screen 2 — [FILL IN, ≤80 words]:** same three points.