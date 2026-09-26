import { z } from "zod";
import { AuthError } from "@/lib/auth";
import { parseBody, route } from "@/lib/api";
import { isAiConfigured } from "@/lib/env";
import { isImpersonating } from "@/lib/impersonation";
import { PlanLimitError, effectivePlan, requireFeature } from "@/lib/plan";
import { releaseUsage, reserveUsage } from "@/lib/billing/usage";
import { runHelper, type HelperEvent } from "@/lib/helper/run";

export const runtime = "nodejs";
// A question with a couple of lookups can take a while; don't let the platform
// cut the stream off halfway through an answer.
export const maxDuration = 120;

const bodySchema = z.object({
  question: z.string().trim().min(1).max(2000),
  /**
   * Earlier turns, kept by the page. Capped because the whole history is sent
   * to the model with every question: a long chat would otherwise make each
   * new question cost more than the last.
   */
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
    .max(8)
    .default([]),
  page: z
    .string()
    .regex(/^\/dashboard(\/[\w-]+)*$/)
    .optional(),
});

/**
 * The AI Helper. See docs/HELPER.md. Streams newline-delimited JSON events
 * (`HelperEvent`) so the answer appears as it's written.
 */
export const POST = route(async ({ workspace, request }) => {
  // Support can look at a workspace, but not spend its questions or talk to
  // the model on its behalf.
  if (await isImpersonating()) throw new AuthError("The AI Helper is off in support sessions.", 403);
  requireFeature(workspace, "aiHelper");
  if (!isAiConfigured()) {
    console.error("[helper] no model key configured");
    throw new AuthError("The AI Helper is temporarily unavailable on our side. Please try again later.", 503);
  }

  const body = await parseBody(request, bodySchema);

  const reservedAt = new Date();
  if (!(await reserveUsage(workspace, "helper", reservedAt))) {
    const plan = effectivePlan(workspace);
    const upgradeTo = plan.key === "free" ? "pro" : "business";
    const more = plan.key === "business" ? "" : `, or move to ${upgradeTo === "pro" ? "Pro" : "Business"} for more`;
    throw new PlanLimitError(
      `You've used this week's ${plan.limits.helperQuestionsPerWeek} AI Helper questions. They reset on Monday${more}.`,
      upgradeTo,
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: HelperEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let answered = false;
      try {
        for await (const event of runHelper({
          workspace,
          history: body.history,
          question: body.question,
          page: body.page,
          signal: request.signal,
        })) {
          if (event.type === "text" || event.type === "proposal") answered = true;
          send(event);
        }
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("[helper] failed", (error as Error).message);
          send({ type: "error", message: "Something went wrong on our side. Please try again." });
        }
      } finally {
        // Nothing came back, so the question wasn't answered: give it back.
        if (!answered) await releaseUsage(workspace.id, "helper", reservedAt).catch(() => undefined);
        try {
          controller.close();
        } catch {
          // Already closed because the page went away.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
});
