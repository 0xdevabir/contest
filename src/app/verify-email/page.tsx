import { Suspense } from "react";
import type { Metadata } from "next";
import VerifyEmailClient from "./VerifyEmailClient";

export const metadata: Metadata = {
  title: "Verify your email",
  description:
    "Confirm your email address to activate your DIU ContestHub account.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/verify-email" },
};

export default function VerifyEmailPage() {
  return (
    <div className="px-4 py-16 sm:px-6">
      <Suspense
        fallback={
          <div className="panel mx-auto max-w-md p-6 text-center text-sm text-[var(--muted)]">
            Loading…
          </div>
        }
      >
        <VerifyEmailClient />
      </Suspense>
    </div>
  );
}
