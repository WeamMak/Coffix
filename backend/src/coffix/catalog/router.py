from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.auth.policies import require_customer
from coffix.catalog.repository import CatalogRepository
from coffix.catalog.schemas import (
    CategoryRead,
    ProductListParams,
    ProductListRead,
    ProductRead,
)
from coffix.catalog.service import CatalogService
from coffix.core.database import get_session

SessionDep = Annotated[AsyncSession, Depends(get_session)]
ProductListQuery = Annotated[ProductListParams, Query()]
ProductIdPath = Annotated[UUID, Path()]

router = APIRouter(
    prefix="/api/v1/catalog",
    tags=["catalog"],
    dependencies=[Depends(require_customer)],
)


def service_for(session: AsyncSession) -> CatalogService:
    return CatalogService(CatalogRepository(session))


@router.get("/categories")
async def list_categories(session: SessionDep) -> list[CategoryRead]:
    categories = await service_for(session).list_categories()
    return [CategoryRead.model_validate(category) for category in categories]


@router.get("/products")
async def list_products(params: ProductListQuery, session: SessionDep) -> ProductListRead:
    products, total = await service_for(session).list_products(params)
    return ProductListRead(
        items=[ProductRead.model_validate(product) for product in products],
        page=params.page,
        limit=params.limit,
        total=total,
    )


@router.get("/products/{product_id}")
async def get_product(product_id: ProductIdPath, session: SessionDep) -> ProductRead:
    product = await service_for(session).get_product(product_id)
    return ProductRead.model_validate(product)
