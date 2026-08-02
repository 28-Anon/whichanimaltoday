# Sharing — Design

**Date:** 2026-08-02
**Status:** Approved, not implemented.

## Context

Sharing is the only free acquisition channel this game has. Every revenue
figure depends on the player count growing, and nothing else on any plan
touches it — timer mode and the field journal both deepen sessions for people
who already play.

Three things were checked before designing anything:

- **Open Graph tags are already live.** `og:title`, `og:description`,
  `og:image` and `twitter:card = summary_large_image` are all set, so a pasted
  link renders a proper preview card. `docs/follow-ups.md` claims otherwise;
  that entry is stale and should be deleted.
- **The share text works** — `WhichAnimalToday #34 🐾 2/3 ⭐` plus the URL.
- **The mechanism is a copy button.** On a phone that is copy, switch app,
  paste, send.

So the landing end is fine. The losses are at the moment of sharing and in
what the share says.

## Decision

### The share carries a curiosity hook, taken from hint1

```
WhichAnimalToday #34 🐾 2/3 ⭐

"I can identify and eat prey faster than the human eye can follow."

https://whichanimaltoday.com
```

The score line is unchanged, so anyone who recognises the Wordle-style format
reads it instantly.

**Why a hook at all.** This game's differentiator is that the animals are
unbelievable. A bare score throws that away: it proves something to people who
already play and means nothing to anyone else. `2/3 ⭐` gives a stranger no
reason to click.

**Why hint1 specifically.** It is already the hardest, most oblique clue,
written to intrigue without giving the answer away — which is exactly the
requirement. It needs no new authoring, works for all 58 animals immediately,
and every animal the content pipeline produces gets one for free. A dedicated
`teaser` field would mean 58 hand-written lines, a schema change and a prompt
change, for a gain over hint1 that is unproven.

**The accepted cost:** a recipient who goes on to play has effectively spent
their hardest clue before starting. That is real, and it is the right trade —
they would have received it after their first wrong guess anyway, and a share
nobody acts on costs more than a slightly easier puzzle.

### One tap on mobile

`navigator.share()` opens the native share sheet directly. Clipboard remains
the fallback for desktop and any browser without the API, keeping the existing
"Copied!" confirmation for that path.

Most traffic will be mobile, so this is likely the largest practical gain in
the whole design — it removes three steps from the only action that grows the
audience.

### The prompt

`Copy result` is a button, not an invitation. It becomes `Share your result →`
with a line beneath explaining what the recipient sees — today's specimen, not
the answer. That line exists to remove the hesitation of "will this spoil it
for them".

### Alternatives considered

- **Keep it a pure score, Wordle-style.** Safest and spoiler-proof, and the
  format people recognise. Rejected: it only works on people who already play.
- **Share the photograph.** Maximum curiosity — the picture is the hook — but
  it spoils the puzzle outright for the recipient, which makes it useless for
  a daily ritual and irritating to receive.
- **A dedicated teaser field per animal.** Punchier than a clue written for a
  different job, at the cost of authoring every one by hand.
- **The fun fact as the hook.** The most surprising content available, but it
  is written for after the reveal and names the animal freely.

## 1. Where the code goes

- **`src/shareCard.ts`** — `buildShareText` gains an optional trailing
  `teaser` parameter. Pure, unit-tested, and it rides the existing codegen
  into the component. Every current call site stays valid, and omitting the
  teaser produces today's exact string byte for byte.
- **The component's hand-written half** — the `navigator.share` wiring, the
  same split that already applies to `browserStorage`.

`navigator.share` must be called inside a user gesture and rejects when the
user dismisses the sheet. A dismissal is not an error and must not surface as
one; fall through to the clipboard path only when the API is absent, not when
a share is cancelled.

## 2. Out of scope

- **Share-count tracking.** Needs a backend this product does not have.
- **Per-platform buttons** — WhatsApp, X, Facebook. The native sheet does this
  better on mobile and clutters the reveal on desktop.
- **Any change to the archive or field journal share.** The daily result is
  the only thing worth sharing today.
- **Referral mechanics or rewards.** A separate product decision, and one that
  collides with the streak being the retention mechanic.

## Open questions

- **Whether the quote should be truncated.** Some hint1 values run long, and a
  three-line share is already at the limit of what people paste into a chat.
  A cap of roughly 120 characters with an ellipsis is probably right, but it
  should be judged against the real 58 rather than guessed at.
- **Whether the teaser belongs on a loss.** A player who failed still shares
  `X/3`, and the hook arguably works harder there — "I could not get this"
  invites a friend to try. No reason yet to treat the two differently, so this
  design does not.
