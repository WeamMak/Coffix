from pathlib import Path
from urllib.parse import urlparse

import pytest
from httpx import ASGITransport, AsyncClient

from coffix.api.app import create_app
from coffix.auth.policies import get_current_actor
from coffix.core.settings import Settings
from tests.api.test_media import JPEG, seed_media_users


async def upload_image(client: AsyncClient, purpose: str) -> dict:
    response = await client.post(
        "/api/v1/media/uploads",
        json={
            "purpose": purpose,
            "content_type": "image/jpeg",
            "size_bytes": len(JPEG),
        },
    )
    assert response.status_code == 201, response.text
    upload = response.json()
    response = await client.put(
        urlparse(upload["upload_url"]).path, content=JPEG, headers={"Content-Type": "image/jpeg"}
    )
    assert response.status_code == 204
    response = await client.post(f"/api/v1/media/uploads/{upload['upload_id']}/complete")
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_model_image_assignment_preservation_removal_and_role_checks(
    migrated_database_url: str,
    tmp_path: Path,
) -> None:
    customer, _, admin = await seed_media_users(migrated_database_url)
    app = create_app(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            api_public_url="http://test",
            media_local_root=str(tmp_path),
        )
    )
    async with app.router.lifespan_context(app):
        app.dependency_overrides[get_current_actor] = lambda: admin
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            model = (
                await client.post(
                    "/api/v1/admin/machine-models",
                    json={
                        "manufacturer": "Test",
                        "model_name": "Independent",
                    },
                )
            ).json()
            assert model.get("image_url") is None
            media = await upload_image(client, "machine_model")
            path = f"/api/v1/admin/machine-models/{model['id']}"
            assigned = await client.patch(path, json={"image_media_id": media["id"]})
            assert assigned.status_code == 200, assigned.text
            assert assigned.json()["image_media_id"] == media["id"]
            assert (await client.get(assigned.json()["image_url"])).content == JPEG
            preserved = await client.patch(path, json={"model_name": "Renamed"})
            assert preserved.json()["image_media_id"] == media["id"]
            assert (await client.delete(f"/api/v1/media/{media['id']}")).status_code == 409
            app.dependency_overrides[get_current_actor] = lambda: customer
            models = (await client.get("/api/v1/machines/models")).json()
            assert models[0]["image_url"]
            assert (
                await client.post(
                    "/api/v1/media/uploads",
                    json={
                        "purpose": "machine_model",
                        "content_type": "image/jpeg",
                        "size_bytes": len(JPEG),
                    },
                )
            ).status_code == 403
            app.dependency_overrides[get_current_actor] = lambda: admin
            removed = await client.patch(path, json={"image_media_id": None})
            assert removed.json()["image_url"] is None
            assert (await client.delete(f"/api/v1/media/{media['id']}")).status_code == 204


