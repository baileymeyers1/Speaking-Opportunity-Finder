// Prints the demo database's direct URL with Prisma's schema parameter, for `prisma db push` in the demo
// build (scripts/deploy-demo.sh). The demo's tables live in their own schema of the shared demo database.
const raw = process.env.DEMO_DATABASE_URL_UNPOOLED || process.env.DEMO_DATABASE_URL;
if (!raw) {
  console.error('DEMO_DATABASE_URL_UNPOOLED is not set');
  process.exit(1);
}
const url = new URL(raw);
url.searchParams.set('schema', 'speaking_demo');
process.stdout.write(url.toString());
