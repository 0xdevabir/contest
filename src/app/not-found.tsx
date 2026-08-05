import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "The page you were looking for is not on DIU ContestHub. Try the home page or browse problems.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-5 px-4 py-24 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
        404
      </p>
      <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">
        We could not find that page.
      </h1>
      <p className="text-[var(--muted)]">
        The link is broken, or the contest or problem you are looking for has
        been retired. Try one of the entry points below.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary">
          Go home
        </Link>
        <Link href="/problems" className="btn btn-ghost">
          Browse 700 problems
        </Link>
        <Link href="/contests" className="btn btn-ghost">
          See contests
        </Link>
      </div>
    </div>
  );
}