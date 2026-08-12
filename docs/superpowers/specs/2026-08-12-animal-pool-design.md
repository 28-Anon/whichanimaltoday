# The Animal Pool — Design

**Date:** 2026-08-12
**Status:** Approved, not implemented.

## Context

Two complaints, one root cause. The owner played Beat the Clock and met animals
they had never heard of, and separately wants more everyday animals in the game.

The first is a straightforward gap. `framer/TimerModeComponent.tsx` draws its
questions from the whole of `data/animals.json` and filters nothing, so the
eleven animals carrying `dailyEligible: false` — Chowsingha, Ibisbill, Saola,
Great Argus, Helmeted Hornbill, Horned Screamer, Boat-billed Heron, Mongolian
Saiga, Bald Uacari, Hoatzin, Spoon-billed Sandpiper — are answers there. The
2026-08-05 rebalance barred them from the daily puzzle because no clue makes a
player *type* "Chowsingha", and kept them in timer mode on the reasoning that a
four-option question carries the identification. Played rather than reasoned
about, that trade reads differently: the names are still unfamiliar, and the
run is worse for them.

The second is a content matter, not a scoring one. The rebalance already
established that `scripts/scoreCandidates.ts` cannot supply everyday animals and
should not be asked to — searching all 1,632 discovered candidates finds no
giraffe, shark, chicken or panda, and the apparent hits for cow and horse are
wild species with those words in their names. Phase 2's everyday animals were
hand-curated for exactly that reason. Phase 3 is more of the same work, and the
rubric is not in the way.

The first full `content:audit` run also completed on 2026-08-12 and flagged 17 of
89 images. Nine are on daily-eligible animals and ride along with this work.

## Decisions

### 1. The eleven are retired to `data/retired.json`

They leave `data/animals.json` entirely. Both game surfaces read that file, so
they vanish from Beat the Clock and the daily rotation with **no component code
change and no Framer paste** — this ships by pushing the repo, like the image
resize did.

The records keep their hints, fun facts, bonus rounds, images and tiers in the
new file, so nothing sourced is thrown away and the decision reverses by moving
records back.

**Why not filter in the component.** Two alternatives were considered and
rejected: filtering `TimerModeComponent` on `dailyEligible`, and introducing an
`inPlay` field filtered in both components. Both preserve the distinction
"in the timer but not the daily puzzle" — which is precisely the distinction
this decision removes. Keeping the machinery would mean maintaining a concept
the product no longer has *and* paying a Framer paste for it. Retirement is also
the only option that cannot silently diverge from the live site, because no
component code is involved.

**The move is safe against the calendar.** The eleven sit at positions 78–88,
the tail of the array. Everything at 0–77 is untouched, so the frozen played
prefix and every scheduled day up to 18 October are unaffected, and no entry in
`data/archive.json` references any of them.

**`dailyEligible` survives as a field.** `scripts/orderAnimals.ts` guards on it
and `scripts/animalsCurve.test.ts` reads it. After this it simply has no `false`
values in `animals.json`; `retired.json` is where `false` lives. That keeps the
ability to bench an animal without deleting it, which is what a future hard mode
would want back.

### 2. Beat the Clock's pool becomes the daily pool

One rule instead of two: 78 animals, both surfaces. Category counts after
retirement are mammal 25, bird 16, marine 11, insect 7, reptile 7, amphibian 6,
fish 6 — every category still fills a four-option question, with the thinnest at
six.

That floor is currently unasserted. `buildQuestion` draws three same-category
decoys and cannot form a question from fewer than four animals, so a test claims
**at least 4 animals per category**. The margin is comfortable today; the test
exists so a future retirement cannot quietly break question generation.

### 3. The suggester learns iNaturalist, and phase 3 waits for it

Phase 2 sourced 31 animals by looking at roughly 200 photographs by hand. That
cost was not inherent — it was a tooling gap. `scripts/suggestImages.ts` already
searches, cheaply filters and vision-judges up to 8 candidates against the same
prompt the audit uses, and `scripts/pipeline/reviewSheet.ts` already renders
candidates inline for human review. **But there is no iNaturalist client
anywhere in the tooling**, so the automated path can only search Wikimedia
Commons — the source phase 2 found to be worse. The better source was manual
because the tool could not reach it.

Three changes, all inside the existing pipeline:

