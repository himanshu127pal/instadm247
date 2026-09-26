import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env, isEmailConfigured } from "@/lib/env";
import { enqueue } from "@/lib/engine/queues";
import { render, type Category, type TemplateName, type TemplateParams } from "./templates";

/**
 * Sending email. See docs/EMAIL.md.
 *
 * Two paths, chosen by the template:
 *
 *   Secret (verification, password reset) — sent immediately, in the request.
 *     Never queued and never stored: a BullMQ job or a log row holding the link
 *     would let anyone who can read Redis or the database take over the
 *     account. If the send fails, the user asks for another.
 *
 *   Everything else — recorded, then queued, so a transient SES error is
 *     retried with backoff and a request never waits on email. A `dedupeKey`
 *     makes the send idempotent, so a webhook Dodo retries, or a threshold
 *     crossed twice, still produces one email.
 *
 * With no provider configured nothing is sent and nothing breaks: the message
 * is recorded as skipped, and outside production its text is printed so links
 * can be followed in development. Never in production — that would put reset
 * links in the server logs.
 */

export type OutgoingEmail = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  template: string;
  category: Category;
};

export type EmailTransport = (email: OutgoingEmail) => Promise<{ messageId?: string }>;

/** A send failure, marked with whether trying again could help. */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

// SES v2 errors, by class name. Throttling and SES's own faults are worth a
// retry; a rejected address, a paused account or an unverified domain are not.
const RETRYABLE = new Set([
  "TooManyRequestsException",
  "LimitExceededException",
  "InternalServiceErrorException",
  "ThrottlingException",
  "TimeoutError",
]);

let ses: SESv2Client | null = null;

const sesTransport: EmailTransport = async (email) => {
  ses ??= new SESv2Client({ region: env.email.sesRegion });
  try {
    const result = await ses.send(
      new SendEmailCommand({
        FromEmailAddress: email.from,
        Destination: { ToAddresses: [email.to] },
        ReplyToAddresses: [email.replyTo],
        Content: {
          Simple: {
            Subject: { Data: email.subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: email.text, Charset: "UTF-8" },
              Html: { Data: email.html, Charset: "UTF-8" },
            },
          },
        },
        // Tag values allow only letters, digits, "_" and "-".
        EmailTags: [
          { Name: "template", Value: email.template },
          { Name: "category", Value: email.category },
        ],
        ...(env.email.configurationSet ? { ConfigurationSetName: env.email.configurationSet } : {}),
      }),
    );
    return { messageId: result.MessageId };
  } catch (error) {
    const name = (error as { name?: string }).name ?? "Error";
    throw new EmailSendError(`${name}: ${(error as Error).message}`, RETRYABLE.has(name));
  }
};

let override: EmailTransport | null = null;

/** Replace the transport. For tests; pass null to restore the default. */
export function setEmailTransport(transport: EmailTransport | null): void {
  override = transport;
}

function activeTransport(): EmailTransport | null {
  if (override) return override;
  return isEmailConfigured() ? sesTransport : null;
}

// --- Sending ----------------------------------------------------------------

export type SendResult = {
  status: "sent" | "queued" | "skipped" | "failed" | "duplicate";
  id?: string;
};

export async function sendEmail<K extends TemplateName>(input: {
  to: string;
  template: K;
  params: TemplateParams[K];
  /** Same key, same email — a second send is a no-op. */
  dedupeKey?: string;
  userId?: string | null;
  workspaceId?: string | null;
}): Promise<SendResult> {
  const rendered = render(input.template, input.params);
  const from = env.email.from[rendered.category];

  // ON CONFLICT DO NOTHING rather than catching a unique violation: a repeat is
  // the normal case for retried webhooks, and shouldn't read as an error.
  const [row] = await prisma.emailMessage.createManyAndReturn({
    data: [
      {
        to: input.to,
        from,
        category: rendered.category,
        template: input.template,
        subject: rendered.subject,
        // The inputs are kept only when they hold no secret, so a failed send
        // can be retried by re-rendering them.
        params: rendered.secret ? Prisma.DbNull : (input.params as Prisma.InputJsonValue),
        dedupeKey: input.dedupeKey ?? null,
        status: "queued",
        userId: input.userId ?? null,
        workspaceId: input.workspaceId ?? null,
      },
    ],
    skipDuplicates: true,
    select: { id: true },
  });
  if (!row) return { status: "duplicate" };

  const transport = activeTransport();
  if (!transport) {
    await prisma.emailMessage.update({
      where: { id: row.id },
      data: { status: "skipped", error: "Email is not configured." },
    });
    if (!env.isProd) {
      console.log(`\n[email:dev] to ${input.to}: ${rendered.subject}\n${rendered.text}\n`);
    }
    return { status: "skipped", id: row.id };
  }

  if (rendered.secret) {
    // Sent now or not at all — see the note at the top of this file.
    return deliver(row.id, transport, { ...rendered, template: input.template, to: input.to, from });
  }

  const queued = await enqueue("email", "send", { emailMessageId: row.id });
  if (!queued) {
    // No Redis: send inline so a single-process deploy still delivers.
    return deliverEmail(row.id);
  }
  return { status: "queued", id: row.id };
}

