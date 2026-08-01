# Field Journal — Design

**Date:** 2026-08-01
**Status:** Approved, not implemented.

## Context

The daily puzzle's retention mechanic is the streak, which says *don't break
me*. A streak is loss-framed and brittle: break it once and the pressure that
held the player is gone.

The archive page already lists every specimen featured so far, but it is
impersonal — the same page for everyone, with no record of how the player
did. It has no reason to be visited twice.

The Field Journal turns that list into a **collection**: every animal the
player identified is stamped in, every one they missed sits there greyed out
and named. Gain-framed rather than loss-framed, and it works alongside the
streak instead of competing with it.

It also matters commercially. Display ad impressions count per **pageview**,
not per interaction, so a second page people actually return to is worth real
money — and the archive is the page that currently has the least reason to be
opened.

## Decision

Upgrade the existing archive page into the Field Journal, rather than
building a second page beside it.

Two near-identical pages listing past specimens would compete for the same
visit and split the traffic. The archive already fetches what the journal
needs.

### The data already exists — no migration, no new storage

The journal is a **join between two things that are already there**:

- `data/archive.json` — what animal appeared on which date. Written daily by
  the existing GitHub Action.
- The local history in `whichanimaltoday_state` — which dates the player
  solved, and whether they got the bonus round.

Joined on **date**. That means the journal works retroactively for every
player who has been playing since launch, with no schema change and no lost
history.

**Joining on date is correct, not merely convenient.** The tempting shortcut
is to derive the animal from the stored `puzzleNumber` — but
`getTodayPuzzleIndex` wraps modulo the list length, so the moment an animal is
added to `data/animals.json` every past `puzzleNumber` re-maps to a different
creature and the whole journal silently rewrites itself with the wrong
animals. The archive is a record of what actually happened and stays true
however the list grows. **Do not use puzzle-number arithmetic here.**

### Three states, and only three

| State | Appearance |
|---|---|
| Identified, with the species bonus | full colour, ⭐ |
| Identified | full colour, stamped |
| Played and missed | greyed, **named**, "not identified" |

An animal that has **not yet been featured does not appear at all.** This is
automatic — `archive.json` only ever contains past days — but it must stay
that way: listing future animals would spoil every upcoming puzzle.

A day the player did not play at all reads as missed. That is honest: they
don't have it.

### Gaps are named, not hidden

The player already saw the answer on the reveal card, so hiding it is fake
mystery and reads as the game being coy. A named gap is a *specific* absence —
"I never got the aardvark" — and specific absences are what pull people back.
It also keeps the page readable as a collection rather than a wall of question
marks, which is discouraging rather than motivating for a newcomer.

## 1. Progress, stated plainly

A header line: **`17 of 22 identified`**, with the bonus-star count beneath
it. One number, prominent, at the top. It is the thing that creates the itch.

No percentage bar and no badges in v1. The fraction is the mechanic; ornament
around it can come later if it earns its place.

## 2. The central limitation, stated honestly

**In v1 a gap can never be filled.** Past puzzles are not replayable — the
archive detail page is a browse-and-reveal page with no guess handling at all
— so a missed animal is missed permanently.

That weakens the premise. A collection you cannot complete is a *record*, not
a collection, and the "come back and fill me" pull is diminished.

It is still worth building, for two reasons:

1. The retention framing still works, inverted: the journal reframes today's
   puzzle as **protecting a permanent record** rather than a streak counter.
   Missing today doesn't reset a number to zero, it leaves a hole with a name
   in it — which is a sharper and more durable motivator than a streak that,
   once broken, stops mattering.
2. **Making archive days playable later requires no rework here.** The journal
   reads from history; a replayed archive day simply writes a history entry
   for that date, and the gap closes on its own. The data model is already
   right for it.

So v1 ships as a record, and "archive days become playable" is the natural
follow-up that upgrades it into a true collection. Recorded as a follow-up
rather than pretended away.

## 3. Sharing

Out of scope for v1. The obvious share — "I've identified 17 of 22" — is a
weaker hook than the daily score because it carries no puzzle and no
curiosity. Worth revisiting once the journal is large enough that the number
is impressive.

## Out of scope

- **Badges, levels, or rarity tiers.** Ornament before the core mechanic is
  proven.
- **A separate journal page.** The archive becomes the journal.
- **Any change to `whichanimaltoday_state` or `SCHEMA_VERSION`.** The journal
  is a *read* over existing data. `loadState` maps an unrecognised version to
  an empty history, so a write here could erase the very record the feature
  displays.
- **Sound.** Covered separately.

## Open questions

- **Where the entry point lives.** The reveal card already carries an archive
  link and will carry a timer-mode link; three calls to action on one card is
  crowded. The header icon bar may be the better home for the journal, since
  it is a returning-player destination rather than a just-finished-today one.
- **What a player with no history sees.** A journal of twenty greyed-out
  animals on day one is a discouraging first impression. Options: show only
  days since their first play, or lead with an explicit "start collecting"
  framing. Needs deciding before implementation, not during.
