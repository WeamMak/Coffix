# Local Android Development Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the complete, safe workflow for running Coffix through Expo Go on an Android emulator and shutting down every local development process.

**Architecture:** Add a single operational guide at `docs/README.md`, organized into one-time setup, daily startup, daily shutdown, full WSL shutdown, and troubleshooting. Link it from the root README so developers can find it without duplicating operational details elsewhere.

**Tech Stack:** Markdown, GNU Make, Docker Compose, FastAPI CLI, pnpm, Expo Go, Android Studio Emulator, WSL 2, VS Code Remote - WSL

## Global Constraints

- Use existing repository commands and configuration only.
- Do not add scripts, dependencies, services, application code, or architectural changes.
- Run no server, emulator, watcher, or container while validating the documentation.
- Distinguish WSL commands from Windows PowerShell commands.
- Use graceful interruption and preserve Docker volumes.

---

### Task 1: Add the local Android development guide

**Files:**
- Create: `docs/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `Makefile` targets, `mobile/package.json` scripts, `backend/.env.example`, `mobile/.env.example`, and Android API fallback configuration.
- Produces: A discoverable daily workflow for Expo Go development on an Android emulator.

- [x] **Step 1: Verify the documented entry points**

Run:

```bash
rg -n "^(dev|services):|fastapi dev" Makefile
rg -n '"start": "expo start"' mobile/package.json
rg -n "10.0.2.2:8000|OTP_DEV_CODE=123456" mobile/.env.example backend/.env.example
```

Expected: `make dev` starts services and FastAPI with `--reload-dir backend/src`; the mobile start script is `expo start`; the Android API address is `http://10.0.2.2:8000`; local OTP is `123456`.

- [x] **Step 2: Create the operational guide**

Create `docs/README.md` with these exact sections and behaviors:

```markdown
# Local Android Development

This guide starts Coffix from VS Code connected to WSL, opens the mobile app in Expo Go on an Android emulator, and shuts everything down cleanly.

## First-time setup

Run tooling validation and `make bootstrap` from `~/Coffix`. Copy example environment files only when local environment files do not exist. State that the Android emulator uses `http://10.0.2.2:8000` and local OTP is `123456`.

## Daily startup

Open Docker Desktop, start the Android emulator, open `~/Coffix` in VS Code through WSL, run `make dev` in the first WSL terminal, and run `corepack pnpm --dir mobile start` in a second WSL terminal. Press `a` after Metro is ready.

## Daily shutdown

Press `Ctrl+C` in Expo, press `Ctrl+C` in `make dev`, run `docker compose stop`, and stop the emulator through Android Studio Device Manager. Verify no backend or Expo process remains.

## Fully release WSL memory

Close WSL terminals and VS Code WSL windows, quit Docker Desktop, and run `wsl --shutdown` in Windows PowerShell. Explain that WSL restarts automatically and no project files or Docker volumes are deleted.

## Troubleshooting

Show read-only process and container checks, graceful orphan cleanup, API reachability checks, and the distinction between WSL and Android emulator memory.
```

Use complete commands and expected outcomes beneath each section. Include a warning not to start duplicate `make dev` or Expo sessions.

- [x] **Step 3: Link the guide from the root README**

Add this item to the existing `## Documentation` list in `README.md`:

```markdown
- [Local Android development guide](docs/README.md)
```

- [x] **Step 4: Validate documentation and repository cleanliness**

Run:

```bash
rg -n "make dev|pnpm --dir mobile start|docker compose stop|wsl --shutdown" docs/README.md
git diff --check
git status --short
```

Expected: all four lifecycle commands appear, whitespace validation passes, and only `README.md`, `docs/README.md`, and this plan's checkbox updates are changed.

- [x] **Step 5: Commit the documentation**

Run:

```bash
git add README.md docs/README.md docs/superpowers/plans/2026-09-02-local-android-development-guide.md
git commit -m "docs: add local Android development guide"
```

Expected: the documentation and completed plan checklist are committed together.
