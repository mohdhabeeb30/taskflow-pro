# Assumptions

- The first implementation uses a single root package with server-side TypeScript and a later Vite client workspace; this keeps engine tests fast during the sprint.
- Task dates are ISO calendar dates (`YYYY-MM-DD`), and duration is the inclusive number of calendar days between start and end.
- A dependency `task_id -> depends_on_id` means `task_id` cannot proceed until `depends_on_id` is Done.
