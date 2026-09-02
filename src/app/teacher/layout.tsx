import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/authz";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Teacher",
};

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/teacher/problems");
  if (!can(session, "problem:create")) redirect("/");

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="border-b border-[var(--line)] bg-[var(--bg-panel)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/teacher/problems" className="font-display text-sm font-bold">
            Teacher · Problems
          </Link>
          <span className="text-xs text-[var(--muted)]">{session.name}</span>
        </div>
      </div>
      {children}
    </div>
  );
}
