import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (session.role !== "ADMIN") redirect("/");

  return (
    <div className="min-h-[calc(100vh-57px)] lg:flex">
      <AdminSidebar adminName={session.name} />
      <div className="min-w-0 flex-1 bg-[#0a0f16]">{children}</div>
    </div>
  );
}
