# Wiring the Archive pages into Framer

`data/archive.json` (produced by `scripts/runDailyArchive.ts` via the
daily GitHub Actions workflow) is a plain public JSON array, fetched
directly by Framer code components — no Framer CMS collection is
involved for this feature, by design (see
`docs/superpowers/specs/2026-07-27-archive-page-design.md`).

**Public URL:** once this repo is pushed to GitHub and public,
`data/archive.json` is fetchable at:

```
https://raw.githubusercontent.com/<owner>/<repo>/master/data/archive.json
```

## List page

Fetch the URL above, parse the JSON array, sort by `puzzleNumber`
descending (newest first — the file is already append-ordered, but
sorting defensively costs nothing), and render one card per entry using
`imageUrl`, `commonName`, `puzzleNumber`, and `date` — matching the
visual design from the earlier Framer prompt. Each card links to
`/archive-detail?slug=<slug>`.

## Detail page

**Revised after hands-on testing (2026-07-30):** the originally planned
`/archive/:slug` dynamic-route page — where Framer passes the `:slug`
segment into the code component as a prop — turned out not to be
straightforwardly available in Framer's current page settings UI (no
dedicated "Path" field, and the `:slug` syntax had no visible effect
when entered in the URL field). Rather than keep guessing at
undocumented UI, use the approach that only needs a **completely
normal, static page**:

- Create a plain page (e.g. named "Archive Detail", URL `archive-detail`
  — nothing special about it).
- Add the code component there. It reads the animal's slug from the
  `?slug=` query parameter via `URLSearchParams` on
  `window.location.search` — no Framer-specific routing feature
  required at all.
- Fetch the same `archive.json` URL, find the entry where `entry.slug`
  matches the query param, and render its `imageUrl`, `commonName`,
  `funFacts`, **and `imageAttribution`**. The attribution line is not
  optional decoration — the animal photos are used under Creative
  Commons licenses (CC BY-SA, CC BY, or public domain) that require
  visible attribution wherever the image is displayed. Render it as a
  small credit line under the photo (e.g. "Photo: Charles J. Sharp, CC
  BY-SA 4.0, Wikimedia Commons" — exactly the string already stored in
  `imageAttribution`, no reformatting needed). The list page's cards
  don't need this since they're just thumbnails linking to the detail
  page where the full credit lives.

(If Framer's dynamic-route page feature turns out to exist under
different naming than what was checked, switching back to it later is
possible — the component would just need its slug source changed from
the query param back to a prop. Not worth chasing further right now
since the query-param approach works today with zero special setup.)

## Manual verification checklist

- [ ] List page shows every entry currently in `data/archive.json`,
      newest first.
- [ ] Clicking a card navigates to that animal's detail page.
- [ ] The detail page shows the correct photo, name, facts, **and photo
      attribution line** for its slug (check at least two different
      entries, not just the first).
- [ ] A slug that doesn't exist in the data shows a reasonable "not
      found" state rather than a blank page or thrown error.
- [ ] Today's not-yet-revealed animal never appears on either page (true
      by construction, since `archive.json` only ever contains past
      days — but worth a final visual confirmation).
