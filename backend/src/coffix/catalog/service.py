from datetime import timedelta
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.api.errors import ApiError
from coffix.catalog.models import Category, Product, ProductMedia, ProductSku
from coffix.catalog.repository import CatalogRepository, MachineModelRepository
from coffix.catalog.schemas import (
    CategoryCreate,
    CategoryUpdate,
    MachineModelCreate,
    MachineModelUpdate,
    ProductCreate,
    ProductGalleryUpdate,
    ProductListParams,
    ProductUpdate,
    SkuCreate,
    SkuUpdate,
)
from coffix.machines.models import MachineModel
from coffix.media.repository import MediaRepository
from coffix.media.service import validate_admin_image
from coffix.media.store import MediaPurpose


class CatalogService:
    def __init__(self, catalog: CatalogRepository) -> None:
        self.catalog = catalog

    async def list_categories(self) -> list[Category]:
        return await self.catalog.list_customer_categories()

    async def category_product_counts(self) -> dict[UUID, int]:
        return await self.catalog.customer_category_product_counts()

    async def list_products(
        self,
        params: ProductListParams,
    ) -> tuple[list[Product], int]:
        return await self.catalog.list_customer_products(params)

    async def get_product(self, product_id: UUID) -> Product:
        product = await self.catalog.get_customer_product(product_id)
        if product is None:
            raise ApiError(
                status=404,
                code="catalog_product_not_found",
                title="Product not found",
            )
        return product


class CatalogAdminService:
    """Admin catalog mutations excluding inventory stock adjustments."""

    def __init__(
        self,
        catalog: CatalogRepository,
        machine_models: MachineModelRepository,
    ) -> None:
        self.catalog = catalog
        self.machine_models = machine_models

    async def list_categories(self) -> list[Category]:
        return await self.catalog.list_categories()

    async def get_category(self, category_id: UUID) -> Category:
        return await self._category(category_id)

    async def get_product(self, product_id: UUID) -> Product:
        return await self._product(product_id)

    async def get_sku(self, sku_id: UUID) -> ProductSku:
        return await self._sku(sku_id)

    async def create_category(self, data: CategoryCreate, actor_id: UUID) -> Category:
        if await self.catalog.get_category_by_slug(data.slug) is not None:
            raise ApiError(
                status=409,
                code="catalog_category_slug_exists",
                title="Category slug already exists",
            )
        if data.image_media_id is not None:
            await validate_admin_image(
                MediaRepository(self.catalog.session),
                data.image_media_id,
                MediaPurpose.CATEGORY,
                actor_id,
            )
        return await self.catalog.create_category(data)

    async def update_category(
        self, category_id: UUID, data: CategoryUpdate, actor_id: UUID
    ) -> Category:
        category = await self._category(category_id)
        if data.slug is not None:
            existing = await self.catalog.get_category_by_slug(data.slug)
            if existing is not None and existing.id != category.id:
                raise ApiError(
                    status=409,
                    code="catalog_category_slug_exists",
                    title="Category slug already exists",
                )
        if data.image_media_id is not None:
            await validate_admin_image(
                MediaRepository(self.catalog.session),
                data.image_media_id,
                MediaPurpose.CATEGORY,
                actor_id,
            )
        if "image_media_id" in data.model_fields_set:
            category.image_key = None
        return await self.catalog.update_category(category, data)

    async def create_product(self, data: ProductCreate) -> Product:
        await self._category(data.category_id)
        return await self.catalog.create_product(data)

    async def update_product(self, product_id: UUID, data: ProductUpdate) -> Product:
        product = await self._product(product_id)
        if data.category_id is not None:
            await self._category(data.category_id)
        return await self.catalog.update_product(product, data)

    async def create_sku(self, product_id: UUID, data: SkuCreate) -> ProductSku:
        await self._product(product_id)
        await self._ensure_sku_code_available(data.sku_code)
        if data.machine_model_id is not None:
            await self._machine_model(data.machine_model_id)
        return await self.catalog.create_sku(product_id, data)

    async def update_sku(self, sku_id: UUID, data: SkuUpdate) -> ProductSku:
        sku = await self._sku(sku_id)
        if data.sku_code is not None and data.sku_code != sku.sku_code:
            await self._ensure_sku_code_available(data.sku_code)
        if "machine_model_id" in data.model_fields_set and data.machine_model_id is not None:
            await self._machine_model(data.machine_model_id)
        return await self.catalog.update_sku(sku, data)

    async def _category(self, category_id: UUID) -> Category:
        category = await self.catalog.get_category(category_id)
        if category is None:
            raise ApiError(
                status=404,
                code="catalog_category_not_found",
                title="Category not found",
            )
        return category

    async def _product(self, product_id: UUID) -> Product:
        product = await self.catalog.get_product(product_id)
        if product is None:
            raise ApiError(
                status=404,
                code="catalog_product_not_found",
                title="Product not found",
            )
        return product

    async def _sku(self, sku_id: UUID) -> ProductSku:
        sku = await self.catalog.get_sku(sku_id)
        if sku is None:
            raise ApiError(status=404, code="catalog_sku_not_found", title="SKU not found")
        return sku

    async def _machine_model(self, model_id: UUID) -> MachineModel:
        machine_model = await self.machine_models.get(model_id)
        if machine_model is None:
            raise ApiError(
                status=404,
                code="machine_model_not_found",
                title="Machine model not found",
            )
        return machine_model

    async def _ensure_sku_code_available(self, sku_code: str) -> None:
        if await self.catalog.get_sku_by_code(sku_code) is not None:
            raise ApiError(
                status=409,
                code="catalog_sku_code_exists",
                title="SKU code already exists",
            )


