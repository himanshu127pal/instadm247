/**
 * Email checks, run from e2e-check.ts. See docs/EMAIL.md.
 *
 * Nothing leaves the machine: the SES transport is swapped for one that
 * records what it would have sent, and restored in a `finally`. Everything
 * runs against a throwaway user and workspace.
 */

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/lib/env";
import { registerUser } from "../src/lib/auth";
import { verifyPassword } from "../src/lib/crypto";
import { TEMPLATES, render, type TemplateName, type TemplateParams } from "../src/lib/email/templates";
import {
  EmailSendError,
  deliverEmail,
  sendEmail,
  setEmailTransport,
  type OutgoingEmail,
} from "../src/lib/email/send";
import { requestPasswordReset, resetPassword, sendVerificationEmail, verifyEmail } from "../src/lib/email/tokens";
import {
  notifySubscriptionChange,
  notifySuspension,
  sendBillingReminders,
  type SubscriptionSnapshot,
} from "../src/lib/email/notify";
import { periodKey, reserveUsage } from "../src/lib/billing/usage";
import { markReconnectNeeded } from "../src/lib/meta/account";

type Check = (label: string, condition: boolean, detail?: string) => void;
type Section = (title: string) => void;

type Mutable = { billing: { enabled: boolean } };
const mutableEnv = env as unknown as Mutable;

const SAMPLE: { [K in TemplateName]: TemplateParams[K] } = {
  verify_email: { name: "Alex", url: "https://app.example/verify-email?token=abc" },
  password_reset: { name: "Alex", url: "https://app.example/reset-password?token=abc" },
  password_changed: { name: "Alex", at: "23 September 2026 (UTC)" },
  subscription_activated: { name: "Alex", plan: "Pro", interval: "month", renewsOn: "23 October 2026" },
  subscription_plan_changed: { name: "Alex", from: "Pro", to: "Business" },
  subscription_cancel_scheduled: { name: "Alex", plan: "Pro", endsOn: "23 October 2026" },
  subscription_payment_failed: { name: "Alex", plan: "Pro", graceEndsOn: "30 September 2026" },
  subscription_payment_recovered: { name: "Alex", plan: "Pro" },
  subscription_on_hold: { name: "Alex", plan: "Pro" },
  subscription_ended: { name: "Alex", plan: "Pro" },
  refund_issued: { name: "Alex", plan: "Pro", amount: "$174.16", months: 11 },
  renewal_reminder: { name: "Alex", plan: "Pro", renewsOn: "30 September 2026" },
  plan_ending_reminder: { name: "Alex", plan: "Pro", endsOn: "26 September 2026" },
  plan_granted: { name: "Alex", plan: "Business", until: null },
  usage_threshold: {
    name: "Alex", metric: "dms", percent: 80, used: 800, limit: 1000, plan: "Free", resetsOn: "1 October 2026",
  },
  instagram_reconnect: { name: "Alex", username: "alex.makes" },
  instagram_access_removed: { name: "Alex", username: "alex.makes" },
  account_suspended: { name: "Alex", reason: "Repeated spam reports." },
  account_reinstated: { name: "Alex" },
};

