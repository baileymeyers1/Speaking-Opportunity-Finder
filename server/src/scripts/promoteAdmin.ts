import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function promoteAdmin() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: tsx server/src/scripts/promoteAdmin.ts <email>');
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email },
    data: { isAdmin: true },
  });

  console.log(`Promoted ${user.email} to admin`);
  await prisma.$disconnect();
}

promoteAdmin().catch(console.error);
