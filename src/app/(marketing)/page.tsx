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
        <div className="grid-bg radial-fade absolute inset-0" />
        <div className="absolute -left-40 top-0 h-[520px] w-[520px] rounded-full bg-[var(--color-brand-500)] opacity-[0.13] blur-[120px]" />
        <div className="absolute -right-32 top-40 h-[460px] w-[460px] rounded-full bg-[var(--color-flare-500)] opacity-[0.11] blur-[120px]" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.05fr_minmax(0,440px)]">
        <div>
          <Reveal>
            <span className="gradient-ring inline-flex items-center gap-2 rounded-full bg-[var(--bg-raised)] px-3 py-1.5 text-[12.5px] text-[var(--text-muted)]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-[pulse-ring_2.4s_ease-out_infinite] rounded-full bg-emerald-400" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Built on Meta&rsquo;s official Instagram API
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="mt-6 text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-[1.02]">
              Your DMs answer
              <br />
              <span className="text-gradient">while you sleep.</span>
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-[var(--text-muted)]">
              Every comment, story reply, @mention, Live comment and DM becomes a
              conversation — and a sale. Build the flow once, and it runs forever
              on the endpoints Meta actually sanctions.{" "}
              <span className="text-[var(--text)]">No bots. No bans.</span>
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup">
                <Button variant="gradient" size="lg" className="group">
                  Start automating free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button variant="outline" size="lg">
                  <MousePointerClick className="h-4 w-4" />
                  See it work
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
                <div key={stat.label}>
                  <dt className="text-[26px] font-semibold tracking-tight">
                    <Counter to={stat.value} suffix={stat.suffix} decimals={stat.decimals ?? 0} />
                  </dt>
                  <dd className="mt-0.5 text-[12.5px] leading-snug text-[var(--text-faint)]">
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
    <section className="border-y border-[var(--border)] bg-[var(--bg-subtle)] py-8">
      <p className="mb-5 text-center text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-faint)]">
        What creators are automating right now
      </p>
      <Marquee speed={48}>
        {SCROLLERS.map((item) => (
          <span
            key={item}
            className="flex items-center gap-2.5 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--bg-raised)] px-4 py-2 text-[13px] text-[var(--text-muted)]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
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
        <h2 className="mt-5 text-[clamp(1.9rem,4vw,2.9rem)] font-semibold leading-tight">
          Nine ways in. One conversation out.
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed text-[var(--text-muted)]">
          Pick what starts the conversation. Everything after that is the same
          engine — so a Reel comment and a Live comment behave identically,
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
    <section className="relative overflow-hidden border-y border-[var(--border)] bg-[var(--bg-subtle)] py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-1/3 h-[420px] w-[420px] rounded-full bg-[var(--color-brand-500)] opacity-[0.09] blur-[110px]"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2">
        <Reveal>
          <SectionLabel>Flow builder</SectionLabel>
          <h2 className="mt-5 text-[clamp(1.9rem,4vw,2.9rem)] font-semibold leading-tight">
            Drag a flow. Not a spreadsheet.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-[var(--text-muted)]">
            Send a message, wait twenty minutes, check whether they followed you,
            branch, ask a question, let AI take the rest. Every step is a card you
            drop on a canvas — and the builder tells you the moment a flow would
            outlive Instagram&rsquo;s 24-hour window, before you publish it.
          </p>

          <ul className="mt-7 space-y-3">
            {[
              "16 step types — messages, delays, branches, forms, AI, webhooks",
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

const FEATURES = [
  {
    icon: Inbox,
    title: "Unified live inbox",
    body: "Every conversation across every connected account, in one thread list. Jump in whenever automation should step aside — the handover pauses the flow for that person only.",
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
    body: "Collect emails, run quizzes, take orders — then export everything to CSV or Excel.",
  },
  {
    icon: Megaphone,
    title: "Broadcasts & re-engagement",
    body: "Message your active contacts, with the eligible count shown before you send. Recurring nudges bring quiet people back.",
  },
  {
    icon: Layers,
    title: "DM Planner",
    body: "Write the automation before the post exists. Drop the draft code in your caption and it wires itself up the moment you publish — from any scheduler.",
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
    body: "Sent, opened, clicked, CTR, new followers — per automation, per step, over time.",
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
        <h2 className="mt-5 text-[clamp(1.9rem,4vw,2.9rem)] font-semibold leading-tight">
          The whole toolkit, not a starter tier.
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed text-[var(--text-muted)]">
          Inbox, AI, forms, broadcasts, planner, analytics, safety. All of it,
          from day one.
        </p>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <Reveal key={feature.title} delay={i * 0.04} className={feature.span}>
              <SpotlightCard className="h-full rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-raised)] p-6 transition-colors duration-300 hover:border-[var(--border-strong)]">
                <span className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-[var(--bg-sunken)] text-[var(--accent)]">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <h3 className="text-[15.5px] font-semibold">{feature.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-muted)]">
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
      className="relative overflow-hidden border-y border-[var(--border)] bg-[var(--bg-subtle)] py-24"
    >
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mb-12 max-w-2xl">
          <SectionLabel>Account safety</SectionLabel>
          <h2 className="mt-5 text-[clamp(1.9rem,4vw,2.9rem)] font-semibold leading-tight">
            The rules aren&rsquo;t an afterthought.
            <br />
            They&rsquo;re the architecture.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-[var(--text-muted)]">
            Most tools bolt safety on. Here, a single dispatcher is the only code
            path that can send anything — and it checks all of this first. If a
            message can&rsquo;t be sent legally, it isn&rsquo;t sent, and you see
            exactly why in the Safety Center.
          </p>
        </Reveal>

        <SafetyGuards />

        <Reveal delay={0.1}>
          <div className="mt-10 flex items-start gap-3.5 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
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
        <h2 className="mt-5 text-[clamp(1.9rem,4vw,2.9rem)] font-semibold leading-tight">
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
      "Not from anything we do. Every action goes through Meta's official Instagram Graph API using permissions you explicitly grant, and our dispatcher refuses to send anything that would break Meta's rules — the 24-hour messaging window, one private reply per comment, published rate limits. We never scrape, never automate follows or likes, and never touch your password.",
  },
  {
    question: "What kind of Instagram account do I need?",
    answer:
      "A professional account — Business or Creator. Both are free to switch to in the Instagram app, and the messaging API only works with them. You don't need a linked Facebook Page: we use Business Login for Instagram, so you connect Instagram directly.",
  },
  {
    question: "Why can't I message anyone I want?",
    answer:
      "Because Instagram doesn't allow it, and that restriction is the reason automation is safe at all. You can message someone within 24 hours of them interacting with you — a comment, a story reply, a DM. Comments give you a separate 7-day private-reply window. Broadcasts show you the eligible count up front, so the limit is never a surprise.",
  },
  {
    question: "What happens when someone replies to an automated DM?",
    answer:
      "Their reply reopens the 24-hour window and lands in your inbox. If a flow is waiting on an answer, it captures it and continues. If you jump into the conversation yourself, automation pauses for that person until you're done.",
  },
  {
    question: "Do I need my own Meta app to use this?",
    answer:
      "No. This runs as a Meta tech provider app — you just click connect and approve the permissions on Instagram's own screen. Self-hosting is also supported if you'd rather run it under your own Meta app credentials.",
  },
  {
    question: "How fast does a DM actually go out?",
    answer:
      "Around 1–2 seconds from the comment landing. Instagram sends us a webhook the instant it happens, we match your keyword and dispatch immediately. Delayed follow-up steps run on a durable queue, so a deploy or restart never loses them.",
  },
];

function Faq() {
  return (
    <section className="border-y border-[var(--border)] bg-[var(--bg-subtle)] py-24">
      <div className="mx-auto grid max-w-5xl gap-10 px-5 lg:grid-cols-[minmax(0,300px)_1fr]">
        <Reveal>
          <SectionLabel>Questions</SectionLabel>
          <h2 className="mt-5 text-[clamp(1.7rem,3.4vw,2.4rem)] font-semibold leading-tight">
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
        <div className="absolute left-1/2 top-1/2 h-[560px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-brand-500)] opacity-[0.12] blur-[130px]" />
      </div>

      <Reveal className="mx-auto max-w-2xl px-5 text-center">
        <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-semibold leading-[1.06]">
          Stop losing the people
          <br />
          <span className="text-gradient">who already raised their hand.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-[16.5px] leading-relaxed text-[var(--text-muted)]">
          They commented. They replied to your story. They asked a question at
          2am. Set it up once and none of them go unanswered again.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup">
            <Button variant="gradient" size="lg" className="group">
              Create your account
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
