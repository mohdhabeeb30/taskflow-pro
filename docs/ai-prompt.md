# Dependency Suggestion Prompt

For the task below, suggest any plausible missing prerequisite from the other tasks listed, based on its title and description. Most relationships likely already exist in the existing dependencies list, so look specifically for gaps like a task that should logically come before this one but isn't yet linked. If genuinely none, return an empty array, but check carefully before concluding that.

Use only the task ids provided below. Do not invent ids or suggest a prerequisite not listed.

Return JSON only: an array of objects with exactly `taskId`, `dependsOnId`, and `reason` string fields.

Every reason must briefly explain why the prerequisite is plausible for the target task.

Do not return self-dependencies, duplicate existing dependencies, or cycles. An empty array is valid.

The runtime appends the target task, the other task list, and the existing dependency list as JSON after these instructions. The response is parsed and validated again by the server before it is returned to the client.
