import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listInstitutions } from "@/lib/institutions";
import { PageHeader } from "@/components/PageHeader";
import { SettingsForm } from "@/components/profile/SettingsForm";

export default async function ProfileSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/profile/settings");

  const [user, institutions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: {
        name: true,
        email: true,
        bio: true,
        institutionId: true,
        institutionVerifiedAt: true,
        studentId: true,
        department: true,
        theme: true,
        editorFontSize: true,
        profilePublic: true,
        showEmail: true,
      },
    }),
    listInstitutions({ limit: 200 }),
  ]);
  if (!user) redirect("/login");

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Account & preferences"
        lead="Theme, privacy, editor size, and password — kept against your institution profile."
      />
      <div className="mt-8">
        <SettingsForm
          institutions={institutions}
          initial={{
            name: user.name,
            email: user.email,
            bio: user.bio,
            institutionId: user.institutionId ?? "",
            institutionVerified: Boolean(user.institutionVerifiedAt),
            studentId: user.studentId ?? "",
            department: user.department ?? "",
            editorFontSize: user.editorFontSize,
            profilePublic: user.profilePublic,
            showEmail: user.showEmail,
          }}
        />
      </div>
    </div>
  );
}
