"""Upgrade a disposable database from the PR base schema, preserving seeded rows."""

import ast
import asyncio
import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import asyncpg
from alembic.config import Config
from alembic.script import ScriptDirectory

ROOT = Path(__file__).resolve().parents[2]


async def main():
    config = Config(str(ROOT / "backend/alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "backend/migrations"))
    scripts = ScriptDirectory.from_config(config)
    assert len(scripts.get_heads()) == 1, "Expected exactly one migration head"
    base = os.environ.get("CI_BASE_SHA", "origin/main")
    if not base or set(base) == {"0"}:
        base = "HEAD"
    paths = (
        subprocess.check_output(
            ["git", "ls-tree", "-r", "--name-only", base, "backend/migrations/versions"]
        )
        .decode()
        .splitlines()
    )
    revisions, parents = set(), set()
    for path in paths:
        if not path.endswith(".py"):
            continue
        old = subprocess.check_output(["git", "show", f"{base}:{path}"])
        assert (ROOT / path).read_bytes() == old, f"Released migration changed: {path}"
        for node in ast.parse(old).body:
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                name = node.target.id
                if name not in {"revision", "down_revision"}:
                    continue
                value = ast.literal_eval(node.value)
            elif isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
                name = node.targets[0].id
                if name not in {"revision", "down_revision"}:
                    continue
                value = ast.literal_eval(node.value)
            else:
                continue
            if name == "revision":
                revisions.add(value)
            if name == "down_revision":
                parents.update(value if isinstance(value, tuple) else (value,))
    heads = revisions - parents
    assert len(heads) == 1, "Base commit must have exactly one migration head"
    baseline = heads.pop()
    name = f"coffix_ci_{uuid4().hex}"
    admin = await asyncpg.connect("postgresql://coffix:coffix_local@127.0.0.1:5432/postgres")
    await admin.execute(f'CREATE DATABASE "{name}"')
    url = f"postgresql+asyncpg://coffix:coffix_local@127.0.0.1:5432/{name}"
    env = {**os.environ, "APP_ENV": "test", "DATABASE_URL": url}

    def command(*args):
        subprocess.run(
            [sys.executable, "-m", "alembic", *args], cwd=ROOT / "backend", env=env, check=True
        )

    try:
        command("upgrade", baseline)
        connection = await asyncpg.connect(url.replace("+asyncpg", ""))
        # A real row in the stable identity table detects accidental data loss.
        user_id = uuid4()
        await connection.execute(
            "INSERT INTO users (id, phone_e164, role, is_active) VALUES ($1, $2, 'customer', true)",
            user_id,
            "+972500009934",
        )
        await connection.close()
        command("upgrade", "head")
        connection = await asyncpg.connect(url.replace("+asyncpg", ""))
        try:
            assert (
                await connection.fetchval("SELECT phone_e164 FROM users WHERE id=$1", user_id)
                == "+972500009934"
            )
            assert (
                await connection.fetchval("SELECT version_num FROM alembic_version")
                == scripts.get_current_head()
            )
        finally:
            await connection.close()
        print(f"Baseline {baseline} -> {scripts.get_current_head()}: PASS; identity preserved")
    finally:
        await admin.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1", name
        )
        await admin.execute(f'DROP DATABASE "{name}"')
        await admin.close()


asyncio.run(main())
