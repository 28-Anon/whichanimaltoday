# Go-Live Checklist

Everything below needs to be true before WhichAnimalToday is publicly
launched and monetized. Items are grouped by what's already done vs.
what's still an action for whoever has the live Framer/GitHub/AdSense
accounts (this repo's automation can't do these steps itself).

## Content

- [ ] Animal list reaches a size you're comfortable launching with (34
      curated as of this checklist; see
      `docs/superpowers/plans/2026-07-27-archive-feature.md` and ongoing
      batches for how this is being built out).
- [ ] `npx tsx scripts/generateCreditsPage.ts` re-run after the final
      pre-launch batch of animals, so `docs/legal/credits.md` reflects
      the full list.

## Site build

- [ ] Framer homepage, Archive, How to Play pages built per the earlier
      prompts.
- [ ] Game engine code pasted into a Framer code component per
      `docs/framer-integration.md`, including the `imageAttribution`
      credit line on the reveal card (legally required, not optional).
- [ ] Archive list + detail pages wired per
      `docs/framer-archive-integration.md`, including the attribution
      line on detail pages.
- [ ] Privacy Policy, Terms of Service, and Credits pages published as
      real Framer pages using the content in `docs/legal/` (fill in the
      "[fill in ...]" placeholders — publish date and a contact email —
      before publishing).
- [ ] Open Graph tags set (title, description, image) so shared result
      links show a proper social preview card.

## Infrastructure

- [x] This repo pushed to a **public** GitHub repository (confirmed safe
      by the 2026-07-29 security audit — no secrets in history). Live at
      `github.com/28-Anon/whichanimaltoday`; `data/animals.json` verified
      publicly reachable over HTTPS, which the game depends on.
- [x] Daily Archive GitHub Actions workflow confirmed working — triggered
      manually via `workflow_dispatch` on 2026-07-30, succeeded, and
      correctly logged `2026-07-29 is before LAUNCH_DATE (2026-08-01);
      nothing to archive yet.` Needs zero secrets. Its first real run is
      2026-08-02, archiving launch day.
- [x] Real `LAUNCH_DATE` **confirmed as 2026-08-01** (owner decision,
      2026-07-30) — no longer a development placeholder. Set identically
      in `scripts/runDailyArchive.ts:9` and `framer/GameComponent.tsx:27`;
      verified byte-identical. Puzzle #1 is 2026-08-01. **Any change to
      this date must be made in both files.**
- [x] CI workflow green on `master` (added 2026-07-30; runs the 128 unit
      tests, the typechecker, and the Framer codegen staleness check on
      every push and pull request).

## AdSense

- [ ] AdSense account created and site submitted for approval (needs
      the privacy policy and a reasonable amount of content live first —
      AdSense reviews for "sufficient original content" and a complete,
      navigable site).
- [ ] **AdSense "Privacy & messaging" (Funding Choices) enabled and
      configured** for EEA/UK consent. This is Google's own built-in
      cookie-consent banner for AdSense — it handles the GDPR consent
      requirement automatically once turned on in the AdSense dashboard.
      No custom banner code needed; this is purely an AdSense account
      setting to enable, not something built in this repo.
- [ ] Ad placement matches the spacing guidance from the original
      mockup review (ad blocks kept clearly separated from each other
      and from game content, not stacked close together).

## Domain (optional timing, your call)

- [ ] Domain purchased and connected to Framer, if not launching on the
      free `*.framer.website` subdomain first.

## Final check

- [ ] Full manual verification checklists from both
      `docs/framer-integration.md` and `docs/framer-archive-integration.md`
      run once, end to end, on the real live site (not just locally).