@pytest.mark.asyncio
async def test_category_and_gallery_validate_and_save_atomically(
    migrated_database_url: str, tmp_path: Path
) -> None:
    customer, _, admin = await seed_media_users(migrated_database_url)
    app = create_app(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            api_public_url="http://test",
            media_local_root=str(tmp_path),
        )
    )
    async with app.router.lifespan_context(app):
        app.dependency_overrides[get_current_actor] = lambda: admin
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            photo = await upload_image(client, "category")
            category = await client.post(
                "/api/v1/admin/categories",
                json={
                    "name_he": "קפה",
                    "slug": "coffee",
                    "icon_key": "capsule",
                    "image_media_id": photo["id"],
                },
            )
            assert category.status_code == 201, category.text
            category = category.json()
            assert category["image_url"]
            path = f"/api/v1/admin/categories/{category['id']}"
            assert (
                await client.patch(
                    path, json={"version": category["version"], "icon_key": "unknown"}
                )
            ).status_code == 422
            assert (
                await client.patch(
                    path, json={"version": category["version"], "image_key": "private/key"}
                )
            ).status_code == 422
            assert (await client.delete(f"/api/v1/media/{photo['id']}")).status_code == 409
            product = (
                await client.post(
                    "/api/v1/admin/products",
                    json={
                        "category_id": category["id"],
                        "name_he": "מוצר",
                        "description_he": "תיאור",
                        "product_type": "coffee",
                    },
                )
            ).json()
            sku = (
                await client.post(
                    f"/api/v1/admin/products/{product['id']}/skus",
                    json={"sku_code": "TEST", "price_agorot": 100},
                )
            ).json()
            images = [await upload_image(client, "product") for _ in range(2)]
            path = f"/api/v1/admin/products/{product['id']}/media"
            initial = await client.get(path)
            assert initial.status_code == 200, initial.text
            body = {
                "version": initial.json()["version"],
                "items": [
                    {"media_id": images[0]["id"], "alt_text_he": "ראשונה"},
                    {"media_id": images[1]["id"], "sku_id": sku["id"], "alt_text_he": "שנייה"},
                ],
            }
            saved = await client.put(path, json=body)
            assert saved.status_code == 200, saved.text
            saved = saved.json()
            assert saved["version"] != body["version"]
            assert [x["media_id"] for x in saved["items"]] == [x["id"] for x in images]
            assert (await client.put(path, json=body)).status_code == 409
            invalid = {
                "version": saved["version"],
                "items": [
                    {"id": saved["items"][0]["id"], "alt_text_he": "נשמרת"},
                    {"media_id": photo["id"], "alt_text_he": "סוג שגוי"},
                ],
            }
            assert (await client.put(path, json=invalid)).status_code == 422
            assert (await client.get(path)).json()["items"] == saved["items"]
            reordered = await client.put(
                path,
                json={
                    "version": saved["version"],
                    "items": [
                        {"id": x["id"], "alt_text_he": x["alt_text_he"], "sku_id": x["sku_id"]}
                        for x in reversed(saved["items"])
                    ],
                },
            )
            assert reordered.status_code == 200, reordered.text
            app.dependency_overrides[get_current_actor] = lambda: customer
            public = (await client.get(f"/api/v1/catalog/products/{product['id']}")).json()
            assert public["media"][0]["id"] == saved["items"][1]["id"]
            assert (await client.get("/api/v1/catalog/categories")).json()[0]["image_url"]
            assert (await client.get(path)).status_code == 403


