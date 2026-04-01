# Setup & Development Guide

> **How to get this project running locally and deploy it.**
> Agents: update this when setup steps change (new dependencies, new env vars, new services).

## Prerequisites
- Node.js [version]
- [Package manager: npm / pnpm / yarn / bun]
- [Any other prerequisites]

## Quick Start

```bash
# 1. Clone the repo
git clone [repo-url]
cd [project-name]

# 2. Install dependencies
[npm install / pnpm install / etc.]

# 3. Set up environment variables
cp .env.example .env.local
# Then fill in values — see Environment Variables section below

# 4. Set up the database
[e.g., npx prisma migrate dev / npx drizzle-kit push / etc.]

# 5. Run the dev server
[npm run dev / etc.]
```

## Environment Variables

> Copy `.env.example` to `.env.local` and fill in these values:

| Variable | Required | Where to Get It | Notes |
|----------|----------|-----------------|-------|
| `DATABASE_URL` | Yes | [Dashboard URL] | [Connection pooling URL recommended] |
| `CLERK_SECRET_KEY` | Yes | [Clerk dashboard] | |
| `CLERK_PUBLISHABLE_KEY` | Yes | [Clerk dashboard] | |
| `BREVO_API_KEY` | Yes | [Brevo dashboard] | |
| ... | ... | ... | ... |

## Database

### Provider: [Supabase / Neon / Firestore]
### ORM: [Prisma / Drizzle / none]

```bash
# Generate types (if applicable)
[npx prisma generate / npx drizzle-kit generate / etc.]

# Run migrations
[npx prisma migrate dev / npx drizzle-kit push / etc.]

# Open database studio
[npx prisma studio / npx drizzle-kit studio / etc.]
```

## Development Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run linter |
| `npm run test` | Run tests (if applicable) |
| ... | ... |

## Deployment

### Production: [Vercel / Render / etc.]
- [Auto-deploys from `main` branch / manual deploy / etc.]
- [Post-deploy steps if any]

### Environment-Specific Notes
- **Dev:** [Any dev-specific setup]
- **Staging:** [Any staging-specific setup]  
- **Prod:** [Any prod-specific cautions]

## Troubleshooting

### Common Issues
- [e.g., "Module not found" → Run `npm install` / clear `.next` cache]
- [e.g., Database connection fails → Check `DATABASE_URL` uses pooling URL]

### Useful Debug Commands
```bash
# [e.g., Check database connection]
# [e.g., Clear build cache]
# [e.g., Reset local database]
```
