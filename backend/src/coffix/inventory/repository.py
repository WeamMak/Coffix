from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.catalog.models import Product, ProductSku
from coffix.inventory.models import ReservationState, StockReservation


class InventoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def lock_sku(self, sku_id: UUID) -> tuple[ProductSku, bool] | None:
        row = (
            await self.session.execute(
                select(ProductSku, Product.is_active)
                .join(Product, Product.id == ProductSku.product_id)
                .where(ProductSku.id == sku_id)
                .with_for_update(of=(ProductSku, Product))
            )
        ).one_or_none()
        if row is None:
            return None
        return row[0], row[1]

    async def get_active_cart_reservation(
        self,
        cart_id: UUID,
        sku_id: UUID,
    ) -> StockReservation | None:
        return await self.session.scalar(
            select(StockReservation)
            .where(
                StockReservation.cart_id == cart_id,
                StockReservation.sku_id == sku_id,
                StockReservation.state == ReservationState.ACTIVE,
            )
            .with_for_update()
        )

    async def reserved_quantity_for_sku(
        self,
        sku_id: UUID,
        *,
        now: datetime,
        excluding_reservation_id: UUID | None = None,
    ) -> int:
        statement = select(func.coalesce(func.sum(StockReservation.quantity), 0)).where(
            StockReservation.sku_id == sku_id,
            StockReservation.state == ReservationState.ACTIVE,
            StockReservation.expires_at > now,
        )
        if excluding_reservation_id is not None:
            statement = statement.where(StockReservation.id != excluding_reservation_id)
        return int(await self.session.scalar(statement) or 0)

    async def create_cart_reservation(
        self,
        *,
        cart_id: UUID,
        sku_id: UUID,
        quantity: int,
        expires_at: datetime,
    ) -> StockReservation:
        reservation = StockReservation(
            cart_id=cart_id,
            sku_id=sku_id,
            quantity=quantity,
            expires_at=expires_at,
            state=ReservationState.ACTIVE,
        )
        self.session.add(reservation)
        await self.session.flush()
        return reservation

    async def active_cart_reservations(self, cart_id: UUID) -> list[StockReservation]:
        reservations = await self.session.scalars(
            select(StockReservation)
            .where(
                StockReservation.cart_id == cart_id,
                StockReservation.state == ReservationState.ACTIVE,
            )
            .order_by(StockReservation.sku_id)
            .with_for_update()
        )
        return list(reservations)

    async def active_order_reservations(self, order_id: UUID) -> list[StockReservation]:
        reservations = await self.session.scalars(
            select(StockReservation)
            .where(
                StockReservation.order_id == order_id,
                StockReservation.state == ReservationState.ACTIVE,
            )
            .order_by(StockReservation.sku_id)
            .with_for_update()
        )
        return list(reservations)

    async def flush(self) -> None:
        await self.session.flush()
