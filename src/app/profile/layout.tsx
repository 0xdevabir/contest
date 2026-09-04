import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/authz";
import { isEnabled } from "@/lib/flags";
import { isStaffAnywhere } from "@/lib/section-access";
import { ProfileNav } from "@/components/profile/ProfileNav";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/profile");

  // Whether to surface the "Teaching" tab: approved teacher/admin, a
  // pending teacher application, or an active TA on some section. Computed
  // once here so the nav and /profile/teaching agree on the same rule.
  const isTeacher = can(session, "problem:create");
  const isPending = session.role === "TEACHER" && !session.teacherApprovedAt;
  const classroomOn = await isEnabled("classroom", { userId: session.id, role: session.role });
  const isTA = !isTeacher && classroomOn && (await isStaffAnywhere(session.id));
  const teaching = { visible: isTeacher || isPending || isTA, pending: isPending };

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
      <ProfileNav name={session.name} teaching={teaching} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
