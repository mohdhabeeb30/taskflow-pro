# AI Usage

- Date/time: 2026-09-25, time TODO
- Tool: TODO
- Purpose: Expand the pure dependency engine to the full cycle, status, traversal, scheduling, regression, and performance specification.
- Files touched: `server/src/engine/types.ts`, `server/src/engine/graph.ts`, `server/src/engine/blocked.ts`, `server/src/engine/dependency.ts`, `server/src/engine/movement.ts`, `server/src/engine/schedule.ts`, `server/src/engine/index.ts`, `server/tests/engine.test.ts`
- How reviewed or changed: Reviewed the API signatures and test output; corrected the topological-order expectation after the first test run.

- Date/time: 2026-09-25, time TODO
- Tool: TODO
- Purpose: Add the SQLite migration runner, schema, bcrypt-backed seed user, and idempotent launch seed data.
- Files touched: `server/src/db/migrations.ts`, `server/src/db/database.ts`, `server/src/db/index.ts`, `server/src/seed.ts`, `package.json`, `package-lock.json`
- How reviewed or changed: Ran strict typecheck and ran `npm run seed` twice against a temporary database; fixed absent `.env` handling after the first check.

- Date/time: 2026-09-25, time TODO
- Tool: TODO
- Purpose: Wire the dependency engine to the SQLite database through a validated REST API and add integration coverage plus status mapping coverage.
- Files touched: `server/src/api/app.ts`, `server/src/api/index.ts`, `server/src/api/status-mapping.ts`, `server/src/index.ts`, `server/tests/api.test.ts`, `server/tests/status-mapping.test.ts`, `server/src/engine/blocked.ts`, `server/tests/engine.test.ts`, `package.json`, `package-lock.json`
- How reviewed or changed: Reviewed transaction paths and error shapes; ran 24 tests and strict typecheck, fixing Zod partial parsing, transitive regression blocking, and Kanban column ordering.

- Date/time: 2026-09-25, time TODO
- Tool: TODO
- Purpose: Scaffold the pure dependency engine and initial tests.
- Files touched: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `ASSUMPTIONS.md`, `server/src/engine/*`, `server/tests/engine.test.ts`
- How reviewed or changed: TODO
