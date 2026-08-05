import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
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

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
      <ProfileNav name={session.name} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
