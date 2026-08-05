import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
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
    const admin = await requireAdmin();
    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: "Invalid user update" },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, status: true },
    });
    if (!target) {
      return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
    }

    const data = parsed.data;
    if (id === admin.id && (data.role === "USER" || data.status === "SUSPENDED")) {
      return NextResponse.json(
        { ok: false, message: "You cannot demote or suspend your own account" },
        { status: 409 }
      );
    }

    if (
      target.role === "ADMIN" &&
      (data.role === "USER" || data.status === "SUSPENDED")
    ) {
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN", status: "ACTIVE" },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { ok: false, message: "At least one active administrator is required" },
          { status: 409 }
        );
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED" || message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, message: "Admin access required" },
        { status: message === "UNAUTHORIZED" ? 401 : 403 }
      );
    }
    console.error(error);
    return NextResponse.json({ ok: false, message: "User update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (id === admin.id) {
      return NextResponse.json(
        { ok: false, message: "You cannot delete your own account" },
        { status: 409 }
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
    }
    if (target.role === "ADMIN") {
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN", status: "ACTIVE" },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { ok: false, message: "The last active administrator cannot be deleted" },
          { status: 409 }
        );
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED" || message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, message: "Admin access required" },
        { status: message === "UNAUTHORIZED" ? 401 : 403 }
      );
    }
    console.error(error);
    return NextResponse.json({ ok: false, message: "User deletion failed" }, { status: 500 });
  }
}
