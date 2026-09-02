# Local Android Development

This guide starts Coffix from VS Code connected to WSL, opens the mobile app in Expo Go on an Android emulator, and shuts everything down cleanly.

Commands marked **WSL** run in a VS Code terminal connected to Ubuntu. Commands marked **PowerShell** run in Windows PowerShell.

## First-time setup

Install these tools on Windows before continuing:

- VS Code with the WSL extension
- WSL 2 with Ubuntu
- Docker Desktop with WSL integration enabled
- Android Studio with an Android emulator
- Expo Go installed on the emulator

Open an Ubuntu terminal, then open the project in VS Code:

```bash
cd ~/Coffix
code .
```

Confirm that the lower-left corner of VS Code shows a WSL connection. In a **WSL** terminal, validate the required tools and install the locked dependencies:

```bash
cd ~/Coffix
bash scripts/check-local-tooling.sh
make bootstrap
```

Create local environment files without overwriting existing ones:

```bash
cp -n backend/.env.example backend/.env
cp -n mobile/.env.example mobile/.env
```

The mobile example uses `http://10.0.2.2:8000`. Android emulators use `10.0.2.2` to reach the development machine; `localhost` would point back to the emulator itself. Local authentication uses the fake OTP code `123456`.

For a new database, start Docker Desktop and initialize the schema and demo data:

```bash
make services
uv run --project backend alembic -c backend/alembic.ini upgrade head
uv run --project backend coffix-seed
```

The seed command is safe to run again when Task 19 catalog seed data changes. It prints the demo identities and the fake OTP code.

## Daily startup

Do not start another backend or Expo process if one is already running. Check first when unsure:

```bash
pgrep -af 'make dev|fastapi dev|uvicorn|expo|metro'
```

### 1. Start Windows dependencies

1. Start Docker Desktop and wait until its engine is ready.
2. In Android Studio, open **Device Manager** and start the intended emulator.
3. Wait until the Android home screen is usable.

### 2. Open Coffix in WSL

Open an Ubuntu terminal and run:

```bash
cd ~/Coffix
code .
```

Alternatively, use **WSL: Open Folder in WSL** from the VS Code command palette and select `/home/weam/Coffix`.

Open a VS Code terminal and confirm it is in the repository:

```bash
pwd
```

Expected output:

```text
/home/weam/Coffix
```

### 3. Start PostgreSQL, Redis, and FastAPI

In the first **WSL** terminal, run:

```bash
make dev
```

`make dev` starts the PostgreSQL and Redis containers, waits for them to become healthy, and then starts FastAPI. FastAPI reload is restricted to `backend/src`, so it does not scan `node_modules`, `.git`, or `backend/.venv`.

Leave this terminal open. A successful backend start shows Uvicorn listening on `http://127.0.0.1:8000`.

Optional checks from another **WSL** terminal:

```bash
docker compose ps
curl http://127.0.0.1:8000/health/live
```

The containers should be healthy, and the health endpoint should return a JSON response containing `"status":"live"`.

If migrations changed since the previous run, apply them before testing:

```bash
uv run --project backend alembic -c backend/alembic.ini upgrade head
```

### 4. Start Expo and open Expo Go

In a second **WSL** terminal, run:

```bash
cd ~/Coffix
corepack pnpm --dir mobile start
```

Wait for Metro to become ready, then press `a` in that terminal. Expo Go should open on the running Android emulator and load Coffix.

For the seeded customer account, use:

```text
Phone: +972500000003
OTP:   123456
```

Keep both WSL terminals open while developing:

- Terminal 1: Docker services and FastAPI through `make dev`
- Terminal 2: Expo and Metro

## Daily shutdown

Use this order so no development watcher is left behind.

### 1. Stop Expo and Metro

Focus the terminal running Expo and press:

```text
Ctrl+C
```

Wait for the command prompt to return.

### 2. Stop FastAPI

Focus the terminal running `make dev` and press:

```text
Ctrl+C
```

This stops FastAPI and its reload child. PostgreSQL and Redis remain running because Docker Compose started them in detached mode.

### 3. Stop PostgreSQL and Redis

In a **WSL** terminal at `~/Coffix`, run:

```bash
docker compose stop
```

This preserves the containers, database data, and Docker volumes. Do not use `docker compose down --volumes` for a normal shutdown.

### 4. Stop the Android emulator

In Android Studio **Device Manager**, click the stop button for the running emulator. Its Windows `qemu-system-x86_64` process and memory should then disappear.

### 5. Verify cleanup

In **WSL**, run:

```bash
pgrep -af 'make dev|fastapi dev|uvicorn|expo|metro'
docker compose ps
```

The process command should print nothing. The Compose services should not show a running state.

## Fully release WSL memory

Normal Linux caching can keep `VmmemWSL` memory visible after the application stops. To release the WSL virtual machine completely:

1. Complete the daily shutdown above.
2. Close all VS Code windows connected to WSL.
3. Close all Ubuntu/WSL terminals.
4. Quit Docker Desktop from its Windows system-tray icon.
5. Open **Windows PowerShell** and run:

```powershell
wsl --list --running
wsl --shutdown
```

Wait several seconds. `VmmemWSL` should disappear or fall close to zero. WSL starts automatically the next time you open Ubuntu or a project through VS Code. This does not delete Coffix files, Python or JavaScript dependencies, Docker containers, or database volumes.

## Troubleshooting

### Expo does not open on the emulator

- Confirm the emulator is fully started and Expo Go is installed.
- Focus the Metro terminal and press `a` again.
- Confirm the Expo terminal is running inside WSL from `~/Coffix`.
- Confirm the mobile API URL is `http://10.0.2.2:8000`, not `localhost`.

### The application cannot reach the API

From **WSL**, check the backend:

```bash
curl http://127.0.0.1:8000/health/live
```

Then confirm that `mobile/.env` contains:

```dotenv
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000
```

Restart Expo with `Ctrl+C` followed by `corepack pnpm --dir mobile start` after changing its environment file.

### A server or watcher survived after its terminal closed

Find the process and its process-group ID:

```bash
pgrep -af 'make dev|fastapi dev|uvicorn|expo|metro'
ps -o pid,ppid,pgid,cmd -p <PID>
```

Replace `<PID>` with the reported process ID. Gracefully interrupt the complete process group:

```bash
kill -INT -- -<PGID>
```

Replace `<PGID>` with the value from `ps`, retain the leading minus sign, and then repeat `pgrep` to confirm cleanup. Avoid `kill -9` during normal development because it prevents graceful cleanup.

### WSL memory remains high

Confirm the development processes and containers are stopped, then follow [Fully release WSL memory](#fully-release-wsl-memory). Docker Desktop or a VS Code WSL window can immediately restart WSL, so both must be closed before `wsl --shutdown`.

The Android emulator is a separate Windows process. Its memory is not released by stopping WSL; stop it from Android Studio Device Manager.
