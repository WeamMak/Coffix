# Coffix Repository Instructions

## Sources of Truth

- Follow `docs/spec.md` for product requirements.
- Follow `docs/plan.md` task-by-task and in order.
- Keep implementations simple. Do not add speculative abstractions, dependencies, or unrelated refactors.
- Do not change plan requirements.
- After successfully completing and verifying a plan step, mark its checkbox in `docs/plan.md`.
- Include the current task’s checkbox updates in the task commit.

## Required Context and Skills

Before starting a task:

1. Read the root `README.md`.
2. Read the complete current task in `docs/plan.md` and the relevant sections of `docs/spec.md`.
3. Read any task-local README or documentation for directories that will be modified.
4. Review the available skills and use every skill clearly relevant to the task.
5. Read each selected skill’s `SKILL.md` completely before taking action.
6. State which skills are being used and why.

Use the smallest relevant set of skills. Do not load unrelated skills or documentation. If a required skill is unavailable, report it and continue with the safest reasonable fallback.
## Task and Branch Boundaries

- Implement exactly one numbered plan task per branch.
- Name task branches `feature/task<N>`, for example `feature/task2`.
- Do not use stacked task branches.
- Start a task only after the user confirms the previous task branch was merged into `main`.
- After confirmation, switch to `main`, update it using a fast-forward-only pull, verify the previous task is present, and create the next branch from `main`.
- If `main` cannot be updated with a fast-forward-only pull, stop and report the problem.
- Do not begin the next task automatically after completing the current task.

## Implementation

- Touch only files required by the current task.
- Preserve unrelated and pre-existing user changes.
- Follow existing project conventions and the interfaces defined in the plan.
- Add dependencies only when the current task requires them.
- Never commit secrets, local `.env` files, caches, or generated runtime data.

## Verification

- Run the focused checks specified by the current task.
- Run broader checks only when the change creates meaningful cross-project risk.
- Always run `git diff --check`.
- Do not claim a task is complete when required checks fail.
- Report environmental blockers clearly without over-testing unrelated areas.

## Git Authorization

- Codex may create and switch task branches.
- Codex may stage only files belonging to the current task.
- Codex may commit completed tasks using the commit message specified in `docs/plan.md`.
- Never push or force-push. The user pushes manually.
- Never merge, rebase, amend commits, create pull requests, create tags, or delete branches unless explicitly requested.
- Never use destructive Git commands such as `git reset --hard` or `git clean`.

## Task Handoff

After committing a task, report:

- Branch name and commit SHA.
- What was implemented.
- Checks that passed or failed.
- Any remaining blockers.

Then wait for the user to push and merge the branch before starting the next task.