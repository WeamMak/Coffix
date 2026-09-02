from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from coffix.api.app import create_app
from coffix.auth.policies import CurrentActor, get_current_actor
from coffix.catalog.models import ProductMedia
from coffix.catalog.repository import CatalogRepository
from coffix.catalog.schemas import CategoryCreate, ProductCreate, SkuCreate
from coffix.core.settings import Settings
from coffix.users.models import Role


async def seed_catalog(database_url: str) -> tuple[UUID, UUID]:
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session, session.begin():
            catalog = CatalogRepository(session)
            category = await catalog.create_category(
                CategoryCreate(
                    name_he="פולי קפה",
                    slug="coffee-beans",
                    image_key="catalog/categories/coffee-beans.jpg",
                    icon_key="coffee-bean",
                )
            )
            active = await catalog.create_product(
                ProductCreate(
                    category_id=category.id,
                    name_he="פולי קפה ארבל",
                    description_he="תערובת קלייה מקומית",
                    product_type="beans",
                    is_featured=True,
                )
            )
            await catalog.create_sku(
                active.id,
                SkuCreate(sku_code="ARBEL-1KG", price_agorot=8900, stock_quantity=None),
            )
            session.add(
                ProductMedia(
                    product_id=active.id,
                    object_key="catalog/products/arbel.jpg",
                    media_type="image/jpeg",
                    sort_order=1,
                    alt_text_he="פולי קפה ארבל",
                )
            )
            await catalog.create_sku(
                active.id,
                SkuCreate(
                    sku_code="ARBEL-OLD",
                    price_agorot=7900,
                    stock_quantity=0,
                    is_active=False,
                ),
            )
            inactive = await catalog.create_product(
                ProductCreate(
                    category_id=category.id,
                    name_he="מוצר מוסתר",
                    description_he="לא זמין",
                    product_type="beans",
                    is_active=False,
                )
            )
            return active.id, inactive.id
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_catalog_browsing_requires_customer_authentication_and_hides_inactive_data(
    migrated_database_url: str,
) -> None:
    active_id, inactive_id = await seed_catalog(migrated_database_url)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            unauthenticated = await client.get("/api/v1/catalog/categories")

            app.dependency_overrides[get_current_actor] = lambda: CurrentActor(
                user_id=uuid4(), role=Role.TECHNICIAN
            )
            forbidden = await client.get("/api/v1/catalog/categories")

            app.dependency_overrides[get_current_actor] = lambda: CurrentActor(
                user_id=uuid4(), role=Role.CUSTOMER
            )
            categories = await client.get("/api/v1/catalog/categories")
            products = await client.get(
                "/api/v1/catalog/products",
                params={
                    "page": 1,
                    "limit": 1,
                    "featured": "true",
                    "product_type": "beans",
                    "sort_by": "name_he",
                    "sort_direction": "asc",
                },
            )
            searched_name = await client.get(
                "/api/v1/catalog/products", params={"q": "  ארבל  "}
            )
            searched_description = await client.get(
                "/api/v1/catalog/products", params={"q": "מקומית"}
            )
            searched_missing = await client.get(
                "/api/v1/catalog/products", params={"q": "לא-קיים"}
            )
            searched_wildcard = await client.get(
                "/api/v1/catalog/products", params={"q": "%"}
            )
            detail = await client.get(f"/api/v1/catalog/products/{active_id}")
            hidden = await client.get(f"/api/v1/catalog/products/{inactive_id}")
            unsupported_filter = await client.get(
                "/api/v1/catalog/products", params={"arbitrary_filter": "unsafe"}
            )

    assert unauthenticated.status_code == 401
    assert forbidden.status_code == 403
    assert categories.status_code == 200
    assert [category["slug"] for category in categories.json()] == ["coffee-beans"]
    assert categories.json()[0]["image_url"].startswith("http")
    assert categories.json()[0]["icon_key"] == "coffee-bean"
    assert categories.json()[0]["product_count"] == 1
    assert "image_key" not in categories.json()[0]
    assert products.status_code == 200
    assert products.json()["page"] == 1
    assert products.json()["limit"] == 1
    assert products.json()["total"] == 1
    assert [item["id"] for item in products.json()["items"]] == [str(active_id)]
    assert [item["id"] for item in searched_name.json()["items"]] == [str(active_id)]
    assert [item["id"] for item in searched_description.json()["items"]] == [
        str(active_id)
    ]
    assert searched_missing.json()["items"] == []
    assert searched_wildcard.json()["items"] == []
    assert detail.status_code == 200
    assert [sku["sku_code"] for sku in detail.json()["skus"]] == ["ARBEL-1KG"]
    assert detail.json()["skus"][0]["currency"] == "ILS"
    assert detail.json()["skus"][0]["stock_quantity"] is None
    assert detail.json()["media"][0]["alt_text_he"] == "פולי קפה ארבל"
    assert detail.json()["media"][0]["url"].startswith("http")
    assert "object_key" not in detail.json()["media"][0]
    assert hidden.status_code == 404
    assert hidden.json()["code"] == "catalog_product_not_found"
    assert unsupported_filter.status_code == 422
