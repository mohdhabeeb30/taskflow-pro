# Assumptions

- The product currently represents one team and one board; there is no workspace or multi-tenant model.
- The intended workload is a few hundred tasks. The API and client load the board into memory for graph status and rendering.
- Task dates are ISO calendar dates (`YYYY-MM-DD`), and schedule propagation is push-only with finish-to-start dependencies.
- A dependency `task_id -> depends_on_id` means `task_id` cannot proceed until `depends_on_id` is Done.
- The seed creates one demo user from `SEED_USER_EMAIL` and `SEED_USER_PASSWORD`; the password is stored only as a bcrypt hash.
- Sessions are opaque, database-backed, eight-hour credentials delivered in an `httpOnly`, `SameSite=Lax` cookie. `GET /api/board` is public; authenticated routes require a session.
- Login throttling is an in-memory limit of five attempts per client IP per minute, so deployments with multiple processes do not share a limiter.
- Gemini suggestions are target-task scoped, return `{taskId, dependsOnId, reason}`, and are validated against the current graph. `mock` is for local UI work only; the demo uses Gemini.
- The client uses Vite rather than Next.js because the current application is a small Express API with a standalone React client.
