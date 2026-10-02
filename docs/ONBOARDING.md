# Onboarding

Owner-requested (FEATURES §B3 #5). Code: `src/lib/onboarding.ts`,
`src/components/dashboard/onboarding.tsx`.

## Getting started checklist

A bar under the dashboard header with progress and the next step. Each step is
read from what the workspace has actually done, never ticked by hand:

1. **Confirm your email**: only when email sending is set up (otherwise there's
   nothing to confirm with). The next-step button resends the email.
2. **Connect Instagram**: an Instagram account is connected.
3. **Create an automation**: one exists.
4. **Switch it on**: one is enabled.
5. **Your first automated DM**: an automation has sent a DM.

It disappears when every step is done, or when the person hides it (×), which
is stored on the user (`checklistDismissedAt`). Clicking the title shows all
the steps and "Take the tour again".

## First-run tour

A spotlight on each place in the sidebar with a card saying what it's for:
Automations, My content, Inbox, Contacts, Analytics, Ask AI, Help, then the
checklist. Steps whose place isn't on screen show as a centred card.

- Starts on its own once, on a wide screen, for people who signed up in the last
  14 days and haven't finished or skipped it (`tourCompletedAt`).
- **Help → Take the tour** starts it again from any page.
- Arrow keys move through it; Escape skips.

A support (impersonation) session sees neither, and can't change either
setting for the customer.
