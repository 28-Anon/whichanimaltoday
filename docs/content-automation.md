# Content automation

**Built 2026-08-27.** Before this, nothing added animals on a schedule — only
`daily-archive.yml` was automated, and it archives what already happened.

## The problem this solves

`getTodayPuzzleIndex` wraps modulo the list length. Running out of animals is
therefore **not an error**: no exception, no empty state, no log line. The game
serves Giraffe again and every player who has been there since launch sees a
rerun.

Measured 2026-08-27: 78 animals in rotation, 27 served, **52 days of unseen
content, repeating 2026-10-18**. Nothing in the repo said so out loud.

    npm run content:runway

## The two workflows

**`content-propose.yml`** — Mondays 06:00 UTC, plus `workflow_dispatch`.

Checks the runway first and stops there if it is 60 days or more, so most weeks
cost nothing. Otherwise runs discover → score → draft, then `content:propose`,
which branches, force-adds `review.md` and `data/pending.json`, pushes and opens
a pull request. **It never touches `data/animals.json`.**

**`content-accept.yml`** — on push to master touching `review.md`.

Merging the pull request is the approval, and its arrival on master is the
trigger. Runs `content:accept` (mirrors images, appends animals, records the
rejections, regenerates credits, deletes the sheet), then `images:display
--apply`, then `content:order`, then validates and commits.

## Why review stays human

The review sheet renders every candidate photo inline. The two judgements that
cannot be automated are *can you actually guess this animal from this photo* and
*is every fact true*.

This is measured, not assumed. Across nine animals on 2026-08-12 an automated
first-pick produced a washed-out raccoon, a hedgehog shot at night, and a cow
moose with no antlers — **all three passed every mechanical gate**. See
`docs/follow-ups.md`, "Phase 3 sourcing: what the first two batches actually
cost". The image judge enforces the rule; it does not rank quality.

To reject a candidate, delete its whole `## <qid>` section from `review.md`
before merging. Everything left is accepted, and everything deleted goes into
`data/rejected.json` and is never proposed again.

## The backstop

`daily-archive.yml` ends with `contentRunway.ts --threshold=30`. It runs after
the archive step, so a failure there never costs the day's entry — the run just
goes red. That is the only warning that exists if Content Propose dies quietly
(expired API key, changed Wikidata schema), and 30 days is enough to source and
review a batch by hand.

## Required setup

`ANTHROPIC_API_KEY` must exist as a repository secret — `content:score` and
`content:draft` both fail without it:

    gh secret set ANTHROPIC_API_KEY --repo 28-Anon/whichanimaltoday

If "Allow GitHub Actions to create and approve pull requests" is off, the
branch is still pushed and `proposeCandidates.ts` prints its name instead of
failing; open the pull request by hand.