export async function runEmailChecks(prisma: PrismaClient, check: Check, section: Section) {
  const savedBilling = mutableEnv.billing.enabled;
  const sent: OutgoingEmail[] = [];
  setEmailTransport(async (email) => {
    sent.push(email);
    return { messageId: `test-${sent.length}` };
  });

  const tag = randomBytes(4).toString("hex");
  const email = `e2e-email-${tag}@example.com`;
  const { user, workspace } = await registerUser({ email, password: "original-pass-1", name: "Alex Rivera" });

  const to = (template: string) => sent.filter((e) => e.template === template && e.to === email);
  /** Deliver whatever the queue would have: with Redis up, sends are queued. */
  const flush = async () => {
    const queued = await prisma.emailMessage.findMany({ where: { to: email, status: "queued" }, select: { id: true } });
    for (const q of queued) await deliverEmail(q.id);
  };

  try {
    // --- Templates ----------------------------------------------------------

    section("Email templates");

    for (const name of Object.keys(TEMPLATES) as TemplateName[]) {
      const r = render(name, SAMPLE[name] as never);
      if (!r.subject || !r.html.includes("</html>") || r.text.length < 40) {
        check(`template ${name} renders a subject, HTML and text`, false);
      }
    }
    check("every template renders a subject, HTML and text", true);

    const hostile = render("instagram_reconnect", { name: "<script>x</script>", username: '"><img src=x onerror=alert(1)>' });
    check(
      "customer-supplied values are escaped in HTML",
      !hostile.html.includes("<script>x") && !hostile.html.includes("<img src=x"),
    );
    const jsLink = render("verify_email", { name: "A", url: "javascript:alert(1)" });
    check("a non-http link is never rendered", !jsLink.html.includes("javascript:") && !jsLink.text.includes("javascript:"));
    check("verification is marked as carrying a secret", render("verify_email", SAMPLE.verify_email).secret);
    check("password reset is marked as carrying a secret", render("password_reset", SAMPLE.password_reset).secret);
    check("a billing notice is not", !render("subscription_ended", SAMPLE.subscription_ended).secret);
    check(
      "each category has its own sender",
      new Set([env.email.from.accounts, env.email.from.billing, env.email.from.alerts]).size === 3,
    );

    // --- Sending, dedupe, retries ------------------------------------------

    section("Sending email");

    const first = await sendEmail({
      to: email,
      template: "account_reinstated",
      params: { name: "Alex" },
      dedupeKey: `e2e:${tag}:dedupe`,
      workspaceId: workspace.id,
    });
    await flush();
    const again = await sendEmail({
      to: email,
      template: "account_reinstated",
      params: { name: "Alex" },
      dedupeKey: `e2e:${tag}:dedupe`,
    });
    check("a send is recorded and delivered", ["sent", "queued"].includes(first.status) && to("account_reinstated").length === 1);
    check("the same dedupe key sends nothing the second time", again.status === "duplicate" && to("account_reinstated").length === 1);
    const row = await prisma.emailMessage.findUnique({ where: { id: first.id! } });
    check("the log keeps the SES message ID", row?.status === "sent" && row.providerMessageId?.startsWith("test-") === true);
    check("an account alert is sent from the alerts address", to("account_reinstated")[0]?.from === env.email.from.alerts);
    check("replies go to support", to("account_reinstated")[0]?.replyTo === env.email.replyTo);

    // A transient SES error is retried; a permanent one gives up at once.
    const flaky = await prisma.emailMessage.create({
      data: {
        to: email, from: env.email.from.alerts, category: "alerts", template: "account_reinstated",
        subject: "x", params: { name: "Alex" }, status: "queued",
      },
    });
    setEmailTransport(async () => {
      throw new EmailSendError("TooManyRequestsException: slow down", true);
    });
    let rethrown = false;
    await deliverEmail(flaky.id, { finalAttempt: false }).catch(() => (rethrown = true));
    const afterRetryable = await prisma.emailMessage.findUnique({ where: { id: flaky.id } });
    check("a throttled send is thrown back to the queue to retry", rethrown && afterRetryable?.status === "queued");
    const last = await deliverEmail(flaky.id, { finalAttempt: true });
    check("the final attempt gives up and says why", last.status === "failed");

    setEmailTransport(async () => {
      throw new EmailSendError("MailFromDomainNotVerifiedException: nope", false);
    });
    const permanent = await prisma.emailMessage.create({
      data: {
        to: email, from: env.email.from.alerts, category: "alerts", template: "account_reinstated",
        subject: "x", params: { name: "Alex" }, status: "queued",
      },
    });
    const perm = await deliverEmail(permanent.id, { finalAttempt: false });
    check("a permanent SES error is not retried", perm.status === "failed");
    setEmailTransport(async (e) => {
      sent.push(e);
      return { messageId: `test-${sent.length}` };
    });

    // With no transport at all, nothing breaks.
    setEmailTransport(null);
    if (env.email.provider !== "ses") {
      const skipped = await sendEmail({ to: email, template: "account_reinstated", params: { name: "Alex" } });
      check("with email unconfigured a send is recorded as skipped", skipped.status === "skipped");
    }
    setEmailTransport(async (e) => {
      sent.push(e);
      return { messageId: `test-${sent.length}` };
    });

    // --- Verification -------------------------------------------------------

    section("Email verification");

    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: null } });
    check("a new sign-up starts unverified", !(await prisma.user.findUnique({ where: { id: user.id } }))?.emailVerifiedAt);

    setEmailTransport(async () => {
      throw new EmailSendError("AccountSuspendedException: paused", false);
    });
    const down = await sendVerificationEmail(user.id);
    setEmailTransport(async (e) => {
      sent.push(e);
      return { messageId: `test-${sent.length}` };
    });
    check("a failed verification send reports failure", down === "failed");

    const v1 = await sendVerificationEmail(user.id);
    const verifyMail = to("verify_email").at(-1);
    const token = verifyMail?.text.match(/token=([A-Za-z0-9_%-]+)/)?.[1];
    check("a failed send doesn't hold them to the cooldown", v1 === "sent");
    check("the verification email is sent immediately, not queued", Boolean(token));

    const vRow = await prisma.emailMessage.findFirst({ where: { to: email, template: "verify_email" }, orderBy: { createdAt: "desc" } });
    check("its log row keeps no inputs", vRow?.params === null && vRow.status === "sent");
    const tokenRows = await prisma.emailToken.findMany({ where: { userId: user.id } });
    const raw = decodeURIComponent(token ?? "");
    check(
      "the token is stored only as a hash",
      tokenRows.length > 0 && tokenRows.every((t) => t.tokenHash !== raw && !t.tokenHash.includes(raw)),
    );
    const leaked = await prisma.emailMessage.count({
      where: { OR: [{ subject: { contains: raw } }, { error: { contains: raw } }, { dedupeKey: { contains: raw } }] },
    });
    check("the link appears nowhere in the email log", leaked === 0);

    check("asking again straight away sends nothing", (await sendVerificationEmail(user.id)) === "cooldown");
    check("a garbage token doesn't verify", (await verifyEmail("not-a-real-token")) === "invalid");
    check("the right token verifies", (await verifyEmail(raw)) === "verified");
    check("the address is marked verified", Boolean((await prisma.user.findUnique({ where: { id: user.id } }))?.emailVerifiedAt));
    check(
      "a link a mail scanner already opened still reads as verified",
      (await verifyEmail(raw)) === "verified",
    );
    check("a verified address isn't sent another link", (await sendVerificationEmail(user.id)) === "verified");

    // --- Password reset -----------------------------------------------------

    section("Password reset");

    await prisma.session.create({
      data: { userId: user.id, token: `e2e-session-${tag}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const before = sent.length;
    await requestPasswordReset(`nobody-${tag}@example.com`);
    check("an unknown address sends nothing and says nothing", sent.length === before);

    await requestPasswordReset(email.toUpperCase());
    const resetMail = to("password_reset").at(-1);
    const resetToken = decodeURIComponent(resetMail?.text.match(/token=([A-Za-z0-9_%-]+)/)?.[1] ?? "");
    check("a reset link is sent to the account's address", Boolean(resetToken));
    check("a verification token can't reset a password", !(await resetPassword(raw, "sneaky-pass-1")));

    const ok = await resetPassword(resetToken, "brand-new-pass-1");
    const reset = await prisma.user.findUnique({ where: { id: user.id } });
    check("the reset link sets the new password", ok && verifyPassword("brand-new-pass-1", reset!.passwordHash));
    check("every session is signed out", (await prisma.session.count({ where: { userId: user.id } })) === 0);
    await flush();
    check("the owner is told their password changed", to("password_changed").length === 1);
    check("a reset link works once", !(await resetPassword(resetToken, "another-pass-1")));

    // Expired: age the cooldown away, issue a new link, then expire it.
    await prisma.emailToken.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 120_000) } });
    await requestPasswordReset(email);
    const late = decodeURIComponent(to("password_reset").at(-1)?.text.match(/token=([A-Za-z0-9_%-]+)/)?.[1] ?? "");
    await prisma.emailToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    check("an expired reset link is refused", Boolean(late) && late !== resetToken && !(await resetPassword(late, "too-late-pass-1")));

    // --- Subscription lifecycle --------------------------------------------

    section("Subscription emails");

    const subId = `e2e_sub_${tag}`;
    const end = new Date(Date.now() + 30 * 86_400_000);
    const snap = (over: Partial<SubscriptionSnapshot>): SubscriptionSnapshot => ({
      status: "active", planKey: "pro", interval: "month", cancelAtPeriodEnd: false,
      currentPeriodEnd: end, graceEndsAt: null, ...over,
    });
    const step = async (b: SubscriptionSnapshot | null, a: SubscriptionSnapshot) => {
      await notifySubscriptionChange(workspace.id, subId, b, a, new Date());
      await flush();
    };
    const count = (t: string) => to(t).length;

    await step(null, snap({}));
    await step(snap({}), snap({}));
    check("activation sends one welcome, however many events repeat it", count("subscription_activated") === 1);
    await step(snap({}), snap({ status: "past_due", graceEndsAt: new Date(Date.now() + 3 * 86_400_000) }));
    check("a failed renewal warns the owner", count("subscription_payment_failed") === 1);
    await step(snap({ status: "past_due" }), snap({}));
    check("recovering from it says so", count("subscription_payment_recovered") === 1);
    await step(snap({}), snap({ planKey: "business" }));
    check("a plan change is confirmed", count("subscription_plan_changed") === 1);
    await step(snap({ planKey: "business" }), snap({ planKey: "business", cancelAtPeriodEnd: true }));
    await step(snap({ planKey: "business" }), snap({ planKey: "business", cancelAtPeriodEnd: true }));
    check("scheduling a cancellation is confirmed once", count("subscription_cancel_scheduled") === 1);
    await step(snap({ planKey: "business", cancelAtPeriodEnd: true }), snap({ planKey: "business", status: "cancelled" }));
    check("the end of a plan is announced", count("subscription_ended") === 1);
    await notifySubscriptionChange(workspace.id, `${subId}_x`, snap({ status: "pending" }), snap({ status: "failed" }), new Date());
    await flush();
    check("a checkout that never completed isn't an 'ended' plan", count("subscription_ended") === 1);
    const billingMail = to("subscription_ended")[0];
    check("billing notices come from the billing address", billingMail?.from === env.email.from.billing);
    check("they're addressed by first name", Boolean(billingMail?.html.includes("Hi Alex,")));

    // Reminders by the calendar.
    const renewal = await prisma.subscription.create({
      data: {
        workspaceId: workspace.id, providerSubscriptionId: `e2e_yr_${tag}`, providerCustomerId: `e2e_c_${tag}`,
        providerProductId: "p", planKey: "pro", interval: "year", status: "active",
        currentPeriodEnd: new Date(Date.now() + 6 * 86_400_000),
      },
    });
    await sendBillingReminders();
    await sendBillingReminders();
    await flush();
    check("a yearly plan gets one renewal reminder, however often the job runs", count("renewal_reminder") === 1);
    await prisma.subscription.delete({ where: { id: renewal.id } });

    // --- Usage --------------------------------------------------------------

    section("Usage emails");

    mutableEnv.billing.enabled = true;
    await prisma.workspace.update({ where: { id: workspace.id }, data: { planKey: "free" } });
    const ws = { id: workspace.id, planKey: "free" };
    await prisma.usageCounter.upsert({
      where: { workspaceId_period_metric: { workspaceId: workspace.id, period: periodKey(), metric: "dms" } },
      create: { workspaceId: workspace.id, period: periodKey(), metric: "dms", count: 798 },
      update: { count: 798 },
    });
    await reserveUsage(ws, "dms"); // 799
    await flush();
    check("no warning below 80%", count("usage_threshold") === 0);
    await reserveUsage(ws, "dms"); // 800
    await reserveUsage(ws, "dms"); // 801
    await flush();
    check("reaching 80% of the DM quota warns once", count("usage_threshold") === 1);
    await prisma.usageCounter.update({
      where: { workspaceId_period_metric: { workspaceId: workspace.id, period: periodKey(), metric: "dms" } },
      data: { count: 999 },
    });
    await reserveUsage(ws, "dms"); // 1000
    const refused = await reserveUsage(ws, "dms");
    await flush();
    const usageMails = to("usage_threshold");
    check(
      "reaching the limit says so, and further refusals don't repeat it",
      !refused && usageMails.length === 2 && usageMails[0].subject.includes("80%") && usageMails[1].subject.includes("used all"),
    );
    mutableEnv.billing.enabled = savedBilling;

    // --- Account alerts -----------------------------------------------------

    section("Account alert emails");

    const account = await prisma.instagramAccount.create({
      data: {
        workspaceId: workspace.id, igUserId: `e2e_mail_ig_${tag}`, username: `e2e_mail_${tag}`,
        status: "connected", lastRefreshAt: new Date(),
      },
    });
    await Promise.all([markReconnectNeeded(account.id), markReconnectNeeded(account.id), markReconnectNeeded(account.id)]);
    await flush();
    const acct = await prisma.instagramAccount.findUnique({ where: { id: account.id } });
    check("a dead token pauses the account", acct?.status === "token_expired" && acct.automationPaused);
    check("and emails the owner once, however many sends failed at once", count("instagram_reconnect") === 1);
    check("alerts come from the alerts address", to("instagram_reconnect")[0]?.from === env.email.from.alerts);

    const at = new Date();
    await notifySuspension(workspace.id, true, "Repeated spam reports from recipients.", at);
    await notifySuspension(workspace.id, true, "Repeated spam reports from recipients.", at);
    await flush();
    const suspendedMail = to("account_suspended");
    check(
      "a suspension is explained to the owner once, with its reason",
      suspendedMail.length === 1 && suspendedMail[0].text.includes("Repeated spam reports"),
    );
  } finally {
    setEmailTransport(null);
    mutableEnv.billing.enabled = savedBilling;
    await prisma.emailMessage.deleteMany({ where: { to: email } });
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
}
