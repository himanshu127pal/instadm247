import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth";
import { isAiConfigured } from "@/lib/env";
import { effectivePlan, hasFeature } from "@/lib/plan";
import { PLANS, cheapestPlanWith } from "@/lib/billing/plans";
import { getUsage } from "@/lib/billing/usage";
import { isImpersonating } from "@/lib/impersonation";
import { PageHeader } from "@/components/dashboard/bits";
import { Button, EmptyState } from "@/components/ui";
import { HelperChat } from "@/components/dashboard/helper-chat";

export default async function HelperPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;
  const { from } = await searchParams;

  const header = (
    <PageHeader
      title="AI Helper"
      description="Ask how to do anything in InstaDM247, get a plan for a goal, or find out why an automation didn't send — with step-by-step answers and automations it can draft for you."
    />
  );

  if (!hasFeature(workspace, "aiHelper")) {
    const plan = PLANS[cheapestPlanWith("aiHelper")];
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        {header}
        <EmptyState
          icon={<Sparkles />}
          title={`The AI Helper is part of ${plan.name}`}
          description={`Get step-by-step answers about any feature, automation plans for your goals, and one-click draft automations — ${plan.limits.helperQuestionsPerWeek} questions a week on ${plan.name}.`}
          action={
            <Link href="/dashboard/billing">
              <Button variant="gradient">See plans</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (await isImpersonating()) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        {header}
        <EmptyState icon={<Sparkles />} title="Off in support sessions" description="The AI Helper uses the customer's own questions, so it's unavailable while support is viewing this account." />
      </div>
    );
  }

  const plan = effectivePlan(workspace);
  const limit = plan.limits.helperQuestionsPerWeek;
  const used = (await getUsage(workspace.id)).helper;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {header}
      <HelperChat
        available={isAiConfigured()}
        remaining={Number.isFinite(limit) ? Math.max(0, limit - used) : null}
        upgradeTo={plan.key === "free" ? "Pro" : plan.key === "pro" ? "Business" : undefined}
        from={from && /^\/dashboard(\/[\w-]+)*$/.test(from) ? from : undefined}
      />
    </div>
  );
}
