# API Reference

> **Document all API endpoints, webhooks, and external API integrations here.**
> Agents: update this when you add, modify, or remove endpoints.

## Internal API Endpoints

### [Group name, e.g., Auth]

| Method | Path | Purpose | Auth Required | Notes |
|--------|------|---------|---------------|-------|
| `POST` | `/api/example` | [Description] | [Yes/No] | [Notes] |

### [Group name, e.g., Users]

| Method | Path | Purpose | Auth Required | Notes |
|--------|------|---------|---------------|-------|
| `GET` | `/api/example` | [Description] | [Yes/No] | [Notes] |

## Webhooks (Incoming)

| Source | Path | Purpose | Verification |
|--------|------|---------|-------------|
| [e.g., Clerk] | `/api/webhooks/clerk` | [User created/updated events] | [Svix signature verification] |
| [e.g., Stripe] | `/api/webhooks/stripe` | [Payment events] | [Stripe signature verification] |

## External APIs (Outgoing)

| Service | SDK/Client | Location in Code | Rate Limits | Notes |
|---------|-----------|-----------------|-------------|-------|
| [e.g., Brevo] | [Brevo SDK] | [`/lib/email.ts`] | [300 emails/day on free tier] | [Templates managed in dashboard] |
| [e.g., OpenAI] | [openai npm] | [`/lib/ai.ts`] | [Varies by tier] | [Using gpt-4o for summaries] |

## Data Shapes
<!-- Document key request/response shapes that agents need to know about -->

### [Shape name, e.g., User object]
```typescript
// Example — replace with actual types
interface User {
  id: string
  email: string
  // ...
}
```
