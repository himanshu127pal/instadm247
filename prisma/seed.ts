import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/crypto";
import { PRESETS } from "../src/lib/engine/presets";

/**
 * Demo seed.
 *
 * Creates a workspace with a *demo* Instagram account — `status: "demo"` means
 * the dispatcher records messages as if they were sent instead of calling the
 * API. That makes the whole product explorable before any Meta credentials
 * exist, which is exactly the state the owner will first see it in.
 *
 *   pnpm db:seed
 *   → demo@instadm247.test / demo1234
 */

const prisma = new PrismaClient();

const FIRST_NAMES = [
  "Alex", "Sam", "Jordan", "Casey", "Riley", "Morgan", "Taylor", "Jamie",
  "Avery", "Quinn", "Rowan", "Skyler", "Noor", "Priya", "Diego", "Mei",
  "Leo", "Nina", "Omar", "Zoe",
];
const LAST_NAMES = [
  "Rivera", "Chen", "Okafor", "Silva", "Kim", "Patel", "Novak", "Haddad",
  "Lopez", "Fischer", "Ahmed", "Costa",
];
const TAG_POOL = ["lead", "vip", "waitlist", "buyer", "giveaway-entry", "newsletter"];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
function chance(probability: number): boolean {
  return Math.random() < probability;
}
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

