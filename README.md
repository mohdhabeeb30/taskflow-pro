# TaskFlow Pro

## Overview

TaskFlow Pro is a Kanban board for work managed as a dependency DAG. The Express server persists tasks, dependencies, users, sessions, and audit events in SQLite, while a Vite-served React client provides authenticated board editing. Gemini can suggest missing prerequisites, but every suggestion is validated by the server before it reaches the UI.

## Setup

### Prerequisites

- Node.js 20 or newer
- npm
- A Gemini API key for real AI suggestions. Create a free key in [Google AI Studio](https://aistudio.google.com/app/apikey).

### Install

```sh
npm install
cp .env.example .env
```

Set the values in `.env`:

| Variable | Purpose |
| --- | --- |
| `PORT` | API port; defaults to `3000`. |
| `DB_PATH` | SQLite path; defaults to `./data/taskflow.sqlite`. |
| `LLM_PROVIDER` | `gemini` for the demo, or `mock` for local UI work only. |
| `LLM_API_KEY` | Gemini key from Google AI Studio. Never send it to the client. |
| `LLM_MODEL` | Gemini model; defaults to `gemini-3.5-flash-lite`. |
| `LLM_FALLBACK_MODEL` | Reserved environment value; the current provider does not use it. |
| `SEED_USER_EMAIL` | Email created by `npm run seed`. |
| `SEED_USER_PASSWORD` | Password hashed with bcrypt for the seeded user. |

The demo must use `LLM_PROVIDER=gemini`. `LLM_PROVIDER=mock` returns configured mock output and is intended only for local UI work; the client labels it `Mock data`.

### Seed and run

```sh
npm run seed
npm run dev
npm run dev:client
```

The API runs on `http://localhost:3000`. The Vite client runs on `http://localhost:5173` and proxies `/api` to the API. `npm run seed` recreates the seeded tasks, dependencies, user, and audit entry, so do not run it against data you need to preserve.

### Test

```sh
npm test
npm run typecheck
npm run build
```

See [TESTING.md](TESTING.md) for the full test inventory.

## Demo walkthrough

1. Log in with the seeded `SEED_USER_EMAIL` and `SEED_USER_PASSWORD`.
2. Open the first task in a dependency diamond, extend its end date by three days, and save. The API returns moved downstream tasks; the UI highlights their old and new dates. The schedule engine uses the latest prerequisite date, so the diamond sink moves by the maximum required delay, not the sum of both branch delays: three days, not six, when the fixture has no slack.
3. Edit a task, choose a prerequisite that would close a dependency cycle, and save. The server rejects it with `CYCLE_DETECTED` and a path such as `A -> B -> C -> A`; the modal keeps its form state.
4. Drag a Done task back to In Progress. The board recomputes downstream status immediately, so dependent cards visibly become Blocked before a reload.
5. Open `Run End to End Tests`, click **Suggest dependencies**, and accept the returned `deploy-staging` suggestion when it appears. Acceptance uses the normal dependency endpoint and its cycle validation.

AI output is model-dependent. If Gemini returns no accepted suggestion, the modal shows no pending item; `mock` mode can be used to supply deterministic UI fixtures.

## AI Usage

The authenticated `POST /api/ai/suggest-dependencies` route receives one target task ID. The prompt sends that target separately from the other task summaries and existing dependencies. It asks Gemini for JSON only, with `{taskId, dependsOnId, reason}` for each item, and explicitly asks it to look for missing prerequisites rather than repeat existing links. The template is [docs/ai-prompt.md](docs/ai-prompt.md).

The server applies multiple validation layers: JSON parsing, object shape and non-empty reason checks, target-task matching, task-ID existence, self-dependency rejection, duplicate rejection, and cycle validation against existing edges plus earlier accepted suggestions in the same response. The human decides by accepting or rejecting pending suggestions; accepting calls the ordinary dependency endpoint again.

The service caches the last validated result by a hash of the target task, other tasks, and dependencies. It makes one provider call per uncached click and does not retry. Missing keys, timeouts, provider failures, and quota/rate-limit responses become clear API errors; quota responses use HTTP 429. The current limitations are model variability, an in-memory single-result cache, and no persistent AI history.

## Key Assumptions and Limitations

- The product models one team and one board; users are authenticated, but there is no workspace or multi-team isolation.
- The intended scale is a few hundred tasks. The board recomputes graph status in memory and the client renders the full board.
- Scheduling is push-only: changing a task or adding a dependency can move downstream dates later, but never pulls dates earlier.
- Dependencies are finish-to-start prerequisite edges only. There are no dependency types, lag values, or calendars.
- The synopsis called for Next.js, but this repository uses Vite with a React client because the current server is a small Express API and the existing setup keeps the client development/build path lightweight.

For the system structure and schema, see [DESIGN.md](DESIGN.md).

## Testing

Run `npm test` for the Vitest suite, `npm run typecheck` for strict TypeScript checking, and `npm run build` for typecheck plus the Vite production bundle. See [TESTING.md](TESTING.md).
