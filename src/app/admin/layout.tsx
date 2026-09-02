import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/authz";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (!can(session, "system:admin")) redirect("/");

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <AdminSidebar adminName={session.name} />
      <div className="min-w-0 flex-1 overflow-x-hidden bg-[var(--bg-elevated)]">{children}</div>
    </div>
  );
}
