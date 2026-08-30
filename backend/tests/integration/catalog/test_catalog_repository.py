import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.catalog.repository import CatalogRepository, MachineModelRepository
from coffix.catalog.schemas import (
    CategoryCreate,
    MachineModelCreate,
    ProductCreate,
    ProductListParams,
    ProductUpdate,
    SkuCreate,
    SkuUpdate,
)
from coffix.catalog.service import CatalogAdminService, MachineModelAdminService


@pytest.mark.asyncio
async def test_customer_catalog_hides_inactive_resources_and_filters_pages(
    database_session: AsyncSession,
) -> None:
    catalog = CatalogRepository(database_session)
    machines = MachineModelRepository(database_session)
    machine_model = await machines.create(
        MachineModelCreate(manufacturer="Lelit", model_name="Bianca V3")
    )
    active_category = await catalog.create_category(
        CategoryCreate(name_he="מכונות קפה", slug="machines", sort_order=1)
    )
    inactive_category = await catalog.create_category(
        CategoryCreate(name_he="מוסתר", slug="hidden", is_active=False)
    )
    visible_product = await catalog.create_product(
        ProductCreate(
            category_id=active_category.id,
            name_he="Lelit Bianca V3",
            description_he="מכונת אספרסו דו-בוילר",
            product_type="coffee_machine",
            is_featured=True,
        )
    )
    await catalog.create_sku(
        visible_product.id,
        SkuCreate(
            sku_code="LELIT-BIANCA-V3",
            price_agorot=945_000,
            stock_quantity=None,
            machine_model_id=machine_model.id,
        ),
    )
    await catalog.create_sku(
        visible_product.id,
        SkuCreate(sku_code="LELIT-BIANCA-OLD", price_agorot=900_000, is_active=False),
    )
    inactive_product = await catalog.create_product(
        ProductCreate(
            category_id=active_category.id,
            name_he="מוצר לא פעיל",
            description_he="לא אמור להופיע",
            product_type="coffee_machine",
            is_active=False,
        )
    )
    hidden_category_product = await catalog.create_product(
        ProductCreate(
            category_id=inactive_category.id,
            name_he="מוצר בקטגוריה לא פעילה",
            description_he="לא אמור להופיע",
            product_type="coffee_machine",
        )
    )

    categories = await catalog.list_customer_categories()
    products, total = await catalog.list_customer_products(
        ProductListParams(category_id=active_category.id, featured=True, limit=1)
    )

    assert [category.id for category in categories] == [active_category.id]
    assert total == 1
    assert [product.id for product in products] == [visible_product.id]
    assert [sku.sku_code for sku in products[0].skus] == ["LELIT-BIANCA-V3"]
    assert await catalog.get_customer_product(inactive_product.id) is None
    assert await catalog.get_customer_product(hidden_category_product.id) is None


@pytest.mark.asyncio
async def test_sku_codes_are_unique_and_machine_warranty_default_is_persisted(
    database_session: AsyncSession,
) -> None:
    catalog = CatalogRepository(database_session)
    machines = MachineModelRepository(database_session)
    machine_model = await machines.create(
        MachineModelCreate(manufacturer="ECM", model_name="Synchronika")
    )
    category = await catalog.create_category(
        CategoryCreate(name_he="מכונות", slug="espresso-machines")
    )
    first_product = await catalog.create_product(
        ProductCreate(
            category_id=category.id,
            name_he="ECM Synchronika",
            description_he="מכונת אספרסו",
            product_type="coffee_machine",
        )
    )
    second_product = await catalog.create_product(
        ProductCreate(
            category_id=category.id,
            name_he="ECM Synchronika II",
            description_he="מכונת אספרסו",
            product_type="coffee_machine",
        )
    )
    await catalog.create_sku(
        first_product.id,
        SkuCreate(sku_code="ECM-SYNC", price_agorot=1_320_000, stock_quantity=1),
    )

    with pytest.raises(IntegrityError):
        async with database_session.begin_nested():
            await catalog.create_sku(
                second_product.id,
                SkuCreate(sku_code="ECM-SYNC", price_agorot=1_300_000),
            )

    assert machine_model.default_warranty_months == 12


@pytest.mark.asyncio
async def test_admin_services_manage_catalog_configuration_but_not_stock(
    database_session: AsyncSession,
) -> None:
    catalog_repository = CatalogRepository(database_session)
    machine_repository = MachineModelRepository(database_session)
    catalog = CatalogAdminService(catalog_repository, machine_repository)
    machines = MachineModelAdminService(machine_repository)

    machine_model = await machines.create_model(
        MachineModelCreate(manufacturer="Breville", model_name="Barista Pro")
    )
    category = await catalog.create_category(
        CategoryCreate(name_he="מכונות", slug="configured-machines")
    )
    product = await catalog.create_product(
        ProductCreate(
            category_id=category.id,
            name_he="Breville Barista Pro",
            description_he="מכונה עם מטחנה מובנית",
            product_type="coffee_machine",
        )
    )
    sku = await catalog.create_sku(
        product.id,
        SkuCreate(sku_code="BREVILLE-PRO", price_agorot=349_000, stock_quantity=12),
    )

    product = await catalog.update_product(
        product.id,
        ProductUpdate(is_featured=True, is_active=False),
    )
    sku = await catalog.update_sku(
        sku.id,
        SkuUpdate(price_agorot=339_000, machine_model_id=machine_model.id),
    )

    assert product.is_featured is True
    assert product.is_active is False
    assert sku.price_agorot == 339_000
    assert sku.stock_quantity == 12
    assert sku.machine_model_id == machine_model.id
