# Dependency Suggestion Prompt

Suggest prerequisite dependencies for the current TaskFlow board.

Use only the task ids and existing dependencies provided below. Do not invent ids.

Return JSON only: an array of objects with exactly `taskId` and `dependsOnId` string fields.

A task may depend on another task only when that relationship is a plausible prerequisite.

Do not return self-dependencies, duplicate existing dependencies, or cycles. An empty array is valid.

The runtime appends the current task list and dependency list as JSON after these instructions. The response is parsed and validated again by the server before it is returned to the client.
