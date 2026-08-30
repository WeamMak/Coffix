import os
import subprocess
import sys
from collections.abc import AsyncIterator
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

BACKEND_ROOT = Path(__file__).parents[1]


def run_alembic(database_url: str, *args: str) -> None:
    environment = os.environ.copy()
    environment.update({"APP_ENV": "test", "DATABASE_URL": database_url})
    subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", *args],
        cwd=BACKEND_ROOT,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )


@pytest_asyncio.fixture
async def migrated_database_url() -> AsyncIterator[str]:
    database_name = f"coffix_test_{uuid4().hex}"
    admin = await asyncpg.connect(
        host="127.0.0.1",
        port=5432,
        user="coffix",
        password="coffix_local",
        database="postgres",
    )
    await admin.execute(f'CREATE DATABASE "{database_name}"')
    database_url = f"postgresql+asyncpg://coffix:coffix_local@127.0.0.1:5432/{database_name}"

    try:
        run_alembic(database_url, "upgrade", "head")
        yield database_url
    finally:
        await admin.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = $1 AND pid <> pg_backend_pid()",
            database_name,
        )
        await admin.execute(f'DROP DATABASE "{database_name}"')
        await admin.close()


@pytest_asyncio.fixture
async def database_session(migrated_database_url: str) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(migrated_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            yield session
    finally:
        await engine.dispose()