async function main() {
  console.log("Seeding demo data…");

  const email = "demo@instadm247.test";

  // Start clean so re-seeding is idempotent.
  await prisma.user.deleteMany({ where: { email } });
  await prisma.workspace.deleteMany({ where: { slug: "demo-studio" } });

  const user = await prisma.user.create({
    data: {
      email,
      name: "Demo Creator",
      passwordHash: hashPassword("demo1234"),
    },
  });

  const workspace = await prisma.workspace.create({
    data: { name: "Demo Studio", slug: "demo-studio" },
  });
  await prisma.membership.create({
    data: { userId: user.id, workspaceId: workspace.id, role: "owner" },
  });

  const account = await prisma.instagramAccount.create({
    data: {
      workspaceId: workspace.id,
      igUserId: `demo_${Date.now()}`,
      username: "demo.studio",
      name: "Demo Studio",
      accountType: "BUSINESS",
      followersCount: 18_420,
      mediaCount: 12,
      // The dispatcher treats "demo" as simulate-only — no live API calls.
      status: "demo",
      webhookSubbed: true,
      scopes: [
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments",
      ],
      lastSyncAt: new Date(),
    },
  });

  // --- Media ---------------------------------------------------------------

  const captions = [
    "The 60-second miso ramen everyone asks about 🍜",
    "5 things I wish I knew before starting 📓",
    "New drop — the walnut lounge chair 🪑",
    "Behind the scenes of the spring shoot 🌸",
    "Answering your most-asked question",
    "The 12-week strength plan is here 💪",
  ];

  const media = await Promise.all(
    captions.map((caption, i) =>
      prisma.media.create({
        data: {
          accountId: account.id,
          igMediaId: `demo_media_${i}`,
          caption,
          mediaType: i % 3 === 0 ? "REELS" : "IMAGE",
          permalink: `https://instagram.com/p/demo${i}`,
          timestamp: daysAgo(i * 3 + 1),
          commentsCount: 40 + Math.floor(Math.random() * 400),
          likeCount: 800 + Math.floor(Math.random() * 9000),
        },
      }),
    ),
  );

  // --- Automations from the real presets -----------------------------------

  const automationSpecs = [
    { presetId: "comment-to-dm", name: "Comment to DM — LINK", keywords: ["LINK"], mediaIndex: 2 },
    { presetId: "follower-growth", name: "Follower growth — GUIDE", keywords: ["GUIDE"], mediaIndex: 5 },
    { presetId: "lead-capture", name: "Email capture — FREEBIE", keywords: ["FREEBIE"], mediaIndex: 1 },
    { presetId: "story-mention-giveaway", name: "Story mention giveaway", keywords: [] },
    { presetId: "ai-faq", name: "AI answers DMs", keywords: [] },
  ];

  const automations = [];
  for (const spec of automationSpecs) {
    const preset = PRESETS.find((p) => p.id === spec.presetId)!;
    const graph = preset.build();

    const automation = await prisma.automation.create({
      data: {
        accountId: account.id,
        name: spec.name,
        triggerType: preset.triggerType,
        scope: spec.mediaIndex !== undefined ? "SPECIFIC" : "ALL_MEDIA",
        matchMode: preset.matchMode,
        keywords: spec.keywords,
        enabled: true,
        publicReplyEnabled: spec.presetId === "comment-to-dm",
        flow: {
          create: {
            name: `${spec.name} flow`,
            nodes: graph.nodes as object[],
            edges: graph.edges as object[],
          },
        },
        ...(spec.mediaIndex !== undefined
          ? { media: { create: { mediaId: media[spec.mediaIndex].id } } }
          : {}),
      },
    });
    automations.push(automation);
  }

  // --- Contacts, conversations, runs ---------------------------------------

  console.log("Generating contacts and conversations…");

  const contacts = [];
  for (let i = 0; i < 140; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const username = `${first.toLowerCase()}.${last.toLowerCase()}${i}`;

    // Most people interacted recently; a tail of them are outside the window,
    // so the "reachable now" number is realistic rather than 100%.
    const hoursAgo = chance(0.55) ? Math.random() * 22 : 24 + Math.random() * 400;
    const lastInteractionAt = new Date(Date.now() - hoursAgo * 3_600_000);

    const contact = await prisma.contact.create({
      data: {
        accountId: account.id,
        igsid: `demo_igsid_${i}`,
        username,
        name: `${first} ${last}`,
        isFollower: chance(0.62),
        followerCheckedAt: lastInteractionAt,
        tags: chance(0.45) ? [pick(TAG_POOL)] : [],
        optedOut: chance(0.03),
        firstSeenAt: daysAgo(Math.random() * 40),
        lastInteractionAt,
        windowExpiresAt: new Date(lastInteractionAt.getTime() + 24 * 3_600_000),
      },
    });
    contacts.push(contact);
  }

  // Suppression entries for the opted-out contacts, matching what the
  // opt-out handler would have written.
  for (const contact of contacts.filter((c) => c.optedOut)) {
    await prisma.suppressionEntry.create({
      data: { accountId: account.id, igsid: contact.igsid, reason: "opted_out" },
    });
  }

  const SKIP_REASONS = ["WINDOW_EXPIRED", "ALREADY_REPLIED", "OPTED_OUT", "RATE_LIMITED"];

  for (const contact of contacts) {
    const automation = pick(automations);
    const startedAt = contact.lastInteractionAt ?? daysAgo(1);

    const conversation = await prisma.conversation.create({
      data: {
        accountId: account.id,
        contactId: contact.id,
        lastMessageAt: startedAt,
        lastMessagePreview: "Here's the link you asked for 👇",
        unreadCount: chance(0.18) ? 1 + Math.floor(Math.random() * 3) : 0,
        humanTakeover: chance(0.08),
      },
    });

    const run = await prisma.flowRun.create({
      data: {
        accountId: account.id,
        automationId: automation.id,
        contactId: contact.id,
        conversationId: conversation.id,
        status: chance(0.86) ? "completed" : chance(0.5) ? "waiting" : "halted",
        triggerType: automation.triggerType,
        triggerPayload: {
          mediaId: media[0].igMediaId,
          keyword: automation.keywords[0] ?? null,
          timestamp: startedAt.toISOString(),
        },
        startedAt,
        completedAt: startedAt,
      },
    });

    // Inbound message that triggered it.
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contactId: contact.id,
        direction: "inbound",
        kind: "comment",
        text: automation.keywords[0] ?? "Love this!",
        status: "delivered",
        createdAt: startedAt,
      },
    });

    // The outbound reply — most sent, some legitimately skipped.
    const skipped = chance(0.12);
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contactId: contact.id,
        direction: "outbound",
        kind: "text",
        text: "Hey! Here's the link you asked for 👇",
        source: "automation",
        status: skipped ? "skipped" : "sent",
        skipReason: skipped ? pick(SKIP_REASONS) : null,
        sentAt: skipped ? null : startedAt,
        seenAt: !skipped && chance(0.64) ? startedAt : null,
        flowRunId: run.id,
        createdAt: startedAt,
      },
    });

    // Analytics events the rollup will fold into DailyStat.
    const events: Array<{ type: string; createdAt: Date }> = [
      { type: "trigger_fired", createdAt: startedAt },
    ];
    if (!skipped) {
      events.push({ type: "message_sent", createdAt: startedAt });
      if (chance(0.64)) events.push({ type: "message_seen", createdAt: startedAt });
      if (chance(0.27)) events.push({ type: "link_clicked", createdAt: startedAt });
      if (chance(0.09)) events.push({ type: "follow_gained", createdAt: startedAt });
      if (chance(0.14)) events.push({ type: "form_completed", createdAt: startedAt });
    } else {
      events.push({ type: "send_skipped", createdAt: startedAt });
    }

    await prisma.analyticsEvent.createMany({
      data: events.map((event) => ({
        accountId: account.id,
        automationId: automation.id,
        contactId: contact.id,
        type: event.type,
        createdAt: event.createdAt,
      })),
    });
  }

  // --- Supporting content --------------------------------------------------

  await prisma.template.createMany({
    data: [
      {
        workspaceId: workspace.id,
        name: "Shipping answer",
        category: "support",
        payload: {
          kind: "text",
          text: "Hey {{first_name}}! We ship worldwide — UK 2–3 days, EU 5–7, rest of world 7–12. Free over £60 🌍",
        },
      },
      {
        workspaceId: workspace.id,
        name: "Welcome + link",
        category: "welcome",
        payload: {
          kind: "buttons",
          text: "Thanks for following, {{first_name}}! Here's where everything lives 👇",
          buttons: [{ type: "web_url", title: "Browse the shop", url: "https://example.com" }],
        },
      },
    ],
  });

  const form = await prisma.leadForm.create({
    data: {
      workspaceId: workspace.id,
      name: "Waitlist signup",
      kind: "FORM",
      fields: [
        { id: "email", label: "Email address", type: "email", required: true },
        { id: "size", label: "Which size?", type: "choice", required: false, options: ["S", "M", "L"] },
      ],
      successMessage: "You're on the list — we'll email the moment it drops 🎉",
    },
  });

  for (const contact of contacts.slice(0, 24)) {
    await prisma.leadResponse.create({
      data: {
        formId: form.id,
        contactId: contact.id,
        answers: { email: `${contact.username}@example.com`, size: pick(["S", "M", "L"]) },
        completed: true,
      },
    });
  }

  await prisma.trackedLink.createMany({
    data: [
      {
        workspaceId: workspace.id,
        code: "spring24",
        destination: "https://example.com/spring",
        label: "Spring collection",
        clickCount: 412,
      },
      {
        workspaceId: workspace.id,
        code: "guidepdf",
        destination: "https://example.com/guide.pdf",
        label: "12-week guide",
        clickCount: 268,
      },
    ],
  });

  await prisma.iceBreaker.createMany({
    data: [
      { accountId: account.id, question: "Where do you ship to?", order: 0 },
      { accountId: account.id, question: "What's your return policy?", order: 1 },
      { accountId: account.id, question: "Do you do custom pieces?", order: 2 },
    ],
  });

  const agent = await prisma.aiAgent.create({
    data: {
      workspaceId: workspace.id,
      name: "Studio assistant",
      enabled: true,
      persona:
        "You're the assistant for a small ceramics and homeware studio. Help people find the right piece and answer questions about shipping and care.",
      tone: "friendly",
    },
  });

  await prisma.knowledgeDoc.createMany({
    data: [
      {
        workspaceId: workspace.id,
        agentId: agent.id,
        title: "Shipping and delivery",
        content:
          "We ship worldwide from London. UK orders arrive in 2–3 working days, EU in 5–7, and the rest of the world in 7–12. Shipping is free on orders over £60. Every order ships with tracking.",
        keywords: ["shipping", "delivery", "tracking", "worldwide", "free"],
      },
      {
        workspaceId: workspace.id,
        agentId: agent.id,
        title: "Returns",
        content:
          "You can return anything unused within 30 days for a full refund. Custom pieces are made to order and can't be returned unless they arrive damaged.",
        keywords: ["returns", "refund", "damaged", "custom"],
      },
    ],
  });

  await prisma.broadcast.create({
    data: {
      workspaceId: workspace.id,
      accountId: account.id,
      name: "Quiet contacts nudge",
      kind: "REENGAGE",
      payload: {
        kind: "text",
        text: "Hey {{first_name}} — still thinking it over? The code from earlier works until Sunday 👀",
      },
      status: "sent",
      recurring: true,
      reengageAfterHours: 24,
      targetCount: 96,
      eligibleCount: 61,
      sentCount: 58,
      skippedCount: 3,
      completedAt: daysAgo(1),
    },
  });

  await prisma.plannedAutomation.create({
    data: {
      accountId: account.id,
      automationId: automations[0].id,
      name: "Friday drop Reel",
      draftCode: "DM-K7QP2X",
      status: "waiting",
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });

  // Roll the events up so the dashboard has charts on first load.
  const { rollupDailyStats } = await import("../src/lib/engine/analytics");
  await rollupDailyStats(24 * 45);

  console.log(`
Seed complete.

  Sign in at /login
    email:    ${email}
    password: demo1234

  ${contacts.length} contacts · ${automations.length} automations · ${media.length} posts
  The Instagram account is a demo account, so sends are simulated
  rather than hitting the Graph API.
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
