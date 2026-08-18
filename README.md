# Front-End Assessment

- **[PART-A.md](PART-A.md)** — written answers.
- **[app/](app/)** — Part B: the order list screen (Vite + React + TypeScript, no other dependencies).
- **[app/NOTES.md](app/NOTES.md)** — decisions, trade-offs, what's unfinished.
- **[app/evidence/](app/evidence/)** — render-count proof for constraint 2.

## Run it

Requires Node 20.19+ (or 22.12+).

```
cd app
npm install
npm run dev
```

Open http://localhost:5173.

## Try

- Type in the search box, toggle statuses — the URL updates; reload and Back both restore state.
- Arrow keys move the selection, Enter opens the detail panel, Escape closes it and returns focus to the row.
- Apply a filter and press Ctrl-P — every filtered row is in the printout.
