# Local Android Development Guide Design

## Goal

Add one practical guide that takes a developer from opening Coffix in VS Code with WSL through running the mobile application in Expo Go on an Android emulator, then shutting every development process down cleanly.

## Location and discoverability

- Create `docs/README.md` as the operational development guide.
- Add a link named `Local Android development guide` to the root `README.md` documentation list.
- Do not duplicate the product specification or implementation plan.

## Intended reader

The reader uses Windows, VS Code connected to WSL, Docker Desktop, and an Android Studio emulator. The instructions assume the repository is at `~/Coffix` inside WSL.

## Guide structure

1. **First-time setup**
   - Confirm required tools with `bash scripts/check-local-tooling.sh`.
   - Install locked dependencies with `make bootstrap`.
   - Copy the backend and mobile example environment files only when the corresponding local files do not already exist.
   - Explain that the Android emulator reaches the WSL-hosted API at `http://10.0.2.2:8000` and that local OTP uses code `123456`.
2. **Daily startup**
   - Open `~/Coffix` through VS Code's WSL connection.
   - Start Docker Desktop and an Android emulator.
   - In one WSL terminal, run `make dev`. The existing Make target starts PostgreSQL and Redis, then runs FastAPI with reload restricted to `backend/src`.
   - In a second WSL terminal, run `corepack pnpm --dir mobile start`, wait for Metro, and press `a` to open Expo Go on the running emulator.
   - Include simple API, Docker, and app readiness checks.
3. **Daily shutdown**
   - Press `Ctrl+C` in the Expo terminal.
   - Press `Ctrl+C` in the `make dev` terminal.
   - Run `docker compose stop` because the database and Redis containers are detached.
   - Stop the Android emulator from Android Studio Device Manager.
   - Verify that no FastAPI, Uvicorn, Expo, or Metro process remains.
4. **Optional complete WSL shutdown**
   - Close WSL terminals and VS Code WSL windows, quit Docker Desktop, then run `wsl --shutdown` from Windows PowerShell.
   - Clarify that WSL starts automatically the next time the project is opened and that shutdown does not delete project files or Docker volumes.
5. **Troubleshooting**
   - Explain how to find and interrupt orphaned process groups without using hard kills by default.
   - Explain that `docker compose stop` preserves data.
   - Note that the Android emulator is a separate Windows process and its memory is not part of the application backend.

## Safety and scope

- Use the repository's existing commands and configuration; do not introduce scripts, dependencies, services, or architectural changes.
- Never advise `kill -9` as the normal shutdown path.
- Clearly distinguish commands run in WSL from commands run in Windows PowerShell.
- Keep first-time setup separate from the shorter daily workflow.
- Do not tell developers to start a second backend or Expo process when one is already running.

## Verification

- Check every documented command against the root `Makefile`, `mobile/package.json`, and example environment files.
- Verify internal Markdown links and run `git diff --check`.
- No server, emulator, watcher, or container needs to be started to validate this documentation-only change.
