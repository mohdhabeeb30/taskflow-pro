# Testing

## Summary

The repository currently has 4 Vitest files and 40 tests:

| File | Tests | Coverage |
| --- | ---: | --- |
| `server/tests/engine.test.ts` | 19 | Cycle paths, duplicate/self-edge rules, graph traversal, topological order, blocked status, regression propagation, schedule propagation, and performance/visit scope. |
| `server/tests/api.test.ts` | 10 | Session auth, public board access, cookie login, generic credential errors, secret/log suppression, header bypass rejection, task/dependency behavior, AI auth, and mock AI caching. |
| `server/tests/ai.test.ts` | 10 | Grounded target-task prompt, reason-bearing schema, hallucinated IDs, self-dependencies, duplicates, cycles, invalid JSON, empty output, cache behavior, mock provider, timeout, missing key, and quota response. |
| `server/tests/status-mapping.test.ts` | 1 | Database-to-engine status mapping. |

## Commands

```sh
npm test
npm run typecheck
npm run build
```

`npm test` runs Vitest once. `npm run typecheck` runs strict TypeScript checking without emitting files. `npm run build` runs the typecheck and creates the Vite production bundle.

## Known failure cases

No known failing test cases remain in the current repository; the full suite passes with 40 tests. Expected runtime failures are covered as behavior rather than treated as test failures: unauthenticated writes return 401, invalid AI JSON is rejected, invalid dependency suggestions are returned with reasons, Gemini timeout/missing-key/provider-quota errors return explicit API errors, and a blocked forward move returns `BLOCKED_MOVE`.
