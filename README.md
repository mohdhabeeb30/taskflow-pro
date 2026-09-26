# TaskFlow Pro

## Overview

TaskFlow Pro is a Kanban board backed by a dependency DAG. Development uses plain HTTP; production HTTPS is provided by the hosting platform.

## Setup

Node 20 is required. Copy `.env.example` to `.env`, set `SEED_USER_EMAIL` and `SEED_USER_PASSWORD`, then run `npm install`. Run `npm run seed` to create the SQLite database, demo user, tasks, and dependencies. Start the API with `npm run dev` and the React board with `npm run dev:client`; the Vite development server proxies `/api` to `http://localhost:3000`. The server uses `DB_PATH` when set, otherwise `./data/taskflow.sqlite`.

## Architecture

The server owns SQLite persistence, cookie-backed authentication, the dependency engine, and the LLM provider boundary. `POST /api/auth/login` verifies the seeded user's bcrypt password and stores only a SHA-256 session-token hash in SQLite; the raw opaque token is returned only as an `httpOnly`, `SameSite=Lax` cookie. `GET /api/auth/me` reports the authenticated user and `POST /api/auth/logout` invalidates the current session. `GET /api/board` is public; task and dependency writes require a valid session. The React client checks `/api/auth/me` before rendering, loads the board on mount, and uses `@dnd-kit` for optimistic movement between and within columns. CRUD is handled in a modal; failed moves restore the prior card position and display a toast.

## Key Assumptions and Limitations

Dates use ISO calendar dates (`YYYY-MM-DD`). The dependency engine is pure and is tested independently of persistence. Sessions expire after eight hours, and login attempts are limited to five per client IP per minute.

## AI Usage

The server may use Gemini for prerequisite suggestions. API keys remain in environment variables and are never sent to the client.

## Testing

Run `npm test` for unit tests and `npm run typecheck` for the strict TypeScript check.

## Deployment

Production requires the database and seed environment variables. HTTPS is supplied by the hosting platform; secure cookies are enabled when `NODE_ENV=production`.
