from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from coffix.carts.models import Cart, CartItem, CartStatus
from coffix.catalog.models import Product, ProductSku
from coffix.users.models import User


class CartRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def lock_customer(self, customer_id: UUID) -> bool:
        user = await self.session.get(User, customer_id, with_for_update=True)
        return user is not None

    async def get_active_for_customer(
        self,
        customer_id: UUID,
        *,
        for_update: bool = False,
    ) -> Cart | None:
        statement = (
            select(Cart)
            .where(
                Cart.customer_id == customer_id,
                Cart.status == CartStatus.ACTIVE,
            )
            .options(
                selectinload(Cart.items)
                .selectinload(CartItem.sku)
                .selectinload(ProductSku.product)
                .selectinload(Product.media)
            )
        )
        if for_update:
            statement = statement.with_for_update(of=Cart)
        return await self.session.scalar(statement)

    async def create(self, customer_id: UUID, *, now: datetime, expires_at: datetime) -> Cart:
        cart = Cart(
            customer_id=customer_id,
            status=CartStatus.ACTIVE,
            last_activity_at=now,
            expires_at=expires_at,
            version=1,
            items=[],
        )
        self.session.add(cart)
        await self.session.flush()
        return cart

    async def get_sku(self, sku_id: UUID) -> ProductSku | None:
        return await self.session.scalar(
            select(ProductSku)
            .where(ProductSku.id == sku_id)
            .options(selectinload(ProductSku.product).selectinload(Product.media))
        )

    async def lock_expired_batch(self, now: datetime, *, batch_size: int) -> list[Cart]:
        carts = await self.session.scalars(
            select(Cart)
            .where(
                Cart.status == CartStatus.ACTIVE,
                Cart.expires_at <= now,
            )
            .order_by(Cart.expires_at, Cart.id)
            .limit(batch_size)
            .with_for_update(of=Cart, skip_locked=True)
        )
        return list(carts)

    async def add_item(
        self,
        cart: Cart,
        sku: ProductSku,
        *,
        quantity: int,
    ) -> CartItem:
        item = CartItem(
            cart_id=cart.id,
            sku_id=sku.id,
            quantity=quantity,
            latest_displayed_price_agorot=sku.price_agorot,
            currency="ILS",
            sku=sku,
        )
        cart.items.append(item)
        await self.session.flush()
        return item

    async def update_item(
        self,
        item: CartItem,
        sku: ProductSku,
        *,
        quantity: int,
    ) -> None:
        item.quantity = quantity
        item.latest_displayed_price_agorot = sku.price_agorot
        item.currency = "ILS"
        await self.session.flush()

    async def remove_item(self, cart: Cart, item: CartItem) -> None:
        cart.items.remove(item)
        await self.session.delete(item)
        await self.session.flush()

    async def flush(self) -> None:
        await self.session.flush()
