# Support tickets and feature requests

Owner-requested (FEATURES §B3). Customers write from the dashboard; platform
staff answer from `/admin`. Code: `src/lib/support.ts`.

## Support tickets

- **Customer:** `/dashboard/support` (list, new ticket) and `/dashboard/support/[id]`
  (thread, reply, close, reopen). A ticket has a subject, an area and messages.
- **Staff:** `/admin/support` (waiting-on-us first, oldest first) and
  `/admin/support/[id]` (thread, reply, status). A staff reply is audited
  (`support.reply`).
- **Status:** `open` (waiting on us) after any customer message; `answered`
  (waiting on them) after a staff reply; `closed` by either side. A customer
  reply on a closed ticket reopens it.

## Feature requests

- **Customer:** `/dashboard/requests`: title (100), area, problem, optional
  good outcome; their past requests with our status and note.
- **Staff:** `/admin/requests`: status (Received, Planned, In progress, Shipped,
  Not planned) and a note the customer sees.

## Who is emailed

| Event | To | Template |
|---|---|---|
| New ticket, or a customer reply | Admins and support staff (`PLATFORM_ADMIN_EMAILS`, `PLATFORM_SUPPORT_EMAILS`) | `support_ticket_staff` |
| Staff reply | The ticket's author (else the workspace owner) | `support_reply` |
| New feature request | Admins (`PLATFORM_ADMIN_EMAILS`) | `feature_request_staff` |
| Request status or note changes | The request's author (else the owner) | `feature_request_update` |

Each email has a dedupe key, and an email failing never fails the action
(docs/EMAIL.md). The ticket or request is the record; the email is a nudge.

## Limits and safety

- 10 tickets and 10 requests per workspace per day, so a stuck form or a bad
  actor can't flood our inbox.
- A support session (impersonation) can read tickets but can't open one,
  reply as the customer, or file a request: those must come from the customer.
- Customer text in emails is escaped by the template renderer, like every
  other email.
