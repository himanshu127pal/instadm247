import { env } from "@/lib/env";

/**
 * Every email the platform sends. See docs/EMAIL.md.
 *
 * Templates never write HTML. Each returns plain-text blocks, and `render()`
 * turns them into both an HTML and a plain-text body, escaping everything on
 * the way. That is deliberate: values in these emails come from customers
 * (their name, their workspace's name) and from staff (a suspension reason),
 * and escaping once in one place is the only way to be sure nobody forgets.
 */

export type Category = "accounts" | "billing" | "alerts";

type Block =
  | { p: string }
  | { cta: { label: string; url: string } }
  | { note: string }
  | { facts: Array<[string, string]> };

type Draft = {
  subject: string;
  /** The grey preview line most inboxes show after the subject. */
  preheader: string;
  heading: string;
  blocks: Block[];
};

type Def<P> = {
  category: Category;
  /**
   * Carries a secret — a sign-in or reset link. Such a message is sent at once
   * and never queued or stored, because a queued job or a log row holding the
   * link would let anyone who can read either take over the account.
   */
  secret?: boolean;
  build: (p: P) => Draft;
};

// --- Params -----------------------------------------------------------------

type Named = { name?: string | null };

export type TemplateParams = {
  verify_email: Named & { url: string };
  password_reset: Named & { url: string };
  password_changed: Named & { at: string };

  subscription_activated: Named & { plan: string; interval: string; renewsOn: string | null };
  subscription_plan_changed: Named & { from: string; to: string };
  subscription_cancel_scheduled: Named & { plan: string; endsOn: string | null };
  subscription_payment_failed: Named & { plan: string; graceEndsOn: string | null };
  subscription_payment_recovered: Named & { plan: string };
  subscription_on_hold: Named & { plan: string };
  subscription_ended: Named & { plan: string };
  renewal_reminder: Named & { plan: string; renewsOn: string };
  plan_ending_reminder: Named & { plan: string; endsOn: string };
  plan_granted: Named & { plan: string; until: string | null };

  usage_threshold: Named & {
    metric: "dms" | "ai_replies";
    percent: 80 | 100;
    used: number;
    limit: number;
    plan: string;
    resetsOn: string;
  };

  instagram_reconnect: Named & { username: string };
  instagram_access_removed: Named & { username: string };
  account_suspended: Named & { reason: string };
  account_reinstated: Named;
};

export type TemplateName = keyof TemplateParams;

// --- Helpers ----------------------------------------------------------------

const app = (path: string) => `${env.appUrl}${path}`;
const hi = (p: Named) => (p.name?.trim() ? `Hi ${p.name.trim().split(/\s+/)[0]},` : "Hi,");
const n = (v: number) => v.toLocaleString("en-US");
const METRIC: Record<"dms" | "ai_replies", string> = {
  dms: "automated DMs",
  ai_replies: "AI replies",
};

// --- The templates ----------------------------------------------------------

