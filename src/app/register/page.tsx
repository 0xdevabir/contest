import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { listInstitutions } from "@/lib/institutions";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Register for CodeHub with your institution profile. Free account unlocks submissions, contest registration, leaderboard rankings, and progress tracking.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/register" },
};

type Props = { searchParams: Promise<{ next?: string }> };

export default async function RegisterPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const institutions = await listInstitutions({ limit: 200 });

  return (
    <div className="px-4 py-10 sm:px-6 sm:py-12">
      <RegisterForm next={next} institutions={institutions} />
    </div>
  );
}