@pytest.mark.asyncio
async def test_image_validation_ownership_legacy_references_and_cleanup(
    migrated_database_url: str, tmp_path: Path
) -> None:
    from datetime import timedelta
    from uuid import UUID, uuid4

    from sqlalchemy import select

    from coffix.auth.policies import CurrentActor
    from coffix.catalog.models import Category, ProductMedia
    from coffix.core.clock import FakeClock
    from coffix.media.models import MediaObject
    from coffix.media.service import run_media_cleanup_pass
    from coffix.users.models import Role
    from tests.api.test_media import NOW

    customer, other, admin = await seed_media_users(migrated_database_url)
    app = create_app(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            api_public_url="http://test",
            media_local_root=str(tmp_path),
            media_max_product_images=2,
        )
    )
    async with app.router.lifespan_context(app):
        clock = FakeClock(NOW)
        app.state.clock = app.state.media_store.clock = clock
        app.dependency_overrides[get_current_actor] = lambda: admin
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            model = (
                await client.post(
                    "/api/v1/admin/machine-models",
                    json={"manufacturer": "Test", "model_name": "One"},
                )
            ).json()
            model_path = f"/api/v1/admin/machine-models/{model['id']}"
            original = await upload_image(client, "machine_model")
            replacement = await upload_image(client, "machine_model")
            category_photo = await upload_image(client, "category")
            abandoned = await upload_image(client, "product")
            assert (
                await client.patch(model_path, json={"image_media_id": original["id"]})
            ).status_code == 200
            assert (
                await client.patch(model_path, json={"image_media_id": category_photo["id"]})
            ).status_code == 422
            assert (
                await client.patch(model_path, json={"image_media_id": str(uuid4())})
            ).status_code == 422
            assert (
                await client.patch(model_path, json={"image_media_id": replacement["id"]})
            ).status_code == 200
            # Another administrator can remove an image but cannot assign somebody else's upload.
            second_admin = CurrentActor(other.user_id, Role.ADMIN)
            app.dependency_overrides[get_current_actor] = lambda: second_admin
            assert (
                await client.patch(model_path, json={"image_media_id": original["id"]})
            ).status_code == 422
            assert (
                await client.patch(model_path, json={"image_media_id": None})
            ).status_code == 200
            app.dependency_overrides[get_current_actor] = lambda: admin
            category = (
                await client.post(
                    "/api/v1/admin/categories", json={"name_he": "ישן", "slug": "legacy"}
                )
            ).json()
            product = (
                await client.post(
                    "/api/v1/admin/products",
                    json={
                        "category_id": category["id"],
                        "name_he": "מוצר",
                        "description_he": "תיאור",
                        "product_type": "coffee",
                    },
                )
            ).json()
            # Old keys/gallery rows can reference objects without an ID link.
            async with app.state.session_factory() as session, session.begin():
                row = await session.get(Category, UUID(category["id"]))
                photo = await session.get(MediaObject, UUID(category_photo["id"]))
                row.image_key = photo.object_key
                legacy_product = ProductMedia(
                    product_id=UUID(product["id"]),
                    object_key=photo.object_key,
                    media_type="image/jpeg",
                    sort_order=0,
                    alt_text_he="ישן",
                )
                session.add(legacy_product)
            assert (await client.delete(f"/api/v1/media/{category_photo['id']}")).status_code == 409
            categories = (await client.get("/api/v1/admin/categories")).json()
            category = categories[0]
            changed = (
                await client.patch(
                    f"/api/v1/admin/categories/{category['id']}",
                    json={"version": category["version"], "name_he": "ישן נשמר"},
                )
            ).json()
            assert changed["image_key"] == category["image_key"]
            assert changed["image_url"]
            path = f"/api/v1/admin/products/{product['id']}/media"
            gallery = (await client.get(path)).json()
            legacy = gallery["items"][0]
            assert legacy["media_id"] is None
            valid_item = {"id": legacy["id"], "alt_text_he": "עדכון"}
            for items in [
                [valid_item, valid_item],
                [{"id": str(uuid4()), "alt_text_he": "שגוי"}],
                [{"media_id": abandoned["id"], "sku_id": str(uuid4()), "alt_text_he": "שגוי"}],
                [{"media_id": abandoned["id"], "alt_text_he": "א"}] * 3,
                [{"media_id": abandoned["id"], "alt_text_he": "א"}] * 2,
            ]:
                response = await client.put(
                    path, json={"version": gallery["version"], "items": items}
                )
                assert response.status_code == 422, response.text
                assert (await client.get(path)).json() == gallery
            assert (
                await client.put(path, json={"version": gallery["version"], "items": [valid_item]})
            ).status_code == 200
            # Never accept videos or disguised files for business-image purposes.
            assert (
                await client.post(
                    "/api/v1/media/uploads",
                    json={"purpose": "product", "content_type": "video/mp4", "size_bytes": 12},
                )
            ).status_code == 422
            incomplete = (
                await client.post(
                    "/api/v1/media/uploads",
                    json={"purpose": "product", "content_type": "image/jpeg", "size_bytes": 4},
                )
            ).json()
            await client.put(
                urlparse(incomplete["upload_url"]).path,
                content=b"fake",
                headers={"Content-Type": "image/jpeg"},
            )
            assert (
                await client.post(f"/api/v1/media/uploads/{incomplete['upload_id']}/complete")
            ).status_code == 422
            assert (
                await client.patch(model_path, json={"image_media_id": incomplete["upload_id"]})
            ).status_code == 422
            for role in (Role.CUSTOMER, Role.TECHNICIAN):
                actor = CurrentActor(admin.user_id, role)
                app.dependency_overrides[get_current_actor] = lambda: actor
                for purpose in ("machine_model", "category", "product"):
                    assert (
                        await client.post(
                            "/api/v1/media/uploads",
                            json={
                                "purpose": purpose,
                                "content_type": "image/jpeg",
                                "size_bytes": 4,
                            },
                        )
                    ).status_code == 403
                assert (
                    await client.post(f"/api/v1/media/uploads/{incomplete['upload_id']}/complete")
                ).status_code == 403
                assert (
                    await client.put(path, json={"version": gallery["version"], "items": []})
                ).status_code == 403
            app.dependency_overrides[get_current_actor] = lambda: customer
            private = await upload_image(client, "machine_registration")
            app.dependency_overrides[get_current_actor] = lambda: admin
            assert (
                await client.patch(model_path, json={"image_media_id": private["id"]})
            ).status_code == 422
            clock.advance(timedelta(days=2))
            await run_media_cleanup_pass(
                app.state.session_factory, store=app.state.media_store, clock=clock, batch_size=100
            )
            assert (
                await client.get(f"/api/v1/media/{abandoned['id']}/download")
            ).status_code == 404
            assert (await client.get(f"/api/v1/media/{original['id']}/download")).status_code == 404
            assert (
                await client.get(f"/api/v1/media/{category_photo['id']}/download")
            ).status_code == 200
            async with app.state.session_factory() as session:
                assert await session.scalar(
                    select(ProductMedia.id).where(ProductMedia.id == legacy_product.id)
                )