export const TEMPLATES: { [K in TemplateName]: Def<TemplateParams[K]> } = {
  // Accounts ------------------------------------------------------------------

  verify_email: {
    category: "accounts",
    secret: true,
    build: (p) => ({
      subject: "Confirm your email for InstaDM247",
      preheader: "One click and you're set up.",
      heading: "Confirm your email",
      blocks: [
        { p: `${hi(p)} welcome to InstaDM247. Confirm this is your email address so we can reach you about your account and your plan.` },
        { cta: { label: "Confirm my email", url: p.url } },
        { note: "This link works for 24 hours. If you didn't create an InstaDM247 account, you can ignore this email." },
      ],
    }),
  },

  password_reset: {
    category: "accounts",
    secret: true,
    build: (p) => ({
      subject: "Reset your InstaDM247 password",
      preheader: "This link works for one hour.",
      heading: "Reset your password",
      blocks: [
        { p: `${hi(p)} someone — hopefully you — asked to reset the password for your InstaDM247 account.` },
        { cta: { label: "Choose a new password", url: p.url } },
        { note: "This link works once, for one hour. If you didn't ask for this, ignore it: your password stays the same and nobody can use this link without access to your inbox." },
      ],
    }),
  },

  password_changed: {
    category: "accounts",
    build: (p) => ({
      subject: "Your InstaDM247 password was changed",
      preheader: "If this was you, there's nothing to do.",
      heading: "Your password was changed",
      blocks: [
        { p: `${hi(p)} the password for your InstaDM247 account was changed on ${p.at}, and every other session was signed out.` },
        { p: "If this was you, there's nothing more to do." },
        { p: "If it wasn't, reset your password straight away and reply to this email so we can help." },
        { cta: { label: "Reset my password", url: app("/forgot-password") } },
      ],
    }),
  },

  // Billing -------------------------------------------------------------------

  subscription_activated: {
    category: "billing",
    build: (p) => ({
      subject: `You're on InstaDM247 ${p.plan}`,
      preheader: "Your new limits are live now.",
      heading: `Welcome to ${p.plan}`,
      blocks: [
        { p: `${hi(p)} thank you — your ${p.plan} plan is active, and the new limits and features are already live on your account.` },
        {
          facts: [
            ["Plan", p.plan],
            ["Billing", p.interval === "year" ? "Yearly" : "Monthly"],
            ...(p.renewsOn ? ([["Renews", p.renewsOn]] as Array<[string, string]>) : []),
          ],
        },
        { cta: { label: "Open your dashboard", url: app("/dashboard") } },
        { note: "Your receipt comes separately from Dodo Payments, our merchant of record." },
      ],
    }),
  },

  subscription_plan_changed: {
    category: "billing",
    build: (p) => ({
      subject: `Your plan changed to ${p.to}`,
      preheader: `From ${p.from} to ${p.to}.`,
      heading: `You're now on ${p.to}`,
      blocks: [
        { p: `${hi(p)} your InstaDM247 plan changed from ${p.from} to ${p.to}. The new limits apply straight away.` },
        { cta: { label: "See your plan", url: app("/dashboard/billing") } },
      ],
    }),
  },

  subscription_cancel_scheduled: {
    category: "billing",
    build: (p) => ({
      subject: `Your ${p.plan} plan won't renew`,
      preheader: p.endsOn ? `You keep it until ${p.endsOn}.` : "You keep it until the end of the period.",
      heading: "Your plan is set to end",
      blocks: [
        {
          p: `${hi(p)} your ${p.plan} plan is cancelled and won't renew. You keep everything it includes until ${p.endsOn ?? "the end of the period you've paid for"}, then your workspace moves to the Free plan.`,
        },
        { p: "Nothing you've built is deleted. Automations that use features Free doesn't include pause at that step, and pick up again if you come back." },
        { p: "Changed your mind? Visit the billing page or reply to this email before then, and we'll help you keep it." },
        { cta: { label: "Manage billing", url: app("/dashboard/billing") } },
      ],
    }),
  },

  subscription_payment_failed: {
    category: "billing",
    build: (p) => ({
      subject: "Your InstaDM247 payment didn't go through",
      preheader: "Update your card to keep your plan.",
      heading: "We couldn't take your payment",
      blocks: [
        {
          p: `${hi(p)} the latest payment for your ${p.plan} plan didn't go through. Your plan stays active for now while we retry${p.graceEndsOn ? `, until ${p.graceEndsOn}` : ""}.`,
        },
        { p: "Update your card from the billing page so the payment can go through, and your plan carries on as normal." },
        { cta: { label: "Update payment method", url: app("/dashboard/billing") } },
        { note: "Cards usually fail because they've expired or the bank flagged the charge. A quick check with your bank normally sorts it." },
      ],
    }),
  },

  subscription_payment_recovered: {
    category: "billing",
    build: (p) => ({
      subject: "Payment received — you're all set",
      preheader: `Your ${p.plan} plan is fully active again.`,
      heading: "All sorted",
      blocks: [
        { p: `${hi(p)} we've taken the payment for your ${p.plan} plan. Everything's back to normal, and there's nothing more you need to do.` },
      ],
    }),
  },

  subscription_on_hold: {
    category: "billing",
    build: (p) => ({
      subject: `Your ${p.plan} plan is on hold`,
      preheader: "You're on the Free plan until payment goes through.",
      heading: "Your plan is on hold",
      blocks: [
        { p: `${hi(p)} we couldn't collect payment for your ${p.plan} plan after several attempts, so your workspace is on the Free plan for now.` },
        { p: "Nothing is deleted. Automations using features Free doesn't include are paused at that step, and your monthly allowances are Free's until the plan is restored." },
        { cta: { label: "Update payment method", url: app("/dashboard/billing") } },
      ],
    }),
  },

  subscription_ended: {
    category: "billing",
    build: (p) => ({
      subject: `Your ${p.plan} plan has ended`,
      preheader: "You're on the Free plan now.",
      heading: `Your ${p.plan} plan has ended`,
      blocks: [
        { p: `${hi(p)} your ${p.plan} plan has ended and your workspace is on the Free plan.` },
        { p: "Everything you built is still there. Automations using features Free doesn't include are paused at that step, and resume as soon as you upgrade again." },
        { cta: { label: "See plans", url: app("/dashboard/billing") } },
      ],
    }),
  },

  renewal_reminder: {
    category: "billing",
    build: (p) => ({
      subject: `Your ${p.plan} plan renews on ${p.renewsOn}`,
      preheader: "A heads-up before your yearly renewal.",
      heading: "Your yearly renewal is coming up",
      blocks: [
        { p: `${hi(p)} a heads-up: your yearly ${p.plan} plan renews automatically on ${p.renewsOn}, and the card on file will be charged then.` },
        { p: "Nothing to do if you'd like to continue. To change plan or cancel, visit the billing page before that date." },
        { cta: { label: "Manage billing", url: app("/dashboard/billing") } },
      ],
    }),
  },

  plan_ending_reminder: {
    category: "billing",
    build: (p) => ({
      subject: `Your ${p.plan} plan ends on ${p.endsOn}`,
      preheader: "A few days left before you move to Free.",
      heading: `${p.plan} ends on ${p.endsOn}`,
      blocks: [
        { p: `${hi(p)} as requested, your ${p.plan} plan ends on ${p.endsOn}, and your workspace moves to the Free plan.` },
        { p: "If you'd like to keep it, visit the billing page or reply to this email before then. Everything you've built stays as it is either way." },
        { cta: { label: "Keep my plan", url: app("/dashboard/billing") } },
      ],
    }),
  },

  plan_granted: {
    category: "billing",
    build: (p) => ({
      subject: `You've been given InstaDM247 ${p.plan}`,
      preheader: p.until ? `On us, until ${p.until}.` : "On us.",
      heading: `Enjoy ${p.plan}, on us`,
      blocks: [
        {
          p: `${hi(p)} we've upgraded your workspace to ${p.plan}${p.until ? ` until ${p.until}` : ""}, at no charge. The new limits and features are live now.`,
        },
        { cta: { label: "Open your dashboard", url: app("/dashboard") } },
      ],
    }),
  },

  usage_threshold: {
    category: "billing",
    build: (p) => {
      const what = METRIC[p.metric];
      const full = p.percent >= 100;
      return {
        subject: full
          ? `You've used all your ${what} for this month`
          : `You've used ${p.percent}% of your ${what}`,
        preheader: full
          ? `They pause until ${p.resetsOn} — or upgrade to keep going.`
          : `${n(p.used)} of ${n(p.limit)} on your ${p.plan} plan.`,
        heading: full ? "You've reached this month's limit" : `${p.percent}% of your ${what} used`,
        blocks: [
          {
            p: full
              ? `${hi(p)} your workspace has used all ${n(p.limit)} ${what} included in your ${p.plan} plan this month. ${
                  p.metric === "dms"
                    ? "Automated DMs are paused until the allowance resets"
                    : "AI steps will answer from your knowledge base, without the model, until the allowance resets"
                } on ${p.resetsOn}.`
              : `${hi(p)} your workspace has used ${n(p.used)} of the ${n(p.limit)} ${what} in your ${p.plan} plan this month. At this pace you may run out before it resets on ${p.resetsOn}.`,
          },
          ...(p.metric === "dms"
            ? ([{ p: "Replies you type yourself in the inbox are never limited." }] as Block[])
            : []),
          { cta: { label: full ? "Upgrade now" : "See plans", url: app("/dashboard/billing") } },
        ],
      };
    },
  },

  // Alerts --------------------------------------------------------------------

  instagram_reconnect: {
    category: "alerts",
    build: (p) => ({
      subject: `Action needed: reconnect @${p.username}`,
      preheader: "Automations for this account are paused.",
      heading: `Reconnect @${p.username}`,
      blocks: [
        { p: `${hi(p)} Instagram stopped accepting our connection to @${p.username}, so its automations are paused. This usually means the access expired or the password was changed.` },
        { p: "Reconnecting takes about a minute, and everything resumes as it was." },
        { cta: { label: `Reconnect @${p.username}`, url: app("/dashboard/accounts") } },
      ],
    }),
  },

  instagram_access_removed: {
    category: "alerts",
    build: (p) => ({
      subject: `@${p.username} was disconnected from InstaDM247`,
      preheader: "Access was removed from Instagram's settings.",
      heading: `@${p.username} was disconnected`,
      blocks: [
        { p: `${hi(p)} access for @${p.username} was removed from Instagram's own settings, so we've stopped all automations for it and discarded its access token.` },
        { p: "If you meant to do this, there's nothing more to do. If not, you can connect it again from your dashboard." },
        { cta: { label: "Go to Instagram accounts", url: app("/dashboard/accounts") } },
      ],
    }),
  },

  account_suspended: {
    category: "alerts",
    build: (p) => ({
      subject: "Your InstaDM247 account has been suspended",
      preheader: "Automations have stopped. Here's why.",
      heading: "Your account is suspended",
      blocks: [
        { p: `${hi(p)} we've suspended your InstaDM247 account, and its automations have stopped sending.` },
        { facts: [["Reason", p.reason]] },
        { p: "If you think this is a mistake, or you'd like to resolve it, reply to this email and we'll look into it." },
      ],
    }),
  },

  account_reinstated: {
    category: "alerts",
    build: (p) => ({
      subject: "Your InstaDM247 account is active again",
      preheader: "Automations are running again.",
      heading: "You're back",
      blocks: [
        { p: `${hi(p)} the suspension on your InstaDM247 account has been lifted. You can sign in again, and automations are sending as usual.` },
        { cta: { label: "Open your dashboard", url: app("/dashboard") } },
      ],
    }),
  },
};

