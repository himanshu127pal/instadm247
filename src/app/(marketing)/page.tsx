import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  ClipboardList,
  Inbox,
  Layers,
  Megaphone,
  MousePointerClick,
  Puzzle,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui";
import { JsonLd } from "@/components/marketing/content";
import { env } from "@/lib/env";
import { PhoneDemo } from "@/components/marketing/phone-demo";
import {
  Accordion,
  Counter,
  Marquee,
  Reveal,
  SectionLabel,
  SpotlightCard,
  TiltCard,
} from "@/components/marketing/bits";
import {
  ComparisonTable,
  FlowPreview,
  SafetyGuards,
  TriggerShowcase,
} from "@/components/marketing/showcase";

export default function LandingPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "InstaDM247",
              url: env.appUrl,
              logo: `${env.appUrl}/icon.png`,
              email: "support@instadm247.com",
            },
            {
              "@type": "SoftwareApplication",
              name: "InstaDM247",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: env.appUrl,
              description:
                "Instagram DM automation built on Meta's official API: comment-to-DM, story replies and reactions, lead capture, AI replies and a live inbox.",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free plan" },
            },
          ],
        }}
      />
      <Hero />
      <SocialProof />
      <Triggers />
      <Builder />
      <Features />
      <Safety />
      <Comparison />
      <Faq />
      <FinalCta />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-14 sm:pt-20">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="impact-rays radial-fade absolute inset-0 opacity-70" />
        <div className="halftone-lg absolute inset-0 opacity-50" />
        <div className="absolute -left-32 top-10 h-72 w-72 rotate-12 rounded-full bg-[var(--color-pow-400)] opacity-30 blur-2xl" />
        <div className="absolute -right-24 top-52 h-64 w-64 -rotate-6 rounded-full bg-[var(--color-bam-400)] opacity-25 blur-2xl" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.05fr_minmax(0,440px)]">
        <div>
          <Reveal>
            <span className="inline-flex -rotate-1 items-center gap-2 rounded-full border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] px-3.5 py-1.5 text-[12.5px] font-bold text-[var(--text)] shadow-[3px_3px_0_0_var(--shadow-ink)]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-[pulse-ring_2.4s_ease-out_infinite] rounded-full bg-[var(--color-boom-400)]" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-boom-400)]" />
              </span>
              Built on Meta&rsquo;s official Instagram API
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="font-display mt-6 text-[clamp(2.9rem,7.5vw,5.25rem)] leading-[0.92]">
              <span className="block -rotate-1">Your DMs answer</span>
              <span className="text-pop mt-1 block rotate-1">WHILE YOU SLEEP.</span>
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-7 max-w-lg text-[17px] font-semibold leading-relaxed text-[var(--text-muted)]">
              Every comment, story reply, @mention, Live comment and DM becomes a
              conversation, and a sale. Build the flow once, and it runs forever
              on the endpoints Meta actually sanctions.{" "}
              <span className="rounded-md bg-[var(--color-pow-400)] px-1.5 py-0.5 font-extrabold text-[#12110e]">No bots. No bans.</span>
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup">
                <Button variant="gradient" size="lg" className="group">
                  START AUTOMATING FREE
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button variant="pow" size="lg">
                  <MousePointerClick className="h-4 w-4" />
                  SEE IT WORK
                </Button>
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.24}>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6">
              {[
                { value: 1.2, suffix: "s", decimals: 1, label: "Median reply time" },
                { value: 100, suffix: "%", label: "Official API calls" },
                { value: 9, suffix: "", label: "Trigger types" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-3 shadow-[3px_3px_0_0_var(--shadow-ink)] odd:-rotate-1 even:rotate-1"
                >
                  <dt className="font-display text-[28px] leading-none tracking-wide">
                    <Counter to={stat.value} suffix={stat.suffix} decimals={stat.decimals ?? 0} />
                  </dt>
                  <dd className="mt-1 text-[11.5px] font-bold leading-snug text-[var(--text-muted)]">
                    {stat.label}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Reveal delay={0.1} y={40}>
          <PhoneDemo />
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

const SCROLLERS = [
  "RECIPE → full method in their DMs",
  "LINK → product page + discount code",
  "GUIDE → 12-week PDF, instantly",
  "@mention → giveaway entry confirmed",
  "story reply → answered in 1.2s",
  "DROP → live-only code, mid-broadcast",
  "PRICE → AI answers from your FAQ",
  "BOOK → calendar link + reminder",
];

function SocialProof() {
  return (
    <section className="halftone border-y-[3px] border-[var(--border)] bg-[var(--bg-subtle)] py-8">
      <p className="mb-5 text-center text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        What creators are automating right now
      </p>
      <Marquee speed={48}>
        {SCROLLERS.map((item) => (
          <span
            key={item}
            className="flex items-center gap-2.5 whitespace-nowrap rounded-full border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] px-4 py-2 text-[13px] font-bold text-[var(--text)] shadow-[3px_3px_0_0_var(--shadow-ink)]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-zap-400)]" />
            {item}
          </span>
        ))}
      </Marquee>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Triggers() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-24">
      <Reveal className="mb-12 max-w-2xl">
        <SectionLabel>Triggers</SectionLabel>
        <h2 className="font-display mt-5 text-[clamp(2.2rem,5vw,3.4rem)] leading-[0.95]">
          Nine ways in. One conversation out.
        </h2>
        <p className="mt-4 text-[16px] font-semibold leading-relaxed text-[var(--text-muted)]">
          Pick what starts the conversation. Everything after that is the same
          engine, so a Reel comment and a Live comment behave identically,
          because they should.
        </p>
      </Reveal>

      <Reveal delay={0.08}>
        <TriggerShowcase />
      </Reveal>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Builder() {
  return (
    <section className="relative overflow-hidden border-y-[3px] border-[var(--border)] bg-[var(--bg-subtle)] py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-1/3 h-[420px] w-[420px] rounded-full bg-[var(--color-kapow-400)] opacity-[0.09] blur-[110px]"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2">
        <Reveal>
          <SectionLabel>Flow builder</SectionLabel>
          <h2 className="font-display mt-5 text-[clamp(2.2rem,5vw,3.4rem)] leading-[0.95]">
            Drag a flow. Not a spreadsheet.
          </h2>
          <p className="mt-4 text-[16px] font-semibold leading-relaxed text-[var(--text-muted)]">
            Send a message, wait twenty minutes, check whether they followed you,
            branch, ask a question, let AI take the rest. Every step is a card you
            drop on a canvas, and the builder tells you the moment a flow would
            outlive Instagram&rsquo;s 24-hour window, before you publish it.
          </p>

          <ul className="mt-7 space-y-3">
            {[
              "16 step types: messages, delays, branches, forms, AI, webhooks",
              "Live validation against Meta's real messaging rules",
              "Funnel view showing exactly where people drop off",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[14.5px]">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                <span className="text-[var(--text-muted)]">{item}</span>
              </li>
            ))}
          </ul>

          <Link href="/signup" className="mt-8 inline-block">
            <Button variant="primary" className="group">
              Build your first flow
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </Reveal>

        <Reveal delay={0.1} y={36}>
          <TiltCard intensity={5}>
            <FlowPreview />
          </TiltCard>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/** Icon chip colours, cycled so the bento grid reads as printed panels. */
const FEATURE_COLORS = [
  "var(--color-pow-400)",
  "var(--color-bam-400)",
  "var(--color-zap-400)",
  "var(--color-boom-400)",
  "var(--color-zonk-400)",
  "var(--color-kapow-400)",
];

const FEATURES = [
  {
    icon: Inbox,
    title: "Unified live inbox",
    body: "Every conversation across every connected account, in one thread list. Jump in whenever automation should step aside. The handover pauses the flow for that person only.",
    span: "lg:col-span-2",
  },
  {
    icon: Bot,
    title: "AI that stays on script",
    body: "Feed it your FAQ and it answers from that, or hands off. It won't invent a shipping time.",
  },
  {
    icon: ClipboardList,
    title: "Forms inside the DM",
    body: "Collect emails, run quizzes, take orders, then export everything to CSV or Excel.",
  },
  {
    icon: Megaphone,
    title: "Broadcasts & re-engagement",
    body: "Message your active contacts, with the eligible count shown before you send. Recurring nudges bring quiet people back.",
  },
  {
    icon: Layers,
    title: "DM Planner",
    body: "Write the automation before the post exists. Drop the draft code in your caption and it wires itself up the moment you publish, from any scheduler.",
    span: "lg:col-span-2",
  },
  {
    icon: Users,
    title: "Contacts that remember",
    body: "Tags, custom fields, follower status, every answer they've given, every flow they've been through.",
  },
  {
    icon: BarChart3,
    title: "Analytics you'd actually act on",
    body: "Sent, opened, clicked, CTR, new followers. Per automation, per step, over time.",
  },
  {
    icon: Puzzle,
    title: "Templates & carousels",
    body: "Reusable messages, CTA buttons, and up to 10 swipeable slides in a single DM.",
  },
];

function Features() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24">
      <Reveal className="mb-12 max-w-2xl">
        <SectionLabel>Everything included</SectionLabel>
        <h2 className="font-display mt-5 text-[clamp(2.2rem,5vw,3.4rem)] leading-[0.95]">
          The whole toolkit, not a starter tier.
        </h2>
        <p className="mt-4 text-[16px] font-semibold leading-relaxed text-[var(--text-muted)]">
          Inbox, AI, forms, broadcasts, planner, analytics, safety. All of it,
          from day one.
        </p>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <Reveal key={feature.title} delay={i * 0.04} className={feature.span}>
              <SpotlightCard className="h-full rounded-[var(--radius-card)] border-[2.5px] border-[var(--border)] bg-[var(--bg-raised)] p-6 shadow-[4px_4px_0_0_var(--shadow-ink)] transition-transform duration-200 hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[7px_7px_0_0_var(--shadow-ink)]">
                <span
                  className="relative mb-4 grid h-11 w-11 place-items-center rounded-xl border-[2.5px] border-[var(--border)] text-[#12110e] shadow-[2px_2px_0_0_var(--shadow-ink)]"
                  style={{ background: FEATURE_COLORS[i % FEATURE_COLORS.length] }}
                >
                  <Icon className="h-[19px] w-[19px]" />
                </span>
                <h3 className="text-[17.5px] font-extrabold">{feature.title}</h3>
                <p className="mt-2 text-[14px] font-medium leading-relaxed text-[var(--text-muted)]">
                  {feature.body}
                </p>
              </SpotlightCard>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Safety() {
  return (
    <section
      id="safety"
      className="relative overflow-hidden border-y-[3px] border-[var(--border)] bg-[var(--bg-subtle)] py-24"
    >
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mb-12 max-w-2xl">
          <SectionLabel>Account safety</SectionLabel>
          <h2 className="font-display mt-5 text-[clamp(2.2rem,5vw,3.4rem)] leading-[0.95]">
            The rules aren&rsquo;t an afterthought.
            <br />
            They&rsquo;re the architecture.
          </h2>
          <p className="mt-4 text-[16px] font-semibold leading-relaxed text-[var(--text-muted)]">
            Most tools bolt safety on. Here, a single dispatcher is the only code
            path that can send anything, and it checks all of this first. If a
            message can&rsquo;t be sent legally, it isn&rsquo;t sent, and you see
            exactly why in the Safety Center.
          </p>
        </Reveal>

        <SafetyGuards />

        <Reveal delay={0.1}>
          <div className="mt-10 flex items-start gap-3.5 rounded-2xl border-[2.5px] border-[var(--border)] bg-[var(--color-boom-400)]/30 shadow-[4px_4px_0_0_var(--shadow-ink)] p-5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-boom-500)]" />
            <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
              <span className="font-medium text-[var(--text)]">
                Nothing here needs your Instagram password.
              </span>{" "}
              You connect through Meta&rsquo;s own login screen, grant scoped
              permissions, and can revoke access from Instagram at any moment.
              Tokens are encrypted at rest and never leave our servers.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Comparison() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-24">
      <Reveal className="mb-10 max-w-2xl">
        <SectionLabel>Honestly compared</SectionLabel>
        <h2 className="font-display mt-5 text-[clamp(2.2rem,5vw,3.4rem)] leading-[0.95]">
          Everything they do. Plus the parts they don&rsquo;t.
        </h2>
      </Reveal>
      <Reveal delay={0.08}>
        <ComparisonTable />
      </Reveal>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

const FAQ_ITEMS = [
  {
    question: "Will this get my Instagram account banned?",
    answer:
      "Not from anything we do. Every action goes through Meta's official Instagram Graph API using permissions you explicitly grant, and our dispatcher refuses to send anything that would break Meta's rules: the 24-hour messaging window, one private reply per comment, published rate limits. We never scrape, never automate follows or likes, and never touch your password.",
  },
  {
    question: "What kind of Instagram account do I need?",
    answer:
      "A professional account (Business or Creator). Both are free to switch to in the Instagram app, and the messaging API only works with them. You don't need a linked Facebook Page: we use Business Login for Instagram, so you connect Instagram directly.",
  },
  {
    question: "Why can't I message anyone I want?",
    answer:
      "Because Instagram doesn't allow it, and that restriction is the reason automation is safe at all. You can message someone within 24 hours of them interacting with you through a comment, a story reply or a DM. Comments give you a separate 7-day private-reply window. Broadcasts show you the eligible count up front, so the limit is never a surprise.",
  },
  {
    question: "What happens when someone replies to an automated DM?",
    answer:
      "Their reply reopens the 24-hour window and lands in your inbox. If a flow is waiting on an answer, it captures it and continues. If you jump into the conversation yourself, automation pauses for that person until you're done.",
  },
  {
    question: "Do I need my own Meta app to use this?",
    answer:
      "No. This runs as a Meta tech provider app. You just click connect and approve the permissions on Instagram's own screen. Self-hosting is also supported if you'd rather run it under your own Meta app credentials.",
  },
  {
    question: "How fast does a DM actually go out?",
    answer:
      "Around 1–2 seconds from the comment landing. Instagram sends us a webhook the instant it happens, we match your keyword and dispatch immediately. Delayed follow-up steps run on a durable queue, so a deploy or restart never loses them.",
  },
];

function Faq() {
  return (
    <section className="border-y-[3px] border-[var(--border)] bg-[var(--bg-subtle)] py-24">
      <div className="mx-auto grid max-w-5xl gap-10 px-5 lg:grid-cols-[minmax(0,300px)_1fr]">
        <Reveal>
          <SectionLabel>Questions</SectionLabel>
          <h2 className="font-display mt-5 text-[clamp(2rem,4vw,2.8rem)] leading-[0.95]">
            The things people ask before signing up.
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <Accordion items={FAQ_ITEMS} />
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="relative overflow-hidden py-28">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="impact-rays radial-fade absolute inset-0 opacity-80" />
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-pow-400)] opacity-25 blur-3xl" />
      </div>

      <Reveal className="mx-auto max-w-2xl px-5 text-center">
        <h2 className="font-display text-[clamp(2.4rem,6vw,3.8rem)] leading-[0.94]">
          <span className="block -rotate-1">Stop losing the people</span>
          <span className="text-pop mt-1 block rotate-1">WHO ALREADY RAISED THEIR HAND.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-[16.5px] leading-relaxed text-[var(--text-muted)]">
          They commented. They replied to your story. They asked a question at
          2am. Set it up once and none of them go unanswered again.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup">
            <Button variant="gradient" size="lg" className="group">
              CREATE YOUR ACCOUNT
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="ghost" size="lg">
              I already have one
            </Button>
          </Link>
        </div>
        <p className="mt-5 text-[12.5px] text-[var(--text-faint)]">
          Connect an Instagram professional account · revoke any time
        </p>
      </Reveal>
    </section>
  );
}