- **`scripts/pipeline/inaturalistClient.ts`**, mirroring `commonsClient.ts`.
  Searches observations by taxon name with `quality_grade=research`, which is
  the community-verified species ID that would have caught a roller coaster
  filed as a dragonfly. **The licence gate already exists** —
  `isAllowedLicence` in `scripts/pipeline/gates.ts` fails closed on an
  unrecognised string and rejects NC and ND explicitly, for these reasons: the
  site carries advertising, and the pipeline resizes every image it mirrors. The
  new client reuses it rather than writing a second filter; what it must add is
  **normalising iNaturalist's licence codes into the form that gate and the
  credits page both expect** (`cc-by-sa` → `CC BY-SA 4.0`), because the raw code
  fails `isAllowedLicence` on its hyphens and would silently reject every usable
  photo.
- **Display-size judging is already in place** — an earlier draft of this
  section claimed otherwise and was wrong. `suggestImages` calls
  `judgeForPuzzle`, which runs the content pass and then the legibility pass on
  a copy scaled to the game's 330x248 box, so a candidate is already judged at
  the size it will be played at. Nothing to build; recorded so nobody plans it
  twice.
- **A contact sheet.** Output is an HTML file in `.cache/` showing the top 3
  survivors per animal side by side **at display size**, with author, licence
  and the judge's verdict under each, and the full-resolution image a click
  away. Review happens at the size players get; the full size is for confirming
  detail, not for forming the judgement.

**Ranking stays with the vision judge, not with the source.** Phase 2 found that
ordering iNaturalist by votes selects for drama — a herd at a waterhole, an owl
with two owlets, a horse with an egret standing on it — and Commons by file size
selects for landscapes where the animal is a speck. Votes may order the fetch
queue; only the judge decides what reaches the contact sheet.

**Nothing auto-applies.** That property is unchanged and is the reason the
existing suggester is safe to trust: a cartoon blobfish was once replaced with a
painted one because a substitution happened without anybody looking.

**No general web crawling.** Every photograph needs an attributable CC or
public-domain licence — that is what `/credits` exists for — and scraping
image-search results breaches their terms and would put unlicensed images into a
monetised product. Licensed APIs that return author and licence as structured
data are the only sources in scope.

Phase 3 depends on this. Sourcing 43 animals through the old path costs the
owner hours of review; through the new one it should cost roughly 43
confirmations, at about a penny per animal in API calls.

### 4. Phase 3 adds 34 everyday animals

Hand-curated, sourced from iNaturalist, weighted toward the thin categories for
the same reason phase 2 was — timer mode draws decoys from within a category.

| Category | +N | Animals |
|---|---|---|
| mammal | 10 | raccoon, otter, hedgehog, moose, hippopotamus, sheep, goat, lion★, giant panda★, gorilla★ |
| bird | 7 | flamingo, peacock, ostrich, pigeon, goose, chicken, penguin★ |
| marine | 4 | octopus, jellyfish, walrus, manatee |
| reptile | 4 | iguana, gecko, rattlesnake, alligator |
| fish | 4 | clownfish, pufferfish, ~~eel~~ **moray eel**, ~~piranha~~ **lionfish** |
| amphibian | 3 | newt, fire salamander, bullfrog |
| insect | 2 | monarch butterfly, cricket |

★ marks the four A-listers. The bulk of the list sits one notch below fame —
recognisable, but the photograph still does some work. The A-listers are
included deliberately and tiered `easy`: everyone names them, which protects
streaks, and four of thirty-four means they are not every day. Going further
would trade away the thing that makes a result worth sharing.

Pool: 78 → 112 eligible. Repeats move from 18 October to roughly 21 November.

Tiers are assigned by hand on nameability, per the rebalance's definition. The
list is a starting point and may be amended during sourcing — an animal whose
photographs all fail is better swapped than forced.

**Amended 2026-08-12, on evidence.** The fish batch was sourced first and
returned one usable image from four animals. Eel and piranha are the reason: a
European eel is photographed dead on a lawn or in a net, and a piranha in an
aquarium — the single survivor for each failed review on exactly that, and the
piranha candidate also carried no photographer name, which CC BY-SA requires.
**Moray eel and lionfish replace them**, both reef species that divers
photograph alive and in the open constantly. Same call phase 2 made when it
dropped goldfish, whose every observation was an invasive-species capture, and
swapped honey bee for bumblebee.

