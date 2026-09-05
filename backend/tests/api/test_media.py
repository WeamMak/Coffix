from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.core.clock import FakeClock
from coffix.core.settings import Settings
from coffix.media.service import run_media_cleanup_pass
from coffix.users.models import Role
from coffix.users.repository import UserRepository

NOW = datetime(2026, 8, 31, 15, 0, tzinfo=UTC)
JPEG = b"\xff\xd8\xff\xe0photo-data"


async def seed_media_users(
    database_url: str,
) -> tuple[CurrentActor, CurrentActor, CurrentActor]:
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            users = UserRepository(session)
            customer = await users.create(phone_e164="+972501234501", role=Role.CUSTOMER)
            other = await users.create(phone_e164="+972501234502", role=Role.CUSTOMER)
            admin = await users.create(phone_e164="+972501234503", role=Role.ADMIN)
            return (
                CurrentActor(customer.id, customer.role),
                CurrentActor(other.id, other.role),
                CurrentActor(admin.id, admin.role),
            )
    finally:
        await engine.dispose()


def upload_body(
    *,
    collection_id: UUID | None = None,
    content_type: str = "image/jpeg",
    size_bytes: int = len(JPEG),
) -> dict[str, object]:
    return {
        "purpose": "service_issue",
        "collection_id": str(collection_id or uuid4()),
        "content_type": content_type,
        "size_bytes": size_bytes,
    }


@pytest.mark.asyncio
async def test_authenticated_local_upload_completion_and_download_are_owned(
    migrated_database_url: str,
    tmp_path: Path,
) -> None:
    customer, other, admin = await seed_media_users(migrated_database_url)
    app = create_app(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            api_public_url="http://test",
            media_local_root=str(tmp_path),
            media_presign_ttl_seconds=60,
        )
    )
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(NOW)
        app.state.media_store.clock = app.state.clock
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            unauthenticated = await client.post("/api/v1/media/uploads", json=upload_body())
            app.dependency_overrides[get_current_actor] = lambda: customer
            created = await client.post("/api/v1/media/uploads", json=upload_body())
            upload_path = urlparse(created.json()["upload_url"]).path
            incomplete = await client.post(
                f"/api/v1/media/uploads/{created.json()['upload_id']}/complete"
            )
            uploaded = await client.put(
                upload_path,
                content=JPEG,
                headers={"Content-Type": "image/jpeg"},
            )

            app.dependency_overrides[get_current_actor] = lambda: other
            hidden_completion = await client.post(
                f"/api/v1/media/uploads/{created.json()['upload_id']}/complete"
            )

            app.dependency_overrides[get_current_actor] = lambda: customer
            completed = await client.post(
                f"/api/v1/media/uploads/{created.json()['upload_id']}/complete"
            )

            app.dependency_overrides[get_current_actor] = lambda: other
            hidden_download = await client.get(f"/api/v1/media/{completed.json()['id']}/download")

            app.dependency_overrides[get_current_actor] = lambda: admin
            download = await client.get(f"/api/v1/media/{completed.json()['id']}/download")
            content = await client.get(download.json()["url"])

    assert unauthenticated.status_code == 401
    assert created.status_code == 201
    assert created.json()["method"] == "PUT"
    assert incomplete.status_code == 409
    assert incomplete.json()["code"] == "MEDIA_UPLOAD_INCOMPLETE"
    assert uploaded.status_code == 204
    assert hidden_completion.status_code == 404
    assert completed.status_code == 201
    assert completed.json()["owner_id"] == str(customer.user_id)
    assert completed.json()["content_type"] == "image/jpeg"
    assert completed.json()["size_bytes"] == len(JPEG)
    assert hidden_download.status_code == 404
    assert download.status_code == 200
    assert content.status_code == 200
    assert content.headers["content-type"] == "image/jpeg"
    assert content.content == JPEG


@pytest.mark.asyncio
async def test_media_api_rejects_type_size_count_and_observed_signature(
    migrated_database_url: str,
    tmp_path: Path,
) -> None:
    customer, _, _ = await seed_media_users(migrated_database_url)
    app = create_app(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            api_public_url="http://test",
            media_local_root=str(tmp_path),
            media_max_image_bytes=20,
            media_max_service_files=5,
        )
    )
    collection_id = uuid4()
    png_disguised_as_jpeg = b"\x89PNG\r\n\x1a\nwrong"
    async with app.router.lifespan_context(app):
        app.state.clock = FakeClock(NOW)
        app.state.media_store.clock = app.state.clock
        app.dependency_overrides[get_current_actor] = lambda: customer
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            unsupported = await client.post(
                "/api/v1/media/uploads",
                json=upload_body(
                    collection_id=collection_id,
                    content_type="image/gif",
                    size_bytes=10,
                ),
            )
            oversized = await client.post(
                "/api/v1/media/uploads",
                json=upload_body(collection_id=collection_id, size_bytes=21),
            )
            accepted = [
                await client.post(
                    "/api/v1/media/uploads",
                    json=upload_body(collection_id=collection_id),
                )
                for _ in range(5)
            ]
            over_count = await client.post(
                "/api/v1/media/uploads",
                json=upload_body(collection_id=collection_id),
            )

            mismatch_collection = uuid4()
            mismatch = await client.post(
                "/api/v1/media/uploads",
                json=upload_body(
                    collection_id=mismatch_collection,
                    size_bytes=len(png_disguised_as_jpeg),
                ),
            )
            mismatch_path = urlparse(mismatch.json()["upload_url"]).path
            await client.put(
                mismatch_path,
                content=png_disguised_as_jpeg,
                headers={"Content-Type": "image/jpeg"},
            )
            rejected_signature = await client.post(
                f"/api/v1/media/uploads/{mismatch.json()['upload_id']}/complete"
            )

    assert unsupported.status_code == 422
    assert unsupported.json()["code"] == "MEDIA_TYPE_NOT_ALLOWED"
    assert oversized.status_code == 422
    assert oversized.json()["code"] == "MEDIA_TOO_LARGE"
    assert [response.status_code for response in accepted] == [201] * 5
    assert over_count.status_code == 409
    assert over_count.json()["code"] == "MEDIA_FILE_LIMIT_REACHED"
    assert rejected_signature.status_code == 422
    assert rejected_signature.json()["code"] == "MEDIA_SIGNATURE_MISMATCH"
    assert not any(path.is_file() for path in tmp_path.rglob("*"))


