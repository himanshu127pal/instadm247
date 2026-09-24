# Integrations

Where captured leads go besides the dashboard. Code: `src/lib/integrations/`.

| Destination | How it connects | What it receives |
|---|---|---|
| Kit, Flodesk | API key pasted in Developers → Integrations (encrypted at rest) | Completed forms **with an email** |
| Google Sheets | Google sign-in (OAuth) | **Every** completed form, one row each |
| Outbound webhooks | URL + signing secret | `lead.captured` and other events |

All of them are best-effort: a destination being down never fails the flow that
captured the lead; the error is shown on the integration instead. All are part
of the paid `integrations` feature, checked when a lead is sent, so a
downgrade pauses them without disconnecting anything.

## Google Sheets

- **Scope:** `openid email https://www.googleapis.com/auth/drive.file`.
  `drive.file` only reaches files the app created, and it is a non-sensitive
  scope, so Google does not require a security assessment for it.
- **What it does:** on connect, creates a spreadsheet "InstaDM247 leads" in the
  customer's Drive. Each lead form gets its own tab, created on first use with a
  header row (`Submitted (UTC)`, `Instagram`, `Name`, then the form's questions).
  Each completed response appends a row, written with `valueInputOption=RAW`
  so an answer is never evaluated as a formula.
- **Tokens:** the refresh token is stored encrypted in `Integration.apiKeyEnc`;
  a fresh access token is fetched for each append. Disconnecting deletes it and
  revokes it at Google. Reconnecting the same Google account keeps the same
  spreadsheet; a different account gets a new one.
- **Failures** land on the integration as a readable message: access revoked or
  expired → "Reconnect"; spreadsheet deleted → "Reconnect to create a new one".
- **OAuth state** is a random value bound to the workspace in an httpOnly
  cookie scoped to `/api/integrations/google`, compared in constant time.
- Support sessions (impersonation) cannot connect a customer's Google account.

### Setting up the Google OAuth client (owner, once)

1. Google Cloud Console → create a project → **APIs & Services → Library** →
   enable **Google Sheets API**.
2. **OAuth consent screen**: External; app name InstaDM247; support email;
   authorised domain `instadm247.com`; home page, privacy policy
   (`/privacy`) and terms (`/terms`) links. Scopes: `openid`, `email`,
   `.../auth/drive.file`. Publish the app ("In production"). Google may still
   ask to verify the app's branding (name, logo, domain) before showing the
   logo; the non-sensitive scopes don't need a security review.
3. **Credentials → Create OAuth client ID → Web application**. Authorised
   redirect URI: `https://<your domain>/api/integrations/google/callback`
   (exactly — scheme, host and path must match `APP_URL`).
4. Put the client ID and secret on the server as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`, restart, and connect a test workspace from
   Developers → Integrations.

The privacy policy already carries the Limited Use statement Google's
API Services User Data Policy requires.
