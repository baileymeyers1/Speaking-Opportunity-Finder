# Agent Instructions

> This file is read by OpenAI Codex and other AI coding agents. For Claude Code instructions, see `CLAUDE.md`. Both files enforce the same documentation standards.

## Before Starting Any Task

1. Read `docs/STATUS.md` to understand current project state.
2. Read `docs/ARCHITECTURE.md` to understand the system design.
3. Read `docs/DECISIONS.md` to understand past decisions and constraints.
4. If the task involves a specific area, check for relevant section docs in `docs/`.

## While Working

- If you make a design decision (chose one approach over another, picked a library, changed a pattern), append it to `docs/DECISIONS.md` using the existing format.
- If you discover a bug, limitation, or tech debt, note it in the appropriate section of `docs/STATUS.md`.
- If you change the architecture (new service, new dependency, changed data flow), update `docs/ARCHITECTURE.md`.

## Before Stopping Work (CRITICAL)

**Every time you finish a task, hit a blocker, or the session is ending, update `docs/STATUS.md` with:**

- What you completed
- What is in progress (if anything is half-done)
- What remains to be done
- Any blockers, open questions, or decisions needed
- Files you modified (brief list)

This is non-negotiable. Another agent (or the developer) will pick up from where you left off using this file. If they can't understand the current state from STATUS.md, the handoff fails.

## Code Standards

- Follow existing patterns in the codebase. If unsure, check recent commits.
- Write clear commit messages that explain *why*, not just *what*.
- Add inline comments only when the *why* is non-obvious.
- Prefer small, focused changes over large sweeping refactors unless explicitly asked.

## Project-Specific Context

<!-- 
  Add project-specific instructions below this line.
  Keep in sync with CLAUDE.md project-specific section.
-->

[Add project-specific instructions here]
