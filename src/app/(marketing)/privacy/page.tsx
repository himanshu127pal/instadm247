import type { Metadata } from "next";
import { LegalPage } from "../legal/content";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="September 2026">
      <p>
        This policy explains what InstaDM247 collects when you connect an Instagram
        professional account, why we collect it, and how you get rid of it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account details:</strong> the email address and name you sign up
          with, and a hashed password. We never store your password in readable form.
        </li>
        <li>
          <strong>Instagram account data:</strong> when you connect through Meta&rsquo;s
          login screen, we receive an access token plus your username, profile picture,
          follower count and recent media. Tokens are encrypted at rest.
        </li>
        <li>
          <strong>Conversation data:</strong> the comments, story replies, mentions and
          direct messages that trigger your automations, along with the messages we send
          on your behalf and the Instagram-scoped IDs of the people involved.
        </li>
        <li>
          <strong>Contact records:</strong> tags, custom fields and any answers people
          give to forms you build. You control what is asked for.
        </li>
        <li>
          <strong>Usage data:</strong> timestamps, delivery outcomes and error details,
          used to show your analytics and diagnose failures.
        </li>
      </ul>

      <h2>What we never do</h2>
      <ul>
        <li>We never ask for or store your Instagram password.</li>
        <li>We never sell or rent your data, or the data of people who message you.</li>
        <li>
          We never use conversation content to train a general-purpose model. When you
          enable the AI agent, messages are sent to the model provider solely to generate
          that specific reply.
        </li>
        <li>
          When you ask the in-dashboard AI Helper a question, your question and the parts of
          your account setup it needs to answer (such as your automations&rsquo; names and
          settings, your plan and usage) are sent to the same AI model provider to write the
          answer. It never sees your followers&rsquo; messages or usernames, and it can&rsquo;t
          change anything in your account.
        </li>
        <li>We never access endpoints beyond the permissions you granted.</li>
      </ul>

      <h2>Why we can keep this data</h2>
      <p>
        We process it to deliver the service you asked for: reading the events that start
        your automations, and sending the replies you configured. Where required, our
        legal basis is contract performance, and legitimate interest for security and
        abuse prevention.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Conversation and analytics data stays while your account is active. Raw webhook
        payloads are retained for 30 days for troubleshooting. Records of payments and
        subscriptions are kept for as long as tax and accounting law requires. Delete a connected
        Instagram account and its contacts, conversations, messages and statistics are
        deleted with it.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Disconnect an account in Settings to delete everything associated with it, or
        remove the app from Instagram directly. Meta notifies us and we revoke the token
        automatically. To delete everything, see our{" "}
        <a href="/data-deletion" className="text-[var(--accent)] underline">
          data deletion page
        </a>
        .
      </p>

      <h2>People who message you</h2>
      <p>
        If someone messages a creator using InstaDM247 and wants their data removed, they
        can reply STOP, which suppresses them immediately, or contact us at the address
        below and we will remove their records.
      </p>

      <h2>Sub-processors</h2>
      <p>
        We use Meta Platforms (the Instagram API), our hosting and database provider, and
        (only if the account owner enables the AI agent or asks the AI Helper a question) an
        AI model provider.
      </p>
      <p>
        If you buy a paid plan, your email address, your name (or your workspace&rsquo;s
        name, if you haven&rsquo;t set one) and an internal account ID are shared with Dodo
        Payments, our payment processor and merchant of record, to take payment and issue
        receipts. You enter your card or other payment details on Dodo&rsquo;s own
        checkout; they never reach our servers. Nothing about the people who message you
        is ever shared with Dodo.
      </p>
      <p>
        We send account emails (verifying your address, resetting your password, billing
        notices and alerts about your connected accounts) through Amazon Web Services&rsquo;
        email service, which receives your email address, your name and the content of those
        emails. We keep a record of each email we send (who it went to, its subject and whether
        it was delivered) for troubleshooting. Links that sign you in or reset your password are
        never stored.
      </p>
      <p>
        If you connect Google Sheets, we ask Google only for your email address and for access
        to files our app creates (the <code>drive.file</code> permission). We create one
        spreadsheet in your Google Drive and write the lead-form answers you collect into it:
        the respondent&rsquo;s Instagram username and name, and their answers. We cannot see or
        change anything else in your Drive. We keep an encrypted Google access token so rows can
        be added while you&rsquo;re away; disconnecting in Developers → Integrations deletes it
        and revokes our access, and the spreadsheet stays yours. InstaDM247&rsquo;s use and
        transfer of information received from Google APIs will adhere to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="text-[var(--accent)] underline"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>
      <p>We do not share data with anyone else.</p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <strong>support@instadm247.com</strong>.
      </p>
      <p>
        Data controller: <strong>InstaDM247</strong>, the registered trade name of Rajat
        Pal, a proprietorship registered in India. Registered address: 79, Unnamed Road,
        Near Pablikhas Railway Station, Modi Puram, Meerut, Meerut, Uttar Pradesh, 250110,
        India. GSTIN: 09CVWPP3468C1ZX.
      </p>
    </LegalPage>
  );
}
