from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.auth.policies import require_customer
from coffix.catalog.models import Product
from coffix.catalog.repository import CatalogRepository
from coffix.catalog.schemas import (
    CatalogCategoryRead,
    CatalogProductListRead,
    CatalogProductMediaRead,
    CatalogProductRead,
    ProductListParams,
    SkuRead,
)
from coffix.catalog.service import CatalogService
from coffix.core.database import get_session
from coffix.media.store import MediaStore

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


async def image_url(store: MediaStore, object_key: str | None) -> str | None:
    if object_key is None:
        return None
    return await store.create_download_url(object_key)


async def product_read(product: Product, store: MediaStore) -> CatalogProductRead:
    media = [
        CatalogProductMediaRead(
            id=item.id,
            sku_id=item.sku_id,
            media_type=item.media_type,
            sort_order=item.sort_order,
            alt_text_he=item.alt_text_he,
            url=await store.create_download_url(item.object_key),
        )
        for item in product.media
    ]
    return CatalogProductRead(
        id=product.id,
        category_id=product.category_id,
        name_he=product.name_he,
        description_he=product.description_he,
        product_type=product.product_type,
        is_featured=product.is_featured,
        is_active=product.is_active,
        skus=[SkuRead.model_validate(sku) for sku in product.skus],
        media=media,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


@router.get("/categories")
async def list_categories(request: Request, session: SessionDep) -> list[CatalogCategoryRead]:
    service = service_for(session)
    categories = await service.list_categories()
    product_counts = await service.category_product_counts()
    store: MediaStore = request.app.state.media_store
    return [
        CatalogCategoryRead(
            id=category.id,
            name_he=category.name_he,
            slug=category.slug,
            sort_order=category.sort_order,
            is_active=category.is_active,
            image_url=await image_url(store, category.image_key),
            icon_key=category.icon_key,
            product_count=product_counts.get(category.id, 0),
        )
        for category in categories
    ]


@router.get("/products")
async def list_products(
    request: Request,
    params: ProductListQuery,
    session: SessionDep,
) -> CatalogProductListRead:
    products, total = await service_for(session).list_products(params)
    store: MediaStore = request.app.state.media_store
    return CatalogProductListRead(
        items=[await product_read(product, store) for product in products],
        page=params.page,
        limit=params.limit,
        total=total,
    )


@router.get("/products/{product_id}")
async def get_product(
    product_id: ProductIdPath,
    request: Request,
    session: SessionDep,
) -> CatalogProductRead:
    product = await service_for(session).get_product(product_id)
    return await product_read(product, request.app.state.media_store)
