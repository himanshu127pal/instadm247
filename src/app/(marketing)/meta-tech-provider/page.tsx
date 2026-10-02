import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Ban, Eye, KeyRound, LockKeyhole, ShieldCheck, Timer, Unplug } from "lucide-react";
import { Accordion } from "@/components/marketing/bits";
import { CtaBand, JsonLd, PageHero, renderInline } from "@/components/marketing/content";
import { MetaBadge } from "@/components/marketing/meta-badge";

/**
 * What our standing with Meta means for a creator. Every claim here must stay
 * true (CLAUDE.md rule 13). See docs/TRUST.md.
 */

export const metadata: Metadata = {
  title: "Meta Tech Provider",
  description:
    "InstaDM247 is a Meta Tech Provider. What that means for your Instagram account: official login, permissions you control, and Instagram's rules enforced on every message.",
  alternates: { canonical: "/meta-tech-provider" },
};

const BENEFITS = [
  {
    icon: KeyRound,
    title: "You log in with Instagram, not with us",
    body: "You connect on Instagram's own screen. We never see or store your Instagram password.",
  },
  {
    icon: Eye,
    title: "You choose what we can do",
    body: "Instagram shows you exactly which permissions we ask for before you approve. We only ask for what the features need: your profile and posts, your messages, your comments, and publishing for the Scheduler.",
  },
  {
    icon: Unplug,
    title: "You can take access back any time",
    body: "Disconnect in the app, which deletes the account's data, or remove InstaDM247 in Instagram's settings to revoke our access. See [data deletion](/data-deletion).",
  },
  {
    icon: BadgeCheck,
    title: "Only Meta's documented API",
    body: "Every action is a call Meta publishes and supports. No scraping, no browser bots, no unofficial apps pretending to be you.",
  },
  {
    icon: Timer,
    title: "Instagram's rules, checked on every message",
    body: "The 24-hour messaging window, one private reply per comment, rate limits and Slow Down mode are enforced before anything is sent, on every plan, free included. See [account safety](/features/account-safety).",
  },
  {
    icon: LockKeyhole,
    title: "Your data, handled carefully",
    body: "Access tokens are encrypted at rest, and like every app on Meta's API we're bound by Meta's Platform Terms on how data from Instagram may be used. See our [privacy policy](/privacy).",
  },
];

const FAQS = [
  {
    question: "Is InstaDM247 made by Meta?",
    answer: "No. We're an independent company that builds on Meta's platform. We're not affiliated with or endorsed by Meta.",
  },
  {
    question: "What is a Meta Tech Provider?",
    answer:
      "A business that builds software on Meta's platform for other businesses to use. Meta verifies the business and reviews the app, including every permission it asks for and how it's used, before it can serve customers.",
  },
  {
    question: "Can using InstaDM247 get my account restricted?",
    answer: "Using an app on Meta's official API isn't against Instagram's rules; scraping tools and fake activity are what get accounts restricted. We also refuse to send anything that would break Instagram's messaging rules. What you write in your messages is still yours, and Instagram's Community Guidelines apply to it as they do to everything you post.",
  },
  {
    question: "Do I need my own Meta developer app?",
    answer: "No. Connect your Instagram professional account (Business or Creator) and approve the permissions. That's all.",
  },
  {
    question: "Can you message people who never contacted me?",
    answer: "No, and no official tool can. Instagram only lets a business message people who interacted with it first, which is a big part of why automation done this way is safe.",
  },
];

export default function MetaTechProviderPage() {
  const faqs = FAQS;
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
        }}
      />
      <PageHero
        eyebrow="Meta Tech Provider"
        title="A Meta Tech Provider. Here's what that means for you."
        intro="Meta has verified our business and reviewed our app. For you, that means a safe way to automate Instagram: official login, permissions you control, and Instagram's rules on every message."
      >
        <div className="mt-7">
          <MetaBadge size="lg" />
        </div>
      </PageHero>

      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-none">What it means for you</h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <li
              key={b.title}
              className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-5 shadow-[4px_4px_0_0_var(--shadow-ink)]"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl border-2 border-[var(--border)] bg-[var(--color-pow-400)] text-[#12110e]">
                <b.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-[17px] font-extrabold leading-snug">{b.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--text-muted)]">{renderInline(b.body)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-14">
        <div className="grid gap-6 rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-subtle)] p-6 md:grid-cols-2">
          <div>
            <h2 className="flex items-center gap-2 text-[18px] font-extrabold">
              <ShieldCheck className="h-5 w-5 text-[var(--color-boom-500)]" /> What we do
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed">
              <li>Answer comments, story replies, mentions and DMs from people who contacted you</li>
              <li>Send one private reply per comment, within Instagram&rsquo;s 7 days</li>
              <li>Pace sending under Meta&rsquo;s published limits, and slow down when a post goes viral</li>
              <li>Show every message we skipped, and why, in your Safety Center</li>
            </ul>
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-[18px] font-extrabold">
              <Ban className="h-5 w-5 text-[var(--color-zap-500)]" /> What we never do
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed">
              <li>Ask for your Instagram password</li>
              <li>Message people who never contacted you</li>
              <li>Follow or like accounts on your behalf, or join engagement pods</li>
              <li>Use unofficial endpoints, scrapers or browser bots</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-16">
        <h2 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-none">Questions</h2>
        <div className="mt-6">
          <Accordion items={faqs} />
        </div>
        <p className="mt-6 text-[14px] text-[var(--text-muted)]">
          More on how we protect accounts: <Link href="/features/account-safety" className="font-semibold text-[var(--accent)] underline underline-offset-2">Account safety</Link>
          {" · "}
          <Link href="/docs/safety" className="font-semibold text-[var(--accent)] underline underline-offset-2">Safety Center docs</Link>
        </p>
      </section>
      <CtaBand />
    </>
  );
}
