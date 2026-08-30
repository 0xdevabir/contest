import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { toResponse, ValidationError, NotFoundError, ConflictError } from "@/lib/errors";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z
  .object({
    role: z.enum(["USER", "ADMIN"]).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
    emailVerified: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "user:manage");
    const admin = session;
    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ValidationError("Invalid user update");
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, status: true },
    });
    if (!target) throw new NotFoundError("User not found");

    const data = parsed.data;
    if (id === admin.id && (data.role === "USER" || data.status === "SUSPENDED")) {
      throw new ConflictError("You cannot demote or suspend your own account");
    }

    if (
      target.role === "ADMIN" &&
      (data.role === "USER" || data.status === "SUSPENDED")
    ) {
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN", status: "ACTIVE" },
      });
      if (adminCount <= 1) {
        throw new ConflictError("At least one active administrator is required");
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        role: data.role,
        status: data.status,
        ...(data.emailVerified !== undefined
          ? { emailVerified: data.emailVerified ? new Date() : null }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        emailVerified: true,
      },
    });

    await recordAdminAction({
      actorId: admin.id,
      action: "USER_UPDATED",
      targetType: "USER",
      targetId: id,
      details: {
        email: target.email,
        changed: Object.keys(data),
      },
    });

    return NextResponse.json({ ok: true, user });
  } catch (err) {
    return toResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await getSession();
    assertCan(session, "user:manage");
    const admin = session;
    const { id } = await params;
    if (id === admin.id) {
      throw new ConflictError("You cannot delete your own account");
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });
    if (!target) throw new NotFoundError("User not found");
    if (target.role === "ADMIN") {
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN", status: "ACTIVE" },
      });
      if (adminCount <= 1) {
        throw new ConflictError("The last active administrator cannot be deleted");
      }
    }

    await prisma.user.delete({ where: { id } });
    await recordAdminAction({
      actorId: admin.id,
      action: "USER_DELETED",
      targetType: "USER",
      targetId: id,
      details: { email: target.email },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
