import { LoginForm } from "@/components/auth/LoginForm";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;

  return (
    <div className="px-4 py-12 sm:px-6">
      <LoginForm next={next} />
    </div>
  );
}

