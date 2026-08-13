import { assertProductionSecrets } from "@/lib/env";

/**
 * Next.js calls this once when a server instance boots.
 *
 * The worker has always asserted its secrets at startup; the web server did
 * not, which meant a production deploy that forgot `SESSION_SECRET` /
 * `ENCRYPTION_KEY` would come up quietly on the development defaults — forgeable
 * session cookies, and Instagram tokens encrypted with a key that is committed
 * to this repository. Failing to start is the right response.
 *
 * `next build` also runs this hook while prerendering, and a build machine has
 * no reason to hold production secrets, so the build phase is exempt.
 */
export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    assertProductionSecrets();
  } catch (error) {
    // Throwing leaves Next with a process that is up but serving nothing, which
    // reads as "running" to systemd. Exit instead, so the unit goes red and the
    // reason is the last line in the journal.
    console.error(`\n${(error as Error).message}\n`);
    process.exit(1);
  }
}
