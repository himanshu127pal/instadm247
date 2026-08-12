import type { Metadata } from "next";
import { LegalPage } from "../legal/content";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="August 2026">
      <p>
        This policy explains what InstaDM247 collects when you connect an Instagram
        professional account, why we collect it, and how you get rid of it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account details</strong> — the email address and name you sign up
          with, and a hashed password. We never store your password in readable form.
        </li>
        <li>
          <strong>Instagram account data</strong> — when you connect through Meta&rsquo;s
          login screen, we receive an access token plus your username, profile picture,
          follower count and recent media. Tokens are encrypted at rest.
        </li>
        <li>
          <strong>Conversation data</strong> — the comments, story replies, mentions and
          direct messages that trigger your automations, along with the messages we send
          on your behalf and the Instagram-scoped IDs of the people involved.
        </li>
        <li>
          <strong>Contact records</strong> — tags, custom fields and any answers people
          give to forms you build. You control what is asked for.
        </li>
        <li>
          <strong>Usage data</strong> — timestamps, delivery outcomes and error details,
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
        payloads are retained for 30 days for troubleshooting. Delete a connected
        Instagram account and its contacts, conversations, messages and statistics are
        deleted with it.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Disconnect an account in Settings to delete everything associated with it, or
        remove the app from Instagram directly — Meta notifies us and we revoke the token
        automatically. To delete everything, see our{" "}
        <a href="/data-deletion" className="text-[var(--accent)] underline">
          data deletion page
        </a>
        .
      </p>

      <h2>People who message you</h2>
      <p>
        If someone messages a creator using InstaDM247 and wants their data removed, they
        can reply STOP — which suppresses them immediately — or contact us at the address
        below and we will remove their records.
      </p>

      <h2>Sub-processors</h2>
      <p>
        We use Meta Platforms (the Instagram API), our hosting and database provider, and
        — only if the account owner enables the AI agent — an AI model provider. We do not
        share data with anyone else.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <strong>[your support email]</strong>. Data
        controller: <strong>[your legal entity and address]</strong>.
      </p>
    </LegalPage>
  );
}
