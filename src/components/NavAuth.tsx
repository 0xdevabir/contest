"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
        <Link href="/leaderboard" className="link-quiet hidden sm:inline">
          Leaderboard
        </Link>
        <Link href="/contests" className="link-quiet hidden sm:inline">
          Contests
        </Link>
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
      <Link href="/leaderboard" className="link-quiet hidden sm:inline">
        Leaderboard
      </Link>
      <Link href="/contests" className="link-quiet">
        Contests
      </Link>
      {user.role === "ADMIN" && (
        <Link href="/admin" className="text-[var(--accent)] transition-opacity hover:opacity-80">
          Admin
        </Link>
      )}
      <span className="hidden max-w-[140px] truncate text-[var(--text)] sm:inline" title={user.email}>
        {user.name}
      </span>
      <button type="button" onClick={logout} className="btn btn-ghost !px-3 !py-2 !text-xs">
        Log out
      </button>
    </>
  );
}

