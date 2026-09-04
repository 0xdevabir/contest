import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";

type Props = { searchParams: Promise<{ page?: string }> };

export default async function NotificationsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect("/login?next=/notifications");

  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);
  const take = 30;

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: { id: true, title: true, body: true, href: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId: session.id } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / take));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader eyebrow="Notifications" title="Notification history" lead={`${total} notification${total === 1 ? "" : "s"} on your account.`} />

      <div className="panel mt-8 divide-y divide-[var(--line)] overflow-hidden">
        {items.length === 0 ? (
          <p className="px-5 py-10 text-sm text-[var(--muted)]">Nothing yet.</p>
        ) : (
          items.map((n) => {
            const content = (
              <div className={`flex items-start gap-3 px-5 py-4 ${n.href ? "hover:bg-[var(--hover)]" : ""}`}>
                {!n.readAt ? <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden /> : <span className="mt-1.5 size-1.5 shrink-0" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body ? <p className="mt-0.5 text-sm text-[var(--muted)]">{n.body}</p> : null}
                  <p className="mt-1 font-mono text-[11px] text-[var(--muted-dim)]">
                    {n.createdAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
            return n.href ? (
              <Link key={n.id} href={n.href}>
                {content}
              </Link>
            ) : (
              <div key={n.id}>{content}</div>
            );
          })
        )}
      </div>

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={`/notifications?page=${page - 1}`} className="btn btn-ghost !py-2 !text-xs">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="font-mono text-[11px] text-[var(--muted-dim)]">
            Page {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={`/notifications?page=${page + 1}`} className="btn btn-ghost !py-2 !text-xs">
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
