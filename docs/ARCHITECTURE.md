# Architecture

> **This document describes the system design, tech stack, and how components connect.**
> Update this whenever the architecture changes (new services, new dependencies, changed data flow).

## Overview
<!-- One paragraph explaining what this project is and does -->
[Project description]

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | [e.g., Next.js 14] | [e.g., App router, server components] |
| Backend/API | [e.g., Next.js API routes / Express on Render] | [e.g., REST API] |
| Database | [e.g., Supabase / Neon / Firestore] | [e.g., Primary data store] |
| Auth | [e.g., Clerk] | [e.g., User authentication & session management] |
| Email | [e.g., Brevo] | [e.g., Transactional & marketing email] |
| Hosting | [e.g., Vercel (frontend) / Render (backend)] | [e.g., Deployment & hosting] |
| Storage | [e.g., Supabase Storage / GCS] | [e.g., File uploads] |

## Project Structure

```
├── /src or /app        — [Description]
├── /server or /api     — [Description]  
├── /lib                — [Description]
├── /components         — [Description]
├── /docs               — Project documentation (this directory)
├── CLAUDE.md           — Claude Code agent instructions
├── AGENTS.md           — Codex / other agent instructions
└── ...
```

## Data Flow
<!-- How data moves through the system. Describe the key flows. -->

### [Flow name, e.g., "User Registration"]
1. [Step 1]
2. [Step 2]
3. [Step 3]

### [Flow name, e.g., "Payment Processing"]
1. [Step 1]
2. [Step 2]
3. [Step 3]

## External Services & Integrations

| Service | What It Does Here | Config Location | Notes |
|---------|-------------------|-----------------|-------|
| [e.g., Clerk] | [Auth] | [`.env` — `CLERK_*`] | [e.g., Webhook at /api/webhooks/clerk] |
| [e.g., Brevo] | [Email] | [`.env` — `BREVO_API_KEY`] | [e.g., Templates managed in Brevo dashboard] |
| [e.g., Stripe] | [Payments] | [`.env` — `STRIPE_*`] | [e.g., Webhook at /api/webhooks/stripe] |

## Environment Variables
<!-- Don't put actual values here. Just document what's needed and where. -->

| Variable | Purpose | Where to Get It |
|----------|---------|-----------------|
| `DATABASE_URL` | [Primary DB connection] | [Supabase/Neon dashboard] |
| `CLERK_SECRET_KEY` | [Auth] | [Clerk dashboard] |
| ... | ... | ... |

## Deployment

### Production
- **Frontend:** [e.g., Vercel — auto-deploys from `main` branch]
- **Backend:** [e.g., Render — auto-deploys from `main` branch]
- **Database:** [e.g., Supabase — production project at [URL]]

### Staging (if applicable)
- [Staging setup details]

### Deploy Process
1. [e.g., Push to `main`]
2. [e.g., Vercel auto-builds and deploys]
3. [e.g., Run migrations if needed: `npx prisma migrate deploy`]

## Key Patterns & Conventions
<!-- Document any patterns the codebase follows so agents maintain consistency -->
- [e.g., All API routes return `{ data, error }` shape]
- [e.g., Database queries go through `/lib/db` — never call Supabase client directly in components]
- [e.g., All server actions are in `/app/actions/`]
- [e.g., Use Zod schemas in `/lib/validators/` for all input validation]
