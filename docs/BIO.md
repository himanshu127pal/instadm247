# Link in bio

Owner-requested redesign (Beacons.ai as the reference): templates, a design
editor and a live preview. Public page `/l/[slug]`, list `/dashboard/bio`,
new page `/dashboard/bio/new`, editor `/dashboard/bio/[id]`.

## Pages and screens

- **List**: a thumbnail of each page (the real renderer, scaled, in `still`
  mode so it has no links inside the link around it), stats, Open / Design /
  Edit. Editing never happens here: the old inline form kept one page's
  details while "New page" was pressed, and said the link was taken.
- **New page**: only for accounts without a page (otherwise it offers "Add a
  tab"). Pick a starter template (`BIO_STARTERS`), name, link, account.
  The name and link start from the account's username; the server works out
  a free link per account (`suggestSlug`: the name, then -2, -3…), so the
  form never opens on a link that's taken.
  Creates a **draft** (its links are placeholders) and opens the editor.
- **Editor**: tabs **Blocks**, **Design**, **Settings**, and a phone preview
  rendered by the same `BioPageView` the public page uses. One draft, one
  Save; undo/redo over the whole draft; a warning before leaving unsaved.
  Blocks carry a client `key` so ids the server assigns on save are mapped
  into every undo step, and a later save updates (keeps taps) rather than
  recreates.

## One link per account

Owner's call, so nobody can claim a pile of rare links. Code:
`src/lib/bio-pages.ts` (`saveBioPage`), `src/lib/bio-slug.ts`.

- `BioPage.accountId` is unique and required for new pages, and must be the
  workspace's own account. A workspace therefore has at most as many links
  as connected accounts, which its plan already caps. Same on every plan.
- More pages go inside, as **tabs** (`BioTab`, up to 50, 50 blocks each), at
  `/l/<slug>/<tab>`. Header, social icons and design are shared; blocks have
  a `tabId` (null = the first tab). A hidden or missing tab redirects to the
  page.
- Changing a page's link keeps the old one redirecting, and reserved, for 90
  days (`BioRedirect`, reason `renamed`). Only the latest is kept, so
  renaming in a loop can't hold addresses. The page can take its old link
  back. Redirects are temporary (307) so no browser remembers them once the
  address is free.
- A page whose account is removed keeps working; the next account connected
  to that workspace adopts it (`adoptOrphanBioPage`), so remove-and-reconnect
  can't mint a second link.
- Saving only ever updates blocks and tabs that belong to the page being
  saved (an id from elsewhere is treated as new).

The `bio_tabs` migration brought existing data into line: pages with no
account took one of the workspace's free accounts; then each account's
oldest page stayed and the rest became its tabs, keeping their blocks (and
taps), their views, and their old link as a 90-day redirect (reason
`merged`) to the tab. Social icons on a merged page became ordinary buttons,
since icons only show on the first tab. A workspace with no account kept its
pages as they were.

## Design model (`src/lib/bio-design.ts`)

`BioPage.theme` is the preset a page started from; `BioPage.design` (JSON)
holds the full design. `resolveDesign(theme, design)` = preset, with each
saved field that still validates on top: a page from before designs has no
`design` and renders as its preset, which reproduces the old five themes
exactly (e2e checks the colours). One bad field drops alone.

Everything that reaches a style attribute is validated: `#rrggbb` colours,
fonts from `BIO_FONTS`, numbers in range, images `https://` only and escaped
inside `url()`.

Fonts are self-hosted in `public/fonts/bio/` (OFL, latin subset) and declared
in `src/components/bio/bio-fonts.css`: no visitor is sent to Google, and a
browser downloads only the fonts a page uses. Social glyphs are from Simple
Icons (CC0), `src/components/bio/social-icons.ts`; LinkedIn isn't there, so
it's drawn.

## Links

`blockHref()` is the only way a block becomes an `href`: http(s), `mailto:`
or `wa.me`, never `javascript:` or `data:`. Saving refuses a link it can't
make safe (naming the block); rendering a stored one that slipped through
earlier shows it as plain text.

## Deliberately not copied from Beacons

Video backgrounds, pop-ups, a newsletter/subscribe form and "add to
contacts". Each needs storage or a product decision we haven't made; the
newsletter in particular would collect emails we'd then have to handle.
