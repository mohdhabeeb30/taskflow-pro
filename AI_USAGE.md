# AI Usage

## Provenance

- Tool: GitHub Copilot in Visual Studio Code (or equivalent VS Code AI coding assistant/agent extension).
- Model: self-reported as "GitHub Copilot" by the assistant; specific underlying model not independently confirmed.
- Runtime provider/model: Gemini `gemini-3.5-flash-lite` by default, configurable with `LLM_MODEL`.

## Runtime AI feature

- Date/time: 2026-09-27T04:27:07+05:30, commit `7af4bec`
- Tool: GitHub Copilot in Visual Studio Code (or equivalent VS Code AI coding assistant/agent extension).
- Model: self-reported as "GitHub Copilot" by the assistant; specific underlying model not independently confirmed. Runtime Gemini model: `gemini-3.5-flash-lite`.
- Purpose: Suggest missing prerequisite dependencies for one target task.
- Grounding: The prompt includes the target task separately, the other current tasks, and existing dependency edges. The model is instructed to use only provided IDs and return JSON with `taskId`, `dependsOnId`, and `reason`.
- Validation: The server parses JSON, requires the target task ID and a non-empty reason, checks task existence, rejects self-edges and duplicates, and runs cycle validation against existing and earlier accepted suggestions.
- Human decision: Suggestions remain pending in the modal. The user accepts or rejects each one; acceptance calls the normal dependency endpoint.
- Failure behavior: The provider makes no retry loop. Missing keys, timeouts, provider failures, and quota/rate-limit errors are returned as explicit API errors. The last validated result is cached by a hash of the target task, other tasks, and dependencies.
- Local mock: `LLM_PROVIDER=mock` uses `MockProvider` for local UI work and displays `Mock data`. The seeded demo configuration uses Gemini.
- Files: `server/src/ai/provider.ts`, `server/src/ai/prompt.ts`, `server/src/ai/validation.ts`, `server/src/ai/service.ts`, `server/src/api/app.ts`, `client/App.tsx`, `client/api.ts`, and `docs/ai-prompt.md`.
- Tests: `server/tests/ai.test.ts` and the AI route cases in `server/tests/api.test.ts`.

## Earlier implementation entries

- Date/time: 2026-09-25T14:08:42+05:30, commit `2fda023`
- Tool: GitHub Copilot in Visual Studio Code (or equivalent VS Code AI coding assistant/agent extension).
- Model: self-reported as "GitHub Copilot" by the assistant; specific underlying model not independently confirmed.
- Purpose: Complete repository setup, package configuration, and initial project assumptions.

- Date/time: 2026-09-25T14:18:55+05:30, commit `ba744ff`
- Tool: GitHub Copilot in Visual Studio Code (or equivalent VS Code AI coding assistant/agent extension).
- Model: self-reported as "GitHub Copilot" by the assistant; specific underlying model not independently confirmed.
- Purpose: Complete the pure dependency engine, including cycle, status, traversal, schedule, regression, and performance behavior.
- Review: Engine tests were run and the topological-order expectation was corrected after the first test run.

- Date/time: 2026-09-27T03:56:01+05:30, commit `f7f65dd`
- Tool: GitHub Copilot in Visual Studio Code (or equivalent VS Code AI coding assistant/agent extension).
- Model: self-reported as "GitHub Copilot" by the assistant; specific underlying model not independently confirmed.
- Purpose: Add SQLite persistence, seed data, transactional REST API, cookie sessions, authentication, and the initial React board UI.
- Review: API, engine, status-mapping, typecheck, and client build checks were run.

- Date/time: 2026-09-27T04:26:19+05:30, commit `fa3f978`
- Tool: GitHub Copilot in Visual Studio Code (or equivalent VS Code AI coding assistant/agent extension).
- Model: self-reported as "GitHub Copilot" by the assistant; specific underlying model not independently confirmed.
- Purpose: Add dependency management and schedule propagation interactions to the board UI.
- Review: Full tests and production build passed.