// --- Rendering --------------------------------------------------------------

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links are ever rendered: a javascript: URL would be an injection. */
function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : env.appUrl;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#12110e";
const MUTED = "#55524a";
const ACCENT = "#ff3d7f";

function blockHtml(b: Block): string {
  if ("p" in b) {
    return `<p style="margin:0 0 16px;font:16px/1.55 ${FONT};color:${INK};">${esc(b.p)}</p>`;
  }
  if ("note" in b) {
    return `<p style="margin:0 0 16px;font:13px/1.5 ${FONT};color:${MUTED};">${esc(b.note)}</p>`;
  }
  if ("cta" in b) {
    const url = esc(safeUrl(b.cta.url));
    return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px;"><tr><td style="border-radius:10px;background:${ACCENT};border:2px solid ${INK};"><a href="${url}" style="display:inline-block;padding:13px 22px;font:bold 15px ${FONT};color:#ffffff;text-decoration:none;border-radius:10px;">${esc(b.cta.label)}</a></td></tr></table>`;
  }
  const rows = b.facts
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 16px 6px 0;font:13px ${FONT};color:${MUTED};white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;font:bold 14px ${FONT};color:${INK};">${esc(v)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;border-top:1px solid #e7e4dc;border-bottom:1px solid #e7e4dc;width:100%;">${rows}</table>`;
}

function blockText(b: Block): string {
  if ("p" in b) return b.p;
  if ("note" in b) return b.note;
  if ("cta" in b) return `${b.cta.label}:\n${safeUrl(b.cta.url)}`;
  return b.facts.map(([k, v]) => `${k}: ${v}`).join("\n");
}

const FOOTER_TEXT = [
  "Questions? Just reply — it reaches a real person at support@instadm247.com.",
  "InstaDM247 is the registered trade name of Rajat Pal, Meerut, Uttar Pradesh 250110, India.",
];

export type Rendered = {
  category: Category;
  secret: boolean;
  subject: string;
  html: string;
  text: string;
};

export function render<K extends TemplateName>(name: K, params: TemplateParams[K]): Rendered {
  const def = TEMPLATES[name] as Def<TemplateParams[K]>;
  const d = def.build(params);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(d.subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f3ee;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(d.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f3ee;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 20px;"><img src="${esc(`${env.appUrl}/brand/logo-lockup.png`)}" width="160" height="37" alt="InstaDM247" style="display:block;border:0;font:bold 20px ${FONT};color:${INK};"></td></tr>
<tr><td style="background:#ffffff;border:2px solid ${INK};border-radius:16px;padding:32px 28px;">
<h1 style="margin:0 0 20px;font:bold 22px/1.3 ${FONT};color:${INK};">${esc(d.heading)}</h1>
${d.blocks.map(blockHtml).join("\n")}
</td></tr>
<tr><td style="padding:20px 4px 0;">${FOOTER_TEXT.map((line) => `<p style="margin:0 0 6px;font:12px/1.5 ${FONT};color:${MUTED};">${esc(line)}</p>`).join("")}</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [d.heading, "", ...d.blocks.map((b) => `${blockText(b)}\n`), "--", ...FOOTER_TEXT].join("\n");

  return { category: def.category, secret: Boolean(def.secret), subject: d.subject, html, text };
}
