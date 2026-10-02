# Trust: our standing with Meta

InstaDM247 is an approved **Meta Tech Provider** and the app is live (owner
confirmed, 2026-10-02). Owner-requested: show that everywhere it helps a
creator trust us, and explain what it means for them. Code: `src/lib/trust.ts`,
`src/components/marketing/meta-badge.tsx`, `/meta-tech-provider`.

## Where it shows

- Site header, always visible on every screen size, next to the logo.
- Footer, with "Not affiliated with or endorsed by Meta".
- Resources menu (Product help), footer Resources column.
- Homepage hero pill and the "Do I need my own Meta app?" answer.
- The Account safety feature page (a banner above its questions).
- Signup page, under the heading.
- Dashboard: Instagram accounts (above Connect) and the Safety Center.
- The AI Helper's guide (Safety Center section).

## What we never say

Meta's logo (its brand rules don't allow it as a third-party badge), or that we
are a Meta **partner**, **certified**, or **endorsed** by Meta. None of those
are true. Every claim on `/meta-tech-provider` must stay true (CLAUDE.md rule
13); when what we do changes, change the page in the same PR. If our Tech
Provider standing ever lapses, the label lives in one place: `TRUST_LABEL`.
