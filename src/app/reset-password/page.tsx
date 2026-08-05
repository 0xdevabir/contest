import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

type Props = { searchParams: Promise<{ token?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;
  return (
    <div className="px-4 py-12 sm:px-6">
      <ResetPasswordForm token={token || ""} />
    </div>
  );
}
