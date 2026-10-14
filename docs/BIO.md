# Link in bio

Owner-requested redesign (Beacons.ai as the reference): templates, a design
editor and a live preview. Public page `/l/[slug]`, list `/dashboard/bio`,
new page `/dashboard/bio/new`, editor `/dashboard/bio/[id]`.

## Pages and screens

- **List**: a thumbnail of each page (the real renderer, scaled, in `still`
  mode so it has no links inside the link around it), stats, Open / Design /
  Edit. Editing never happens here: the old inline form kept one page's
  details while "New page" was pressed, and said the link was taken.
- **New page**: pick a starter template (`BIO_STARTERS`), name, link, account.
  Creates a **draft** (its links are placeholders) and opens the editor.
- **Editor**: tabs **Blocks**, **Design**, **Settings**, and a phone preview
  rendered by the same `BioPageView` the public page uses. One draft, one
  Save; undo/redo over the whole draft; a warning before leaving unsaved.
  Blocks carry a client `key` so ids the server assigns on save are mapped
  into every undo step, and a later save updates (keeps taps) rather than
  recreates.

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
