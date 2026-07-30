# WhichAnimalToday MVP — Design

**Date:** 2026-07-26
**Status:** Approved, pending implementation plan

## Context

Pivot from the Notitia/Webscraping property-data project after finding it
hard to market. This is a new, unrelated product: a daily Wordle-style
animal-guessing game, chosen specifically because "cute/weird animal"
content is much easier to market and share than the previous project.
Revenue model is AdSense, driven by traffic volume — same model the
Notitia pivot landed on, but here the content itself is the marketing
hook.

Target: reach ~$1,000/month AdSense revenue, which (per RPM estimates of
$1.50-$8 per 1,000 pageviews) realistically needs roughly **15,000-25,000
monthly visitors**, assuming decent US/UK/CA/AU traffic share and daily
repeat visits from returning players. Shareability is treated as the
primary growth lever (see Section 4).

## 1. Architecture

Framer hosts the entire product — no external backend for the MVP.

- A Framer **CMS collection** stores the 500 animal records (see Section
  2 for fields).
- A Framer **code override** (client-side JS/TS embedded in the page)
  contains all game logic: picking today's animal, rendering hints,
  checking guesses, tracking local game state, and generating the share
  card.
- **AdSense** is added via Framer's custom head-code injection (site
  settings), not through the code override.

This is a deliberate MVP simplification (see "Future upgrade path"
below): the daily answer and hint content are technically visible to
anyone who inspects network requests or JS state before guessing. This
is an accepted, low-stakes risk — it only spoils the game for the
individual who goes looking, the same flaw the original Wordle shipped
with. It does **not** limit AdSense revenue potential, which is a
function of pageviews × RPM, independent of this architecture choice.

**Before committing to this in Framer:** confirm the Framer plan in use
supports at least 500 CMS collection items — some lower tiers cap this
well below what's needed here.

### Future upgrade path (not part of this MVP)

If the game needs server-authoritative guessing (to close the spoiler
gap) or real cross-device streaks/leaderboards, the upgrade is a
contained data-layer swap, not a redesign:

1. Build a small backend (e.g. Cloudflare Workers + D1, or
   Vercel/Render + Supabase Postgres) with endpoints: `GET /today`
   (hint 1 + session token, no answer), `GET /hint/2`, `GET /hint/3`,
   `POST /guess` (server-side check against answer + aliases).
2. Migrate the 500 CMS rows into the new database (scripted
   export/import).
3. Rewire the Framer code override to call the new API via `fetch()`
   instead of reading the CMS collection directly. The visual layer
   (cards, animations, layout) is untouched.

Estimated effort: roughly 2-4 days of focused work.

## 2. Data model

One CMS row per animal, with these fields:

| Field | Purpose |
|---|---|
| `common_name` | Canonical answer shown on reveal |
| `aliases` | Comma-separated accepted alternate names for fuzzy matching (e.g. "puma, cougar, mountain lion") |
| `image` | The daily photo |
| `image_attribution` | Source/license credit, required for open-license compliance |
| `hint_1` | Vague/tricky hint, shown after guess #1 |
| `hint_2` | Narrower hint, shown after guess #2 |
| `hint_3` | Near-giveaway hint, shown after guess #3 |
| `fun_facts` | Shown on the reveal/info card once the game ends |
| `category` | Taxonomic group (mammal/bird/reptile/fish/insect/amphibian/marine) — used for curation/variety tracking, not gameplay logic |

## 3. Game flow

1. On page load, the code override computes today's puzzle index
   deterministically from the date: `hash(YYYY-MM-DD) mod 500`, using
   **UTC midnight** as the daily reset so every visitor worldwide sees
   the same puzzle on the same calendar day (an intentional
   simplification — some visitors will see the new puzzle at a
   different local hour than others, which is standard behavior for
   this genre of game).
2. The corresponding CMS row is fetched and the image displayed
   immediately — no hints needed to start.
3. Player gets **3 total guesses**, submitted as free text.
4. Each submission is normalized (lowercase, trimmed) and checked
   against `common_name` and `aliases`, with light fuzzy-matching
   tolerance for minor typos/plurals.
5. Every guess — right or wrong — reveals the next hint (`hint_1` after
   guess 1, `hint_2` after guess 2, `hint_3` after guess 3).
6. The game ends on a correct guess or after 3 guesses are used. Either
   way, the reveal card is shown: full `common_name`, image (already
   visible), and `fun_facts`.

## 4. Sharing & persistence

On game end, generate a copyable result string, e.g.:

```
WhichAnimalToday #12 🦒 2/3
```

(puzzle number = days since launch, an emoji representing the actual
animal, and the guess count it was solved on, or "X/3" if missed). This
is the primary free-growth/marketing mechanic, mirroring how Wordle
grew through organic social sharing.

`localStorage` (per browser/device, no account system) tracks:
- Whether today's puzzle has already been played, to prevent replay and
  instead show the completed result.
- A simple current-streak counter.

  **Superseded 2026-07-29** — the storage schema described here was
  replaced by a per-day history record; see
  `docs/superpowers/specs/2026-07-29-stats-and-shell-design.md`.

Streaks are explicitly **not synced across devices** in this MVP — an
accepted simplification. Cross-device/account-based streaks would
require the backend upgrade path in Section 1.

## 5. Content sourcing

500 animals, curated across all major groups (mammals, birds, reptiles,
fish, insects, amphibians, marine life) — prioritizing entertainment
value ("cute or weird") over any single taxonomic focus, to keep daily
surprise high across the roughly 16-month cycle before repeats.

- Photos sourced from open-license/public-domain sources (Wikimedia
  Commons, iNaturalist, GBIF, or similar), with `image_attribution`
  recorded per record to satisfy license/attribution requirements.
- Hint text (`hint_1`-`hint_3`, easy-to-hard progression) and
  `fun_facts` are written per animal.
- Final photo selection needs human curation for "is this actually cute
  or entertaining" — not something to fully automate.