**Sourcing order matters, and fish is the wrong place to start.** Mammals and
birds photograph well in the wild. Taking the hardest category first made the
tooling look worse than it is.

### 5. Livestock is sourced under the existing rule, with a documented contingency

Sheep, goat and chicken are sourced under the rule exactly as it stands. **No
rule change is made now.**

An earlier draft of this section proposed a livestock clause permitting
"incidental agricultural context". It was wrong twice over, and both mistakes
are worth recording because they are easy to repeat.

**It contradicted the reason the rule is absolute.** The comment above
`buildPrompt` in `scripts/pipeline/imageJudge.ts` states it plainly: "no
man-made object" is deliberately absolute *because the alternative is a
judgement about how much clutter is acceptable, and that is not something a
model applies consistently across 58 images*. "Incidental" is a dial, not a
line. The rule is strict not because clutter is ugly but because a bright line
is the only kind a model applies the same way twice.

**The evidence did not support it.** The claim was that farm animals collide
with the rule, generalised from the cow being flagged for a metal stake. The
animals already in the set say otherwise:

| Animal | Source | 2026-08-12 audit |
|---|---|---|
| Horse | iNaturalist, CC0 | passed |
| Pig | Wikimedia Commons | passed |
| Rabbit | iNaturalist, CC BY | passed |
| Duck | iNaturalist, CC BY | passed |
| Cow | iNaturalist, CC BY | failed — metal stake in the grass |

Four of five found compliant photographs. The cow needs a better picture, not a
weaker rule.

**The contingency, if it turns out to be needed.** Trigger: a full search
through the new iNaturalist path returns no compliant candidate for sheep, goat
or chicken. Then, and only then, the rule gains a **second enumerated list, not
a softening** — for records carrying `domesticated: true`, `fence` and `railing`
leave the FAIL list and `ear tag` and `gate post` join the allowed set. Nothing
else moves. Buildings, vehicles, machinery, hands, people, cages, indoor pens,
troughs and watermarks all still fail, as does everything in the rest of the
rule.

Two properties make that version safe where the first draft was not: it stays a
list rather than a judgement, and the flag lives on the record so the model
never guesses which animals are farm animals — a wild species is judged exactly
as strictly as today, and the flagged records are greppable and testable.
`domesticated` would join `UNREPRESENTABLE_FIELDS` in
`scripts/animalsFileGuard.ts`, since the CSV round-trip cannot carry it.

`ACCEPTED_EXCEPTIONS` in `scripts/auditImages.ts` remains the wrong mechanism
for this: it is keyed by image URL so an exception cannot outlive the picture it
was granted for, which is right for a one-off like the dodo and wrong for a
standing category rule.

### 6. The nine flagged daily images are replaced in the same pass

Ladybug, stingray, whale, shark, cow, rhinoceros, bat, komodo dragon, axolotl.
The sourcing tooling is already being run for phase 3, and a separate pass later
costs a second round of the same work.

Each replacement is written to a **new filename**, never overwriting, so no
jsDelivr purge is involved — the measured consequence of overwriting is on
record in `docs/follow-ups.md`. `npm run images:display` then regenerates the
display copies.

Two of the nine deserve naming. **Ladybug is a possible data error, not just a
photo problem**: the audit says the beetle has the wrong markings for a
seven-spot, so the record's name and species may not match the picture — check
which is wrong before replacing. **Axolotl may have no compliant photograph at
all**; wild axolotls number a few hundred in Xochimilco's canals and effectively
every image is captive. If the search comes back empty, the choice at review is
exception or drop, and it is deliberately not being pre-decided here.

## Components

Tooling, built first:

- `scripts/pipeline/inaturalistClient.ts` — new; search and licence filtering,
  shaped like `commonsClient.ts`.
- `scripts/pipeline/inaturalistQuery.ts` — new; the pure query-building,
  response-mapping and licence-normalising layer, which is where the tests go.
  The network client itself stays untested, matching `commonsClient.ts` and
  `wikidataClient.ts`.
- `scripts/suggestImages.ts` — gains the second source and the contact sheet.
  Its judging is unchanged.
- `scripts/pipeline/contactSheet.ts` — new; renders the HTML review sheet.

Content, built second:

- `data/retired.json` — new file, same record shape as `data/animals.json`.
- `data/animals.json` — eleven records removed, 34 added, reordered by
  `npm run content:order`.