@pytest.mark.asyncio
async def test_configured_s3_business_images_use_presigned_urls_without_local_bytes(
    migrated_database_url: str,
    tmp_path: Path,
    monkeypatch,
) -> None:
    from tests.contract.media.test_s3_store import FakeS3Client

    _, _, admin = await seed_media_users(migrated_database_url)
    s3 = FakeS3Client()
    monkeypatch.setattr("boto3.client", lambda _service: s3)
    app = create_app(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            media_storage_backend="s3",
            media_s3_bucket="test-private",
            media_s3_prefix="test-images/",
            media_local_root=str(tmp_path),
        )
    )
    async with app.router.lifespan_context(app):
        app.dependency_overrides[get_current_actor] = lambda: admin
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            target = (
                await client.post(
                    "/api/v1/media/uploads",
                    json={
                        "purpose": "machine_model",
                        "content_type": "image/jpeg",
                        "size_bytes": len(JPEG),
                    },
                )
            ).json()
            assert target["upload_url"].startswith("https://s3.test/put_object/test-images/")
            assert target["headers"]["x-amz-server-side-encryption"] == "AES256"
            media = (
                await client.post(f"/api/v1/media/uploads/{target['upload_id']}/complete")
            ).json()
            model = await client.post(
                "/api/v1/admin/machine-models",
                json={
                    "manufacturer": "Cloud",
                    "model_name": "Independent",
                    "image_media_id": media["id"],
                },
            )
            assert model.status_code == 201, model.text
            assert model.json()["image_url"].startswith("https://s3.test/get_object/test-images/")
    assert not list(tmp_path.rglob("*"))


@pytest.mark.asyncio
async def test_catalog_creation_commits_before_success_is_sent(migrated_database_url: str) -> None:
    from sqlalchemy import select

    from coffix.catalog.models import Category

    _, _, admin = await seed_media_users(migrated_database_url)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    visible_at_response = []
    async with app.router.lifespan_context(app):
        app.dependency_overrides[get_current_actor] = lambda: admin

        async def observe_response(scope, receive, send):
            async def observe(message):
                if message["type"] == "http.response.start" and message["status"] == 201:
                    async with app.state.session_factory() as reader:
                        visible_at_response.append(
                            await reader.scalar(
                                select(Category.id).where(
                                    Category.slug == "committed-before-response"
                                )
                            )
                            is not None
                        )
                await send(message)

            await app(scope, receive, observe)

        async with AsyncClient(
            transport=ASGITransport(app=observe_response), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/admin/categories",
                json={"name_he": "נשמרה", "slug": "committed-before-response"},
            )
            assert response.status_code == 201
    assert visible_at_response == [True]
