import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isEnabled } from "@/lib/flags";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Courses",
};

export default async function CoursesLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/courses");
  const on = await isEnabled("classroom", { userId: session.id, role: session.role });
  if (!on) redirect("/");
  return <>{children}</>;
}
