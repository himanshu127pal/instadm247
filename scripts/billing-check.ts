/**
 * `pnpm billing:check` — checks the Dodo setup in .env against the price list
 * before anyone pays. Read-only; prints no keys or secrets. See
 * src/lib/billing/check.ts and docs/BILLING.md §Switching it on.
 */

import { checkDodoSetup } from "../src/lib/billing/check";

const MARK = { ok: "✓", warn: "!", error: "✗" } as const;

async function main() {
  const findings = await checkDodoSetup();
  for (const f of findings) console.log(`${MARK[f.level]} ${f.message}`);
  const errors = findings.filter((f) => f.level === "error").length;
  const warnings = findings.filter((f) => f.level === "warn").length;
  console.log(
    errors
      ? `\n${errors} problem${errors === 1 ? "" : "s"} to fix before taking payments.`
      : `\nDodo is set up correctly${warnings ? `, with ${warnings} thing${warnings === 1 ? "" : "s"} worth a look` : ""}.`,
  );
  if (errors) process.exitCode = 1;
}

main().catch((error) => {
  console.error("✗ The check itself failed:", (error as Error).message);
  process.exitCode = 1;
});
