from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

from coffix.api.errors import ApiError
from coffix.carts.models import Cart, CartItem, CartStatus
from coffix.carts.repository import CartRepository
from coffix.core.clock import Clock
from coffix.core.types import CartId, UserId
from coffix.inventory.service import InventoryService


@dataclass(frozen=True, slots=True)
class CartTotals:
    subtotal_agorot: int
    total_quantity: int
    currency: Literal["ILS"] = "ILS"


def calculate_cart_totals(lines: Iterable[tuple[int, int]]) -> CartTotals:
    subtotal_agorot = 0
    total_quantity = 0
    for price_agorot, quantity in lines:
        if price_agorot < 0:
            raise ValueError("cart price must be non-negative")
        if quantity <= 0:
            raise ValueError("cart quantity must be positive")
        subtotal_agorot += price_agorot * quantity
        total_quantity += quantity
    return CartTotals(
        subtotal_agorot=subtotal_agorot,
        total_quantity=total_quantity,
    )


@dataclass(frozen=True, slots=True)
class CartItemView:
    sku_id: UUID
    sku_code: str
    product_id: UUID
    name_he: str
    attributes: dict[str, str]
    quantity: int
    unit_price_agorot: int
    line_total_agorot: int
    stock_quantity: int | None
    is_active: bool


@dataclass(frozen=True, slots=True)
class CartView:
    id: CartId
    status: CartStatus
    items: tuple[CartItemView, ...]
    subtotal_agorot: int
    total_quantity: int
    currency: Literal["ILS"]
    last_activity_at: datetime
    expires_at: datetime
    version: int


@dataclass(frozen=True, slots=True)
class CartAccess:
    cart: CartView
    expired: bool = False


@dataclass(frozen=True, slots=True)
class _CartRecordAccess:
    cart: Cart
    expired: bool = False


class CartService:
    def __init__(
        self,
        repository: CartRepository,
        inventory: InventoryService,
        *,
        clock: Clock,
        ttl_seconds: int,
    ) -> None:
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be positive")
        self.repository = repository
        self.inventory = inventory
        self.clock = clock
        self.ttl_seconds = ttl_seconds

    async def get_or_create(self, customer_id: UserId) -> CartAccess:
        access = await self._active_cart(customer_id)
        return CartAccess(cart=self._view(access.cart), expired=access.expired)

    async def add_item(
        self,
        customer_id: UserId,
        sku_id: UUID,
        *,
        quantity: int,
    ) -> CartAccess:
        if quantity <= 0:
            raise ValueError("quantity must be positive")
        access = await self._active_cart(customer_id)
        if access.expired:
            return CartAccess(cart=self._view(access.cart), expired=True)
        cart = access.cart
        item = self._item(cart, sku_id)
        desired_quantity = (item.quantity if item is not None else 0) + quantity
        return await self._set_quantity(cart, item, sku_id, desired_quantity)

    async def set_item(
        self,
        customer_id: UserId,
        sku_id: UUID,
        *,
        quantity: int,
    ) -> CartAccess:
        if quantity <= 0:
            raise ValueError("quantity must be positive")
        access = await self._active_cart(customer_id)
        if access.expired:
            return CartAccess(cart=self._view(access.cart), expired=True)
        cart = access.cart
        return await self._set_quantity(cart, self._item(cart, sku_id), sku_id, quantity)

    async def remove_item(self, customer_id: UserId, sku_id: UUID) -> CartAccess:
        access = await self._active_cart(customer_id)
        if access.expired:
            return CartAccess(cart=self._view(access.cart), expired=True)
        cart = access.cart
        item = self._item(cart, sku_id)
        if item is None:
            return CartAccess(cart=self._view(cart))
        await self.inventory.reserve(cart.id, sku_id, 0, cart.expires_at)
        await self.repository.remove_item(cart, item)
        self._refresh(cart)
        await self.repository.flush()
        return CartAccess(cart=self._view(cart))

    async def _active_cart(self, customer_id: UserId) -> _CartRecordAccess:
        if not await self.repository.lock_customer(customer_id):
            raise ApiError(status=404, code="USER_NOT_FOUND", title="User not found")
        cart = await self.repository.get_active_for_customer(customer_id, for_update=True)
        now = self.clock.now()
        if cart is not None and cart.is_expired(now):
            await self.inventory.release_cart(cart.id)
            cart.expire(now)
            await self.repository.flush()
            return _CartRecordAccess(cart=cart, expired=True)
        if cart is None:
            cart = await self.repository.create(
                customer_id,
                now=now,
                expires_at=now + timedelta(seconds=self.ttl_seconds),
            )
        return _CartRecordAccess(cart=cart)

    async def _set_quantity(
        self,
        cart: Cart,
        item: CartItem | None,
        sku_id: UUID,
        quantity: int,
    ) -> CartAccess:
        now = self.clock.now()
        expires_at = now + timedelta(seconds=self.ttl_seconds)
        await self.inventory.reserve(cart.id, sku_id, quantity, expires_at)
        sku = await self.repository.get_sku(sku_id)
        if sku is None:
            raise ApiError(status=404, code="SKU_NOT_FOUND", title="SKU not found")
        if item is None:
            await self.repository.add_item(cart, sku, quantity=quantity)
        else:
            await self.repository.update_item(item, sku, quantity=quantity)
        cart.refresh_activity(now, ttl_seconds=self.ttl_seconds)
        await self.repository.flush()
        return CartAccess(cart=self._view(cart))

    def _refresh(self, cart: Cart) -> None:
        cart.refresh_activity(self.clock.now(), ttl_seconds=self.ttl_seconds)

    @staticmethod
    def _item(cart: Cart, sku_id: UUID) -> CartItem | None:
        return next((item for item in cart.items if item.sku_id == sku_id), None)

    @staticmethod
    def _view(cart: Cart) -> CartView:
        items = tuple(
            CartItemView(
                sku_id=item.sku_id,
                sku_code=item.sku.sku_code,
                product_id=item.sku.product_id,
                name_he=item.sku.product.name_he,
                attributes=dict(item.sku.attributes),
                quantity=item.quantity,
                unit_price_agorot=item.latest_displayed_price_agorot,
                line_total_agorot=item.latest_displayed_price_agorot * item.quantity,
                stock_quantity=item.sku.stock_quantity,
                is_active=item.sku.is_active and item.sku.product.is_active,
            )
            for item in cart.items
        )
        totals = calculate_cart_totals(
            (item.unit_price_agorot, item.quantity) for item in items
        )
        return CartView(
            id=cart.id,
            status=cart.status,
            items=items,
            subtotal_agorot=totals.subtotal_agorot,
            total_quantity=totals.total_quantity,
            currency=totals.currency,
            last_activity_at=cart.last_activity_at,
            expires_at=cart.expires_at,
            version=cart.version,
        )
