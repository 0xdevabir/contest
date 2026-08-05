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
        className="hidden max-w-[140px] truncate text-[var(--text)] transition-colors hover:text-[var(--accent)] sm:inline"
        title={`${user.name} · ${user.email}`}
      >
        {user.name}
      </Link>
      <Link href="/profile" className="btn btn-ghost !px-3 !py-2 !text-xs sm:hidden">
        Profile
      </Link>
      <button type="button" onClick={logout} className="btn btn-ghost !px-3 !py-2 !text-xs">
        Log out
      </button>
    </>
  );
}