async function deliver(
  id: string,
  transport: EmailTransport,
  email: { to: string; from: string; subject: string; html: string; text: string; template: string; category: Category },
  opts: { finalAttempt?: boolean } = { finalAttempt: true },
): Promise<SendResult> {
  try {
    const result = await transport({ ...email, replyTo: env.email.replyTo });
    await prisma.emailMessage.update({
      where: { id },
      data: {
        status: "sent",
        providerMessageId: result.messageId ?? null,
        sentAt: new Date(),
        error: null,
        attempts: { increment: 1 },
      },
    });
    return { status: "sent", id };
  } catch (error) {
    const retryable = error instanceof EmailSendError ? error.retryable : true;
    const message = (error as Error).message ?? "Unknown error";
    const giveUp = !retryable || opts.finalAttempt;
    await prisma.emailMessage.update({
      where: { id },
      data: { status: giveUp ? "failed" : "queued", error: message, attempts: { increment: 1 } },
    });
    if (!giveUp) throw error;
    console.error(`[email] ${email.template} to ${email.to} failed: ${message}`);
    return { status: "failed", id };
  }
}

/**
 * Deliver a queued message. Called by the email worker, which retries with
 * backoff; `finalAttempt` tells us when to stop marking it queued and give up.
 * Throws on a retryable failure so the queue schedules the next attempt.
 */
export async function deliverEmail(id: string, opts: { finalAttempt?: boolean } = {}): Promise<SendResult> {
  const row = await prisma.emailMessage.findUnique({ where: { id } });
  if (!row || row.status === "sent") return { status: "sent", id };
  if (row.params === null) {
    // A secret-bearing message is never queued; if one is here, it can't be
    // rebuilt without the link, and must not be.
    await prisma.emailMessage.update({
      where: { id },
      data: { status: "failed", error: "No stored inputs to rebuild this email from." },
    });
    return { status: "failed", id };
  }

  const transport = activeTransport();
  if (!transport) {
    await prisma.emailMessage.update({ where: { id }, data: { status: "skipped", error: "Email is not configured." } });
    return { status: "skipped", id };
  }

  const template = row.template as TemplateName;
  const rendered = render(template, row.params as TemplateParams[typeof template]);
  return deliver(
    id,
    transport,
    { to: row.to, from: row.from, template, ...rendered },
    { finalAttempt: opts.finalAttempt ?? true },
  );
}

// --- Recipients -------------------------------------------------------------

/** Email the owner of a workspace — the person billing and alerts are for. */
export async function emailWorkspaceOwner<K extends TemplateName>(
  workspaceId: string,
  template: K,
  params: Omit<TemplateParams[K], "name">,
  dedupeKey?: string,
): Promise<SendResult> {
  const owner = await prisma.membership.findFirst({
    where: { workspaceId, role: "owner" },
    orderBy: { createdAt: "asc" },
    select: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!owner) return { status: "skipped" };

  try {
    return await sendEmail({
      to: owner.user.email,
      template,
      params: { ...params, name: owner.user.name } as TemplateParams[K],
      dedupeKey,
      userId: owner.user.id,
      workspaceId,
    });
  } catch (error) {
    // An email must never be the reason a webhook, a send or an admin action
    // fails. Record it and carry on.
    console.error(`[email] could not send ${template} for ${workspaceId}`, error);
    return { status: "failed" };
  }
}

/** A date as customers read it: "23 September 2026". Always UTC. */
export function humanDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