- `scripts/retiredAnimals.test.ts` — new; the round-trip guard below.
- `scripts/animalsCategories.test.ts` — extended with the per-category floor.
- `docs/legal/credits.md` — regenerates from `animals.json`, so retired photos
  drop out and the 34 new ones appear.
- Images: nine replacements plus 34 new, each with a display derivative.

No component in `framer/` changes, and no Framer paste is required.

**The two halves are independently shippable.** Retirement needs no tooling and
can land first — it is a data move that improves Beat the Clock immediately.
The tooling needs no content decision. Only phase 3 and the nine replacements
depend on both.

## Testing

Existing guards already cover most of the risk and must keep passing: the 70%
easy-or-medium floor in `animalsCurve.test.ts`, canonical categories, the
unrepresentable-fields guard in `animalsFileGuard.ts`, `npm run
validate:animals`, and `npm run check:credits`.

Four new assertions:

- **Per-category floor.** Every category in `animals.json` holds at least 4
  animals, because `buildQuestion` cannot form a four-option question below
  that.
- **Retirement round-trip.** No `commonName` appears in both `animals.json` and
  `retired.json`, and every retired record passes `validateAnimalData` — so a
  retired animal can be restored without repair.
- **Licence filtering.** The iNaturalist query layer admits CC0, CC BY and
  CC BY-SA and rejects NonCommercial and NoDerivs. This is the assertion that
  protects the ad-supported model, so it is tested against the licence strings
  the API actually returns rather than against a tidied enum.
- **No non-commercial licence reaches the data file.** A guard over
  `animals.json` asserting no `imageAttribution` contains NC or ND, so a
  hand-added record cannot bypass the client's filter. Passes today across all
  89 records.

Verifying the judge is the part worth being careful about. The audit harness has
already produced two hollow tests on this project — a midnight test that passed
against unfixed code, and focus-trap tests that passed with the trap deleted —
so the contact sheet must be checked by **running it against an animal whose
current photo is known to fail** (stingray, whose watermark the audit already
caught) and confirming the watermarked image does not appear among the
survivors.

Manual verification, once the data is pushed: play Beat the Clock and confirm
none of the eleven appear as an answer or a decoy, and confirm the daily puzzle
is unchanged for today.

## Out of scope

- **The "another animal in frame" audit rule.** It wrongly failed a saiga mother
  with her calf and should ask whether the animal is unambiguous rather than
  counting bodies. Deferred by the owner; recorded in `docs/follow-ups.md`.
- **A standing axolotl exception.** Decided at review of its replacement search,
  not in advance.
- **The animal catalogue page** (`2026-08-06-animal-catalogue-design.md`) and
  **the per-day puzzle payload** (`2026-07-30-per-day-puzzle-payload-design.md`).

## Consequences worth stating

- **Beat the Clock loses eleven animals of variety.** That is the intent, but it
  is a real reduction in a mode whose appeal is breadth.
- **`animals.json` grows past 128 KB.** Retirement removes roughly 12 KB and 34
  animals add roughly 40 KB, against 105 KB today. The per-day payload spec set
  its trigger at ~100 KB and that trigger has already fired; this makes its case
  louder rather than quieter. Nothing here is blocked by it.
- **The eleven stop being audited.** They leave `animals.json`, which is what
  `content:audit` reads, so eight of the seventeen outstanding image flags
  simply stop being reported. That is legitimate — an unused photo needs no
  quality bar — but it means the flag count improves for a reason unrelated to
  image quality, and nobody should read it as progress.
- **Phase 3 is delayed by the tooling build.** That is the trade being made: a
  sitting's worth of code against hours of image review, on a tool that pays
  again on every future batch. If the contact sheets turn out to be poor, the
  fallback is phase 2's manual method, so the downside is the build time rather
  than the content.
- **The old cost, for comparison.** Phase 2 measured roughly six candidate
  photographs reviewed per animal, with the first pick failing for 20 of 31 —
  around 200 pictures for 31 animals. The target for phase 3 is 43
  confirmations.
- **A judge that selects is a judge that can silently exclude.** Post-hoc the
  audit only ever flagged an image already in use; as a selector the same prompt
  now decides what is never seen. The deferred "another animal in frame" rule is
  the known-blunt one — it failed a saiga mother with her calf — so expect it to
  quietly discard good candidates during phase 3. Worth revisiting the moment a
  contact sheet looks thin for an animal that plainly has good photographs.
