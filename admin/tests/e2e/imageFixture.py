"""Disposable image-flow API. Never connects to an application database."""

import asyncio
import os
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

import asyncpg
import uvicorn
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from coffix.api.app import create_app
from coffix.auth.models import AuthSession
from coffix.auth.tokens import create_access_token
from coffix.core.settings import Settings
from coffix.shop.bootstrap import bootstrap
from coffix.users.models import Role
from coffix.users.repository import UserRepository

ROOT = Path(__file__).resolve().parents[3]


async def main() -> None:
    name = f"coffix_test_images_{uuid4().hex}"
    connection = await asyncpg.connect(
        host="127.0.0.1",
        port=5432,
        user="coffix",
        password="coffix_local",
        database="postgres",
    )
    await connection.execute(f'CREATE DATABASE "{name}"')
    url = f"postgresql+asyncpg://coffix:coffix_local@127.0.0.1:5432/{name}"
    try:
        await asyncio.to_thread(
            subprocess.run,
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=ROOT / "backend",
            env={**os.environ, "APP_ENV": "test", "DATABASE_URL": url},
            check=True,
        )
        with TemporaryDirectory(prefix="coffix-images-") as media_root:
            settings = Settings(
                _env_file=None,
                app_env="test",
                database_url=url,
                redis_url="redis://127.0.0.1:6379/14",
                media_local_root=media_root,
                api_public_url="http://localhost:5299",
                admin_public_url="http://localhost:5299",
            )
            await bootstrap(settings)
            sessions = {}
            engine = create_async_engine(url)
            try:
                async with (
                    async_sessionmaker(engine, expire_on_commit=False)() as session,
                    session.begin(),
                ):
                    for index, role in enumerate(
                        (Role.ADMIN, Role.CUSTOMER, Role.TECHNICIAN)
                    ):
                        user = await UserRepository(session).create(
                            phone_e164=f"+97250000000{index}",
                            role=role,
                            display_name=f"Image test {role}",
                        )
                        auth = AuthSession(
                            user_id=user.id,
                            refresh_token_hash=uuid4().hex,
                            expires_at=datetime.now(UTC) + timedelta(hours=1),
                        )
                        session.add(auth)
                        await session.flush()
                        sessions[role.value] = {
                            "user_id": str(user.id),
                            "role": role.value,
                            "access_token": create_access_token(
                                user_id=user.id,
                                session_id=auth.id,
                                role=role,
                                now=datetime.now(UTC),
                                ttl=timedelta(hours=1),
                                private_key=settings.jwt_private_key,
                            ),
                        }
            finally:
                await engine.dispose()
            app = create_app(settings)
            server = uvicorn.Server(
                uvicorn.Config(app, host="127.0.0.1", port=8299, log_level="warning")
            )

            @app.get("/api/v1/__image_test_sessions", include_in_schema=False)
            async def test_sessions():
                return sessions

            @app.post("/api/v1/__image_test_shutdown", include_in_schema=False)
            async def test_shutdown():
                server.should_exit = True
                return {"status": "stopping"}

            await server.serve()
    finally:
        await connection.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = $1 AND pid <> pg_backend_pid()",
            name,
        )
        await connection.execute(f'DROP DATABASE "{name}"')
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
