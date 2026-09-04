import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/authz";
import { PageHeader } from "@/components/PageHeader";
import { ImportManager } from "@/components/teacher/ImportManager";

export default async function TeacherImportPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/teacher/import");
  if (!can(session, "problem:create")) redirect("/");

  return (
    <div>
      <PageHeader
        eyebrow="Teacher"
        title="Import problems"
        lead="Bulk-import from a Polygon package, a generic statement+tests archive, or a CSV question bank. Every import funnels through the same publish gate as a hand-authored problem."
      />
      <div className="mt-8">
        <ImportManager />
      </div>
    </div>
  );
}
