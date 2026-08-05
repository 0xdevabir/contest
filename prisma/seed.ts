import { PrismaClient, University } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@contesthub.local";
  const password = process.env.ADMIN_PASSWORD || "admin12345";
  const name = process.env.ADMIN_NAME || "Contest Admin";

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
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

  console.log(`Admin ready: ${admin.email} (password from ADMIN_PASSWORD / default admin12345)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
