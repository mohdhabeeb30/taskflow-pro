# Assumptions

- The first implementation uses a single root package with server-side TypeScript and a later Vite client workspace; this keeps engine tests fast during the sprint.
- Task dates are ISO calendar dates (`YYYY-MM-DD`), and duration is the inclusive number of calendar days between start and end.
- A dependency `task_id -> depends_on_id` means `task_id` cannot proceed until `depends_on_id` is Done.
- The API uses one seeded user for the current single-workspace flow; passwords are stored as bcrypt hashes and are never returned.
- Sessions are opaque, database-backed, eight-hour credentials delivered in an `httpOnly`, `SameSite=Lax` cookie. The public surface is limited to `GET /api/board` and login; all other API writes require that session.
- Login throttling is an in-memory limit of five attempts per client IP per minute, so deployments with multiple processes do not share a limiter.
