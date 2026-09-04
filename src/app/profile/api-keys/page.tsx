import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isEnabled } from "@/lib/flags";
import { PageHeader } from "@/components/PageHeader";
import { ApiKeysManager } from "@/components/profile/ApiKeysManager";

export default async function ApiKeysPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/profile/api-keys");

  const enabled = await isEnabled("platformApi", { userId: session.id, role: session.role });
  if (!enabled) redirect("/profile/settings");

  return (
    <div>
      <PageHeader
        eyebrow="Developers"
        title="API keys"
        lead="Scoped keys for /api/v1 — create with a subset of scopes, shown once, rotate or revoke anytime."
      />
      <div className="mt-8">
        <ApiKeysManager />
      </div>
    </div>
  );
}
