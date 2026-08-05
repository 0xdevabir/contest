import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
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
  if (session.role !== "ADMIN") redirect("/");

  return (
    <div className="flex min-h-screen bg-[#080b10]">
      <AdminSidebar adminName={session.name} />
      <div className="min-w-0 flex-1 overflow-x-hidden bg-[#0a0f16]">{children}</div>
    </div>
  );
}
