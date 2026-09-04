import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isEnabled } from "@/lib/flags";
import { PageHeader } from "@/components/PageHeader";
import { WebhooksManager } from "@/components/profile/WebhooksManager";

export default async function WebhooksPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/profile/webhooks");

  const enabled = await isEnabled("platformApi", { userId: session.id, role: session.role });
  if (!enabled) redirect("/profile/settings");

  return (
    <div>
      <PageHeader
        eyebrow="Developers"
        title="Webhooks"
        lead="HMAC-signed event delivery, owned by one of your API keys. Retries on failure, disables after 5 in a row."
      />
      <div className="mt-8">
        <WebhooksManager />
      </div>
    </div>
  );
}
