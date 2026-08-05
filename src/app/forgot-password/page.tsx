import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset your password",
  description:
    "Reset your DIU ContestHub account password. We will email you a secure link to set a new password.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/forgot-password" },
};

export default function ForgotPasswordPage() {
  return (
    <div className="px-4 py-12 sm:px-6">
      <ForgotPasswordForm />
    </div>
  );
}
