import { getActiveWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/dashboard/bits";
import { FormsView } from "@/components/dashboard/forms-view";

export default async function FormsPage() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return null;

  const forms = await prisma.leadForm.findMany({
    where: { workspaceId: workspace.id },
    include: {
      _count: { select: { responses: true } },
      responses: {
        where: { completed: true },
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Lead forms"
        description="Collect emails, run surveys and quizzes, or take orders, all inside the DM. Answers land on the contact record and export to CSV or Excel."
      />
      <FormsView
        forms={forms.map((form) => ({
          id: form.id,
          name: form.name,
          kind: form.kind,
          fields: (form.fields as Array<{ id: string; label: string; type: string }>) ?? [],
          successMessage: form.successMessage,
          responseCount: form._count.responses,
          completedCount: form.responses.length,
          createdAt: form.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