@pytest.mark.asyncio
async def test_abandoned_upload_cleanup_deletes_content_and_expires_completion(
    migrated_database_url: str,
    tmp_path: Path,
) -> None:
    customer, _, _ = await seed_media_users(migrated_database_url)
    app = create_app(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            api_public_url="http://test",
            media_local_root=str(tmp_path),
            media_presign_ttl_seconds=60,
        )
    )
    async with app.router.lifespan_context(app):
        clock = FakeClock(NOW)
        app.state.clock = clock
        app.state.media_store.clock = clock
        app.dependency_overrides[get_current_actor] = lambda: customer
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post("/api/v1/media/uploads", json=upload_body())
            await client.put(
                urlparse(created.json()["upload_url"]).path,
                content=JPEG,
                headers={"Content-Type": "image/jpeg"},
            )
            incomplete = await client.post(
                f"/api/v1/media/uploads/{created.json()['upload_id']}/complete"
            )
            assert incomplete.status_code == 201

            abandoned = await client.post("/api/v1/media/uploads", json=upload_body())
            await client.put(
                urlparse(abandoned.json()["upload_url"]).path,
                content=JPEG,
                headers={"Content-Type": "image/jpeg"},
            )
            clock.advance(timedelta(seconds=61))
            cleaned = await run_media_cleanup_pass(
                app.state.session_factory,
                store=app.state.media_store,
                clock=clock,
                batch_size=100,
            )
            expired = await client.post(
                f"/api/v1/media/uploads/{abandoned.json()['upload_id']}/complete"
            )

    assert cleaned == 1
    assert expired.status_code == 410
    assert expired.json()["code"] == "MEDIA_UPLOAD_EXPIRED"
    assert len([path for path in tmp_path.rglob("*") if path.is_file()]) == 2


@pytest.mark.asyncio
async def test_customer_can_discard_only_own_unattached_registration_photo(
    migrated_database_url: str,
    tmp_path: Path,
) -> None:
    customer, other, _ = await seed_media_users(migrated_database_url)
    app = create_app(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            api_public_url="http://test",
            media_local_root=str(tmp_path),
        )
    )
    async with app.router.lifespan_context(app):
        app.dependency_overrides[get_current_actor] = lambda: customer
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            for purpose in ("machine_registration", "service_issue"):
                body = upload_body()
                body["purpose"] = purpose
                if purpose == "machine_registration":
                    body.pop("collection_id")
                upload = (await client.post("/api/v1/media/uploads", json=body)).json()
                await client.put(
                    urlparse(upload["upload_url"]).path,
                    content=JPEG,
                    headers={"Content-Type": "image/jpeg"},
                )
                media = (
                    await client.post(f"/api/v1/media/uploads/{upload['upload_id']}/complete")
                ).json()
                path = f"/api/v1/media/{media['id']}"
                app.dependency_overrides[get_current_actor] = lambda: other
                assert (await client.delete(path)).status_code == 404
                app.dependency_overrides[get_current_actor] = lambda: customer
                removed = await client.delete(path)
                if purpose == "machine_registration":
                    assert removed.status_code == 204
                    assert (await client.get(f"{path}/download")).status_code == 404
                    assert (
                        await client.post(f"/api/v1/media/uploads/{upload['upload_id']}/complete")
                    ).status_code == 410
                else:
                    assert removed.status_code == 409
                    assert (await client.get(f"{path}/download")).status_code == 200


@pytest.mark.asyncio
async def test_cleanup_reclaims_unattached_completed_registration_photos_after_one_day(
    migrated_database_url: str,
    tmp_path: Path,
) -> None:
    customer, _, _ = await seed_media_users(migrated_database_url)
    app = create_app(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            api_public_url="http://test",
            media_local_root=str(tmp_path),
        )
    )
    async with app.router.lifespan_context(app):
        clock = FakeClock(NOW)
        app.state.clock = app.state.media_store.clock = clock
        app.dependency_overrides[get_current_actor] = lambda: customer
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            upload = (
                await client.post(
                    "/api/v1/media/uploads",
                    json={
                        "purpose": "machine_registration",
                        "content_type": "image/jpeg",
                        "size_bytes": len(JPEG),
                    },
                )
            ).json()
            await client.put(
                urlparse(upload["upload_url"]).path,
                content=JPEG,
                headers={"Content-Type": "image/jpeg"},
            )
            media = (
                await client.post(f"/api/v1/media/uploads/{upload['upload_id']}/complete")
            ).json()
            clock.advance(timedelta(hours=23))
            assert (
                await run_media_cleanup_pass(
                    app.state.session_factory,
                    store=app.state.media_store,
                    clock=clock,
                    batch_size=100,
                )
                == 0
            )
            clock.advance(timedelta(hours=1, seconds=1))
            assert (
                await run_media_cleanup_pass(
                    app.state.session_factory,
                    store=app.state.media_store,
                    clock=clock,
                    batch_size=100,
                )
                == 1
            )
            assert (await client.get(f"/api/v1/media/{media['id']}/download")).status_code == 404
    assert not any(path.is_file() for path in tmp_path.rglob("*"))
