from uuid import UUID

from coffix.api.errors import ApiError
from coffix.catalog.models import Category, Product, ProductSku
from coffix.catalog.repository import CatalogRepository, MachineModelRepository
from coffix.catalog.schemas import (
    CategoryCreate,
    CategoryUpdate,
    MachineModelCreate,
    MachineModelUpdate,
    ProductCreate,
    ProductListParams,
    ProductUpdate,
    SkuCreate,
    SkuUpdate,
)
from coffix.machines.models import MachineModel


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

    async def create_category(self, data: CategoryCreate) -> Category:
        if await self.catalog.get_category_by_slug(data.slug) is not None:
            raise ApiError(
                status=409,
                code="catalog_category_slug_exists",
                title="Category slug already exists",
            )
        return await self.catalog.create_category(data)

    async def update_category(self, category_id: UUID, data: CategoryUpdate) -> Category:
        category = await self._category(category_id)
        if data.slug is not None:
            existing = await self.catalog.get_category_by_slug(data.slug)
            if existing is not None and existing.id != category.id:
                raise ApiError(
                    status=409,
                    code="catalog_category_slug_exists",
                    title="Category slug already exists",
                )
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

    async def create_model(self, data: MachineModelCreate) -> MachineModel:
        existing = await self.machine_models.get_by_identity(data.manufacturer, data.model_name)
        if existing is not None:
            raise ApiError(
                status=409,
                code="machine_model_exists",
                title="Machine model already exists",
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
        return await self.machine_models.update(machine_model, data)
