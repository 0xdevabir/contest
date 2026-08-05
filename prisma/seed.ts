import { PrismaClient, University } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ProblemBank } from "../src/lib/types";
import { defaultContestRules } from "../src/lib/validators";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Contest Admin";
  let admin;

  if (email || password) {
    if (!email || !password) {
      throw new Error("Set both ADMIN_EMAIL and ADMIN_PASSWORD, or leave both unset");
    }
    if (password.length < 12) {
      throw new Error("ADMIN_PASSWORD must be at least 12 characters");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    admin = await prisma.user.upsert({
      where: { email },
      update: {
        role: "ADMIN",
        passwordHash,
        name,
        emailVerified: new Date(),
      },
      create: {
        email,
        name,
        passwordHash,
        university: University.DIU,
        role: "ADMIN",
        emailVerified: new Date(),
        department: "CSE",
      },
    });
  } else {
    admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
    });
    if (!admin) {
      throw new Error(
        "No admin exists. Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first admin"
      );
    }
  }

  console.log(`Admin ready: ${admin.email}`);

  const bankPath = path.join(process.cwd(), "data", "problems.json");
  const bank = JSON.parse(readFileSync(bankPath, "utf8")) as ProblemBank;
  let created = 0;

  for (const set of bank.sets) {
    const slug = `set-${String(set.set).padStart(2, "0")}-contest`;
    const existing = await prisma.contest.findUnique({ where: { slug } });
    if (existing) continue;

    await prisma.contest.create({
      data: {
        slug,
        title: `Set ${String(set.set).padStart(2, "0")} — ${set.title}`,
        description: `A ${set.problems.length}-problem C programming contest based on Set ${set.set}.`,
        status: "DRAFT",
        durationMinutes: 120,
        rules: defaultContestRules,
        createdById: admin.id,
        problems: {
          create: set.problems.map((problem, index) => ({
            problemId: problem.id,
            order: index,
            points: 100,
            label: String.fromCharCode(65 + index),
          })),
        },
      },
    });
    created++;
  }

  console.log(
    `${created} draft contests created; ${bank.sets.length - created} already existed.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


