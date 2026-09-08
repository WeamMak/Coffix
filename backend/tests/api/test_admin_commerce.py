from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from test_admin import seed_admin_api

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.core.settings import Settings
from coffix.users.models import Role


@pytest.mark.asyncio
async def test_catalog_pages_and_versioned_edits(migrated_database_url: str) -> None:
    admin, _, _, _ = await seed_admin_api(migrated_database_url)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    app.dependency_overrides[get_current_actor] = lambda: admin
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            products = await client.get("/api/v1/admin/products", params={"page": 1, "limit": 1})
            assert products.status_code == 200
            product = products.json()["items"][0]
            assert products.json()["total"] == 1
            assert (await client.get("/api/v1/admin/products", params={"q": "%"})).json()[
                "total"
            ] == 0
            category = (await client.get("/api/v1/admin/categories")).json()[0]
            for path, record, change in [
                (f"categories/{category['id']}", category, {"name_he": "חדש"}),
                (f"products/{product['id']}", product, {"name_he": "חדש"}),
                (f"skus/{product['skus'][0]['id']}", product["skus"][0], {"price_agorot": 1234}),
            ]:
                body = {**change, "version": record["version"]}
                saved = await client.patch(f"/api/v1/admin/{path}", json=body)
                assert saved.status_code == 200, saved.text
                assert saved.json()["version"] != record["version"]
                stale = await client.patch(f"/api/v1/admin/{path}", json=body)
                assert stale.status_code == 409
                assert stale.json()["code"] == "record_changed"
                assert (await client.patch(f"/api/v1/admin/{path}", json=change)).status_code == 422
            assert (
                await client.get("/api/v1/admin/products", params={"page": 0})
            ).status_code == 422
            assert (
                await client.get("/api/v1/admin/inventory", params={"q": "absent"})
            ).json() == []
            assert (await client.get("/api/v1/admin/orders", params={"state": "paid"})).json() == []
            app.dependency_overrides[get_current_actor] = lambda: CurrentActor(
                uuid4(), Role.TECHNICIAN
            )
            for path in [
                "categories",
                "products",
                f"products/{product['id']}",
                "inventory",
                "orders",
                f"orders/{uuid4()}",
            ]:
                assert (await client.get(f"/api/v1/admin/{path}")).status_code == 403


@pytest.mark.asyncio
async def test_server_pagination_and_competing_edit_only_accepts_one_writer(
    migrated_database_url: str,
) -> None:
    import asyncio

    admin, _, _, _ = await seed_admin_api(migrated_database_url)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    app.dependency_overrides[get_current_actor] = lambda: admin
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            category = (await client.get("/api/v1/admin/categories")).json()[0]
            product = await client.post(
                "/api/v1/admin/products",
                json={
                    "category_id": category["id"],
                    "name_he": "שני",
                    "description_he": "בדיקה",
                    "product_type": "beans",
                    "is_active": False,
                },
            )
            assert product.status_code == 201
            one = (await client.get("/api/v1/admin/products?limit=1&page=1")).json()
            two = (await client.get("/api/v1/admin/products?limit=1&page=2")).json()
            assert one["total"] == two["total"] == 2
            assert one["items"][0]["id"] != two["items"][0]["id"]
            hidden = (await client.get("/api/v1/admin/products?active=false")).json()
            assert [row["id"] for row in hidden["items"]] == [product.json()["id"]]
            assert (await client.get("/api/v1/admin/categories?limit=1&page=2")).json() == []
            assert (await client.get("/api/v1/admin/inventory?limit=1&page=2")).json() == []
            assert (await client.get("/api/v1/admin/orders?limit=1&page=2")).json() == []
            edits = await asyncio.gather(
                *[
                    client.patch(
                        f"/api/v1/admin/products/{product.json()['id']}",
                        json={"version": product.json()["version"], "admin_label_en": label},
                    )
                    for label in ["Operator one", "Operator two"]
                ]
            )
            assert sorted(response.status_code for response in edits) == [200, 409]
            for path in ["products", "categories", "inventory", "orders"]:
                assert (await client.get(f"/api/v1/admin/{path}?limit=101")).status_code == 422
