import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/authz";
import { isStaffAnywhere } from "@/lib/section-access";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Teacher",
};

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/teacher/problems");

  // Approved teachers (and admins, via `can`) get the full panel — problem
  // and contest authoring plus classroom management. A TA has none of that
  // globally, only section-scoped staff access (see src/lib/section-access.ts),
  // so they're let in here only to reach /teacher/sections/[id]/* — those
  // pages each re-check assertSectionStaff themselves.
  const isTeacher = can(session, "problem:create");
  const isTA = !isTeacher && (await isStaffAnywhere(session.id));
  if (!isTeacher && !isTA) redirect("/");

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="border-b border-[var(--line)] bg-[var(--bg-panel)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href={isTeacher ? "/teacher/problems" : "/teacher/sections"} className="font-display text-sm font-bold">
            {isTeacher ? "Teacher · Problems" : "Teaching · Sections"}
          </Link>
          <span className="text-xs text-[var(--muted)]">{session.name}</span>
        </div>
      </div>
      {children}
    </div>
  );
}
