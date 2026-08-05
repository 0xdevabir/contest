import { RegisterForm } from "@/components/auth/RegisterForm";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function RegisterPage({ searchParams }: Props) {
  const { next } = await searchParams;

  return (
    <div className="px-4 py-10 sm:px-6 sm:py-12">
      <RegisterForm next={next} />
    </div>
  );
}


