from typing import Any
from uuid import UUID

from sqlalchemy import Select, asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.elements import ColumnElement

from coffix.catalog.models import Category, Product, ProductSku
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


class CatalogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_customer_categories(self) -> list[Category]:
        result = await self.session.scalars(
            select(Category)
            .where(Category.is_active.is_(True))
            .order_by(Category.sort_order, Category.id)
        )
        return list(result)

    async def customer_category_product_counts(self) -> dict[UUID, int]:
        rows = await self.session.execute(
            select(Product.category_id, func.count(Product.id))
            .join(Category)
            .where(Product.is_active.is_(True), Category.is_active.is_(True))
            .group_by(Product.category_id)
        )
        return {category_id: count for category_id, count in rows}

    async def list_categories(self) -> list[Category]:
        result = await self.session.scalars(
            select(Category).order_by(Category.sort_order, Category.id)
        )
        return list(result)

    async def list_customer_products(
        self,
        params: ProductListParams,
    ) -> tuple[list[Product], int]:
        filters = self._customer_product_filters(params)
        total = await self.session.scalar(
            select(func.count(Product.id)).join(Category).where(*filters)
        )
        statement = (
            select(Product)
            .join(Category)
            .where(*filters)
            .options(
                selectinload(Product.skus.and_(ProductSku.is_active.is_(True))),
                selectinload(Product.media),
            )
            .order_by(self._product_order(params), Product.id)
            .offset(params.offset)
            .limit(params.limit)
        )
        products = await self.session.scalars(statement)
        return list(products), total or 0

    async def get_customer_product(self, product_id: UUID) -> Product | None:
        return await self.session.scalar(
            select(Product)
            .join(Category)
            .where(
                Product.id == product_id,
                Product.is_active.is_(True),
                Category.is_active.is_(True),
            )
            .options(
                selectinload(Product.skus.and_(ProductSku.is_active.is_(True))),
                selectinload(Product.media),
            )
        )

    async def get_category(self, category_id: UUID) -> Category | None:
        return await self.session.get(Category, category_id)

    async def get_category_by_slug(self, slug: str) -> Category | None:
        return await self.session.scalar(select(Category).where(Category.slug == slug))

    async def get_product(self, product_id: UUID) -> Product | None:
        return await self.session.scalar(
            select(Product)
            .where(Product.id == product_id)
            .options(selectinload(Product.skus), selectinload(Product.media))
        )

    async def get_sku(self, sku_id: UUID) -> ProductSku | None:
        return await self.session.get(ProductSku, sku_id)

    async def get_sku_by_code(self, sku_code: str) -> ProductSku | None:
        return await self.session.scalar(
            select(ProductSku).where(ProductSku.sku_code == sku_code)
        )

    async def create_category(self, data: CategoryCreate) -> Category:
        category = Category(**data.model_dump())
        self.session.add(category)
        await self.session.flush()
        return category

    async def update_category(self, category: Category, data: CategoryUpdate) -> Category:
        self._apply_changes(category, data.model_dump(exclude_unset=True))
        await self.session.flush()
        await self.session.refresh(category)
        return category

    async def create_product(self, data: ProductCreate) -> Product:
        product = Product(**data.model_dump())
        self.session.add(product)
        await self.session.flush()
        return product

    async def update_product(self, product: Product, data: ProductUpdate) -> Product:
        self._apply_changes(product, data.model_dump(exclude_unset=True))
        await self.session.flush()
        await self.session.refresh(product)
        return product

    async def create_sku(self, product_id: UUID, data: SkuCreate) -> ProductSku:
        sku = ProductSku(product_id=product_id, **data.model_dump())
        self.session.add(sku)
        await self.session.flush()
        return sku

    async def update_sku(self, sku: ProductSku, data: SkuUpdate) -> ProductSku:
        self._apply_changes(sku, data.model_dump(exclude_unset=True))
        await self.session.flush()
        await self.session.refresh(sku)
        return sku

    @staticmethod
    def _customer_product_filters(params: ProductListParams) -> list[ColumnElement[bool]]:
        filters: list[ColumnElement[bool]] = [
            Product.is_active.is_(True),
            Category.is_active.is_(True),
        ]
        if params.category_id is not None:
            filters.append(Product.category_id == params.category_id)
        if params.featured is not None:
            filters.append(Product.is_featured.is_(params.featured))
        if params.product_type is not None:
            filters.append(Product.product_type == params.product_type)
        if params.q is not None:
            escaped_query = (
                params.q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            )
            pattern = f"%{escaped_query}%"
            filters.append(
                or_(
                    Product.name_he.ilike(pattern, escape="\\"),
                    Product.description_he.ilike(pattern, escape="\\"),
                )
            )
        return filters

    @staticmethod
    def _product_order(params: ProductListParams) -> ColumnElement[Any]:
        column = Product.name_he if params.sort_by == "name_he" else Product.created_at
        order = asc if params.sort_direction == "asc" else desc
        return order(column)

    @staticmethod
    def _apply_changes(record: object, changes: dict[str, object]) -> None:
        for field, value in changes.items():
            setattr(record, field, value)


class MachineModelRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_models(self, *, active_only: bool = False) -> list[MachineModel]:
        statement: Select[tuple[MachineModel]] = select(MachineModel)
        if active_only:
            statement = statement.where(MachineModel.is_active.is_(True))
        result = await self.session.scalars(
            statement.order_by(MachineModel.manufacturer, MachineModel.model_name)
        )
        return list(result)

    async def get(self, model_id: UUID) -> MachineModel | None:
        return await self.session.get(MachineModel, model_id)

    async def get_by_identity(
        self,
        manufacturer: str,
        model_name: str,
    ) -> MachineModel | None:
        return await self.session.scalar(
            select(MachineModel).where(
                MachineModel.manufacturer == manufacturer,
                MachineModel.model_name == model_name,
            )
        )

    async def create(self, data: MachineModelCreate) -> MachineModel:
        machine_model = MachineModel(**data.model_dump())
        self.session.add(machine_model)
        await self.session.flush()
        return machine_model

    async def update(
        self,
        machine_model: MachineModel,
        data: MachineModelUpdate,
    ) -> MachineModel:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(machine_model, field, value)
        await self.session.flush()
        await self.session.refresh(machine_model)
        return machine_model
