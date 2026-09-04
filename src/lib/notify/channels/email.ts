import { prisma } from "@/lib/db";
import { log } from "@/lib/log";
import { sendMail, sendTeacherApprovedEmail, appUrl } from "@/lib/mail";
import { buildUnsubscribeUrl } from "../unsubscribe";
import type { NotificationType } from "../types";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]!
  );
}

/**
 * Delivers one notification's email to a batch of users. `type` selects a
 * branded template where one already exists (teacher approval reuses the
 * existing src/lib/mail.ts email rather than a generic one); everything
 * else gets the generic title/body/href template plus a per-type
 * unsubscribe link (D4).
 */
export async function deliverEmailBatch(
  type: NotificationType,
  userIds: string[],
  content: { title: string; body: string; href: string | null }
): Promise<void> {
  if (userIds.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true },
  });

  await Promise.allSettled(
    users.map(async (u) => {
      try {
        if (type === "teacher:approved") {
          await sendTeacherApprovedEmail(u.email, u.name);
          return;
        }
        const unsubUrl = buildUnsubscribeUrl(u.id, type);
        const link = content.href ? appUrl(content.href) : null;
        const safeBody = escapeHtml(content.body);
        await sendMail({
          to: u.email,
          subject: content.title,
          text: `${content.body}${link ? `\n\n${link}` : ""}\n\nUnsubscribe from this type of email: ${unsubUrl}`,
          html: `<p>${safeBody}</p>${link ? `<p><a href="${escapeHtml(link)}">View</a></p>` : ""}<p style="margin-top:24px;font-size:11px;color:#888"><a href="${escapeHtml(unsubUrl)}">Unsubscribe from this type of email</a></p>`,
        });
      } catch (err) {
        log.error("notification email delivery failed", { userId: u.id, type }, err);
      }
    })
  );
}
