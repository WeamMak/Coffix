from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.api.errors import problem_response
from coffix.auth.policies import CustomerActorDep
from coffix.carts.repository import CartRepository
from coffix.carts.schemas import CartItemAdd, CartItemRead, CartItemSet, CartRead
from coffix.carts.service import CartAccess, CartService
from coffix.core.database import get_session
from coffix.inventory.repository import InventoryRepository
from coffix.inventory.service import InventoryService

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SkuIdPath = Annotated[UUID, Path()]

router = APIRouter(prefix="/api/v1/cart", tags=["cart"])


def service_for(request: Request, session: AsyncSession) -> CartService:
    return CartService(
        CartRepository(session),
        InventoryService(
            InventoryRepository(session),
            clock=request.app.state.clock,
            metrics=request.app.state.metrics,
        ),
        clock=request.app.state.clock,
        ttl_seconds=request.app.state.settings.cart_ttl_seconds,
    )


async def cart_response(access: CartAccess, request: Request) -> CartRead | Response:
    if access.expired:
        return problem_response(
            request,
            status=409,
            code="CART_EXPIRED",
            title="Cart expired",
        )
    shipping_agorot = request.app.state.settings.shipping_fee_agorot
    items = []
    for item in access.cart.items:
        image_url = None
        if item.image_object_key is not None:
            image_url = await request.app.state.media_store.create_download_url(
                item.image_object_key
            )
        items.append(
            CartItemRead(
                sku_id=item.sku_id,
                sku_code=item.sku_code,
                product_id=item.product_id,
                product_type=item.product_type,
                name_he=item.name_he,
                attributes=item.attributes,
                quantity=item.quantity,
                unit_price_agorot=item.unit_price_agorot,
                line_total_agorot=item.line_total_agorot,
                stock_quantity=item.stock_quantity,
                is_active=item.is_active,
                image_url=image_url,
                image_alt_he=item.image_alt_he,
            )
        )
    return CartRead(
        id=access.cart.id,
        status=access.cart.status,
        items=items,
        subtotal_agorot=access.cart.subtotal_agorot,
        shipping_agorot=shipping_agorot,
        total_agorot=access.cart.subtotal_agorot + shipping_agorot,
        total_quantity=access.cart.total_quantity,
        currency=access.cart.currency,
        last_activity_at=access.cart.last_activity_at,
        expires_at=access.cart.expires_at,
        version=access.cart.version,
    )


@router.get("", response_model=CartRead, responses={409: {"description": "Cart expired"}})
async def get_cart(
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> CartRead | Response:
    access = await service_for(request, session).get_or_create(actor.user_id)
    return await cart_response(access, request)


@router.post(
    "/items",
    response_model=CartRead,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "Cart or stock conflict"}},
)
async def add_cart_item(
    data: CartItemAdd,
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> CartRead | Response:
    access = await service_for(request, session).add_item(
        actor.user_id,
        data.sku_id,
        quantity=data.quantity,
    )
    return await cart_response(access, request)


@router.put(
    "/items/{sku_id}",
    response_model=CartRead,
    responses={409: {"description": "Cart or stock conflict"}},
)
async def set_cart_item(
    sku_id: SkuIdPath,
    data: CartItemSet,
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> CartRead | Response:
    access = await service_for(request, session).set_item(
        actor.user_id,
        sku_id,
        quantity=data.quantity,
    )
    return await cart_response(access, request)


@router.delete(
    "/items/{sku_id}",
    response_model=CartRead,
    responses={409: {"description": "Cart expired"}},
)
async def delete_cart_item(
    sku_id: SkuIdPath,
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> CartRead | Response:
    access = await service_for(request, session).remove_item(actor.user_id, sku_id)
    return await cart_response(access, request)
