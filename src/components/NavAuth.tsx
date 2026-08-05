"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";
import type { SessionUser } from "@/lib/auth";

export function NavAuth({ user }: { user: SessionUser | null }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  if (!user) {
    return (
      <>
        <Link href="/login" className="link-quiet">
          Log in
        </Link>
        <Link href="/register" className="btn btn-primary !px-3.5 !py-2 !text-xs">
          Register
        </Link>
      </>
    );
  }

  return (
    <>
      {user.role === "ADMIN" && (
        <Link href="/admin" className="text-[var(--accent)] transition-opacity hover:opacity-80">
          Admin
        </Link>
      )}
      <Link
        href="/profile"
        aria-label="Your profile"
        title="Your profile"
        className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--line)] text-[var(--muted)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
      >
        <User size={16} aria-hidden />
      </Link>
      <button type="button" onClick={logout} className="btn btn-ghost !px-3 !py-2 !text-xs">
        Log out
      </button>
    </>
  );
}
