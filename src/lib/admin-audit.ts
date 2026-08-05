import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function recordAdminAction(input: {
  actorId: string;
  action: string;
  targetType: "USER" | "CONTEST" | "SYSTEM";
  targetId?: string | null;
  details?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        details: input.details ?? {},
      },
    });
  } catch (error) {
    // The primary admin operation should not fail because telemetry could not be stored.
    console.error("Failed to record admin audit action", error);
  }
}
