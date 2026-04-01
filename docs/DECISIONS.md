# Decision Log

> **This file records significant technical and design decisions.**
> When you choose one approach over another, document it here so future agents and developers understand *why* the codebase looks the way it does.
>
> Agents: append new decisions at the top using the template below.

---

## Template

<!--
### [YYYY-MM-DD] — [Short title]
**Context:** What situation or problem prompted this decision?
**Decision:** What was decided?
**Alternatives considered:** What else was considered and why was it rejected?
**Consequences:** What are the implications? Any tradeoffs?
**Decided by:** [Agent name / developer]
-->

---

## Decisions

<!-- Add new decisions below this line, newest first -->

### [YYYY-MM-DD] — [Example: Chose Neon over Supabase Postgres for this project]
**Context:** [Needed a Postgres database. Project already uses Supabase for storage but needed a separate DB for performance isolation.]
**Decision:** [Use Neon for primary database, keep Supabase for file storage only.]
**Alternatives considered:** [Supabase Postgres — rejected because we wanted to avoid coupling all services to one provider. PlanetScale — rejected because we needed Postgres compatibility.]
**Consequences:** [Two database dashboards to manage. Need separate connection strings. But better separation of concerns and can scale DB independently.]
**Decided by:** [Developer / Claude Code / Codex]
