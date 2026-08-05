import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Log in",
  description:
    "Log in to DIU ContestHub to submit solutions, enter contests, and track your ranking on university leaderboards.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/login" },
};

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;

  return (
    <div className="px-4 py-10 sm:px-6 sm:py-12">
      <LoginForm next={next} />
    </div>
  );
}


