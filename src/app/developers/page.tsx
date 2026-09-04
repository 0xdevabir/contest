import { isEnabled } from "@/lib/flags";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";

export default async function DevelopersPage() {
  const session = await getSession();
  const enabled = await isEnabled("platformApi", session ? { userId: session.id, role: session.role } : undefined);

  return (
    <div>
      <PageHeader
        eyebrow="Platform"
        title="ContestHub API"
        lead="A versioned, key-authenticated REST API at /api/v1 — additive-only, with a machine-readable OpenAPI document."
      />

      {!enabled ? (
        <p className="mt-6 text-sm text-[var(--muted)]">
          The public API is not enabled on this deployment yet.
        </p>
      ) : (
        <div className="mt-8 space-y-8 text-sm">
          <section>
            <h2 className="mb-2 text-base font-semibold">Quickstart</h2>
            <p className="mb-3 text-[var(--muted)]">
              Create a scoped key from <a className="underline" href="/profile/api-keys">/profile/api-keys</a>, then:
            </p>
            <pre className="overflow-x-auto rounded-lg border border-[var(--line)] bg-black/30 p-4 text-xs">
{`curl https://your-domain/api/v1/me \\
  -H "Authorization: Bearer chk_live_..."`}
            </pre>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">JavaScript</h2>
            <pre className="overflow-x-auto rounded-lg border border-[var(--line)] bg-black/30 p-4 text-xs">
{`const res = await fetch("/api/v1/problems?limit=20", {
  headers: { Authorization: "Bearer chk_live_..." },
});
const { data, pagination } = await res.json();`}
            </pre>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">Python</h2>
            <pre className="overflow-x-auto rounded-lg border border-[var(--line)] bg-black/30 p-4 text-xs">
{`import requests

res = requests.get(
    "https://your-domain/api/v1/contests/CONTEST_ID/standings",
    headers={"Authorization": "Bearer chk_live_..."},
)
res.raise_for_status()
print(res.json()["data"])`}
            </pre>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">Envelope &amp; errors</h2>
            <p className="text-[var(--muted)]">
              Every success response is <code>{"{ data, pagination? }"}</code>; every error is{" "}
              <code>{"{ error: { code, message, details? } }"}</code> using the same codes as the rest of the app
              (VALIDATION, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, INTERNAL).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">OpenAPI document</h2>
            <p className="text-[var(--muted)]">
              Generated from the same zod schemas the routes validate against — never hand-maintained.{" "}
              <a className="underline" href="/api/v1/openapi.json">
                /api/v1/openapi.json
              </a>
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