class MachineModelAdminService:
    def __init__(self, machine_models: MachineModelRepository) -> None:
        self.machine_models = machine_models

    async def list_models(self, *, active_only: bool = False) -> list[MachineModel]:
        return await self.machine_models.list_models(active_only=active_only)

    async def create_model(self, data: MachineModelCreate, actor_id: UUID) -> MachineModel:
        existing = await self.machine_models.get_by_identity(data.manufacturer, data.model_name)
        if existing is not None:
            raise ApiError(
                status=409,
                code="machine_model_exists",
                title="Machine model already exists",
            )
        if data.image_media_id is not None:
            await validate_admin_image(
                MediaRepository(self.machine_models.session),
                data.image_media_id,
                MediaPurpose.MACHINE_MODEL,
                actor_id,
            )
        return await self.machine_models.create(data)

    async def get_model(self, model_id: UUID) -> MachineModel:
        machine_model = await self.machine_models.get(model_id)
        if machine_model is None:
            raise ApiError(
                status=404,
                code="machine_model_not_found",
                title="Machine model not found",
            )
        return machine_model

    async def update_model(
        self,
        model_id: UUID,
        data: MachineModelUpdate,
        actor_id: UUID,
    ) -> MachineModel:
        machine_model = await self.machine_models.get(model_id)
        if machine_model is None:
            raise ApiError(
                status=404,
                code="machine_model_not_found",
                title="Machine model not found",
            )
        manufacturer = data.manufacturer or machine_model.manufacturer
        model_name = data.model_name or machine_model.model_name
        existing = await self.machine_models.get_by_identity(manufacturer, model_name)
        if existing is not None and existing.id != machine_model.id:
            raise ApiError(
                status=409,
                code="machine_model_exists",
                title="Machine model already exists",
            )
        if data.image_media_id is not None:
            await validate_admin_image(
                MediaRepository(self.machine_models.session),
                data.image_media_id,
                MediaPurpose.MACHINE_MODEL,
                actor_id,
            )
        return await self.machine_models.update(machine_model, data)


async def replace_product_gallery(
    session: AsyncSession,
    product_id: UUID,
    data: ProductGalleryUpdate,
    actor_id: UUID,
    maximum: int,
) -> Product:
    product = await session.scalar(
        select(Product).where(Product.id == product_id).with_for_update()
    )
    if product is None:
        raise ApiError(status=404, code="catalog_product_not_found", title="Product not found")
    if product.updated_at != data.version:
        raise ApiError(status=409, code="record_changed", title="Reload before editing again")
    if len(data.items) > maximum:
        raise ApiError(
            status=422, code="MEDIA_FILE_LIMIT_REACHED", title="Product image limit reached"
        )
    existing = {item.id: item for item in product.media}
    sku_ids = {sku.id for sku in product.skus}
    seen_ids: set[UUID] = set()
    seen_keys: set[str] = set()
    validated = []
    repository = MediaRepository(session)
    # Lock media in deterministic order, matching discard/cleanup's locks.
    media_by_id = {}
    new_media_ids = {
        item.media_id
        for item in data.items
        if item.media_id is not None
        and (
            item.id is None
            or item.id not in existing
            or existing[item.id].media_id != item.media_id
        )
    }
    for media_id in sorted(new_media_ids):
        media_by_id[media_id] = await validate_admin_image(
            repository, media_id, MediaPurpose.PRODUCT, actor_id
        )
    for position, item in enumerate(data.items):
        row = existing.get(item.id) if item.id else None
        if (item.id is not None and (row is None or item.id in seen_ids)) or (
            item.sku_id is not None and item.sku_id not in sku_ids
        ):
            raise ApiError(
                status=422, code="MEDIA_IMAGE_INVALID", title="Invalid product image or SKU"
            )
        if item.id is not None:
            seen_ids.add(item.id)
        if item.media_id is not None and (row is None or row.media_id != item.media_id):
            media = media_by_id[item.media_id]
            key, content_type, media_id = media.object_key, media.content_type, media.id
        elif row is not None:
            key, content_type, media_id = row.object_key, row.media_type, row.media_id
        else:
            raise ApiError(
                status=422, code="MEDIA_IMAGE_INVALID", title="New image requires completed upload"
            )
        if key in seen_keys:
            raise ApiError(status=422, code="MEDIA_IMAGE_INVALID", title="Duplicate image")
        seen_keys.add(key)
        validated.append(
            (
                row,
                dict(
                    id=item.id or uuid4(),
                    product_id=product_id,
                    media_id=media_id,
                    object_key=key,
                    media_type=content_type,
                    sort_order=position,
                    alt_text_he=item.alt_text_he,
                    sku_id=item.sku_id,
                ),
            )
        )
    rows = []
    for row, values in validated:
        if row is None:
            row = ProductMedia(**values)
        else:
            for key, value in values.items():
                setattr(row, key, value)
        rows.append(row)
    product.media = rows
    # PostgreSQL now() is transaction-start time; keep the token monotonic even after lock waits.
    product.updated_at = func.greatest(
        func.clock_timestamp(), data.version + timedelta(microseconds=1)
    )
    await session.flush()
    await session.refresh(product)
    return product
