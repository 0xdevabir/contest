"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function VerifyEmailClient() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"loading" | "ok" | "err">("loading");
  const [message, setMessage] = useState("Verifying…");

  useEffect(() => {
    if (!token) {
      setStatus("err");
      setMessage("Missing verification token.");
      return;
    }
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setStatus("err");
          setMessage(data.message || "Verification failed");
          return;
        }
        setStatus("ok");
        setMessage("Email verified. Redirecting…");
        setTimeout(() => {
          router.push("/sets");
          router.refresh();
        }, 1200);
      })
      .catch(() => {
        setStatus("err");
        setMessage("Network error");
      });
  }, [token, router]);

  return (
    <div className="panel mx-auto max-w-md p-6 text-center">
      <h1 className="font-display text-2xl font-700">Email verification</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">{message}</p>
      {status === "err" && (
        <Link href="/login" className="btn btn-ghost mt-4 inline-flex">
          Back to login
        </Link>
      )}
    </div>
  );
}
