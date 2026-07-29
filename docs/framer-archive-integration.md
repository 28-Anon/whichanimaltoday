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
`/archive/<slug>`.

## Detail page

Create a Framer dynamic-route page at path `/archive/:slug`. Framer
passes the `slug` segment into the page's code component as a prop.
Fetch the same `archive.json` URL, find the entry where `entry.slug`
matches the prop, and render its `imageUrl`, `commonName`, `funFacts`,
**and `imageAttribution`**. The attribution line is not optional
decoration — the animal photos are used under Creative Commons licenses
(CC BY-SA, CC BY, or public domain) that require visible attribution
wherever the image is displayed. Render it as a small credit line under
the photo (e.g. "Photo: Charles J. Sharp, CC BY-SA 4.0, Wikimedia
Commons" — exactly the string already stored in `imageAttribution`, no
reformatting needed). The list page's cards don't need this since
they're just thumbnails linking to the detail page where the full
credit lives.

**If Framer's dynamic-route prop-passing doesn't behave as expected**
(this was confirmed with high but not absolute confidence — see the
spec's Section 4): fall back to a single detail page reading a `slug`
value from `window.location.search` via `URLSearchParams` instead of a
path segment, and link to it as `/archive-detail?slug=<slug>` from the
list page.

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
