import type { Metadata } from "next";
import { LegalPage } from "../legal/content";

export const metadata: Metadata = { title: "Data deletion" };

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <LegalPage title="Deleting your data" updated="August 2026">
      {code && (
        <div className="rounded-2xl border-[2.5px] border-[var(--border)] bg-[var(--color-boom-400)]/30 shadow-[4px_4px_0_0_var(--shadow-ink)] p-5">
          <p className="text-[var(--text)]">
            <strong>Your deletion request has been processed.</strong>
          </p>
          <p className="mt-1.5">
            Confirmation code: <code className="font-mono text-[var(--text)]">{code}</code>
          </p>
          <p className="mt-2 text-[14px]">
            Everything associated with that Instagram account — contacts, conversations,
            messages, automations and statistics — has been removed from our systems.
          </p>
        </div>
      )}

      <h2>Three ways to delete everything</h2>

      <h2>1. From inside the app</h2>
      <p>
        Go to <strong>Settings → Instagram accounts</strong> and disconnect the account.
        This immediately deletes its contacts, conversations, messages, automations and
        analytics, and revokes the stored access token.
      </p>

      <h2>2. From Instagram</h2>
      <p>
        Open Instagram, go to <strong>Settings → Website permissions → Apps and
        websites</strong>, and remove InstaDM247. Meta notifies us automatically and we
        revoke the token and stop all processing for that account.
      </p>

      <h2>3. By asking us</h2>
      <p>
        Email <strong>[your support email]</strong> from the address on your account. We
        respond within 30 days, and usually far sooner.
      </p>

      <h2>If someone messaged a creator using this app</h2>
      <p>
        Reply <strong>STOP</strong> in that conversation and you are suppressed
        immediately — no automation from that account will reach you again. To have your
        stored records deleted as well, email us with the Instagram handle you used and
        the creator&rsquo;s handle.
      </p>

      <h2>What we keep, briefly</h2>
      <p>
        Backups roll off within 30 days. We may retain minimal records where the law
        requires it — for example, financial records of payments.
      </p>
    </LegalPage>
  );
}
