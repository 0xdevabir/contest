import { permanentRedirect } from "next/navigation";

type Props = { params: Promise<{ set: string }> };

export default async function SetDetailPage({ params }: Props) {
  await params;
  permanentRedirect("/problems");
}
