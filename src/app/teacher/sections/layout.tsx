import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isEnabled } from "@/lib/flags";

export const dynamic = "force-dynamic";

/** Classroom-specific gate, nested under teacher/layout.tsx's problem:create check. */
export default async function TeacherSectionsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const on = await isEnabled("classroom", session ? { userId: session.id, role: session.role } : undefined);
  if (!on) redirect("/teacher");
  return <>{children}</>;
}
