import { Suspense } from "react";
import VerifyEmailClient from "./VerifyEmailClient";

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
