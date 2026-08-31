from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.interfaces import ORMOption

from coffix.machines.models import MachineModel
from coffix.orders.models import (
    Order,
    OrderItem,
    OrderState,
    OrderStatusHistory,
    Shipment,
)
from coffix.users.models import Address


class OrderRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _loaded() -> tuple[ORMOption, ...]:
        return (
            selectinload(Order.items),
            selectinload(Order.history),
            selectinload(Order.shipment),
        )

    async def get_by_checkout_key(
        self, customer_id: UUID, idempotency_key: str, *, for_update: bool = False
    ) -> Order | None:
        statement = (
            select(Order)
            .where(
                Order.customer_id == customer_id,
                Order.checkout_idempotency_key == idempotency_key,
            )
            .options(*self._loaded())
        )
        if for_update:
            statement = statement.with_for_update(of=Order)
        return await self.session.scalar(statement)

    async def get(self, order_id: UUID, *, for_update: bool = False) -> Order | None:
        statement = select(Order).where(Order.id == order_id).options(*self._loaded())
        if for_update:
            statement = statement.with_for_update(of=Order)
        return await self.session.scalar(statement)

    async def get_for_customer(self, order_id: UUID, customer_id: UUID) -> Order | None:
        return await self.session.scalar(
            select(Order)
            .where(Order.id == order_id, Order.customer_id == customer_id)
            .options(*self._loaded())
        )

    async def list_for_customer(self, customer_id: UUID) -> list[Order]:
        orders = await self.session.scalars(
            select(Order)
            .where(Order.customer_id == customer_id)
            .options(*self._loaded())
            .order_by(Order.created_at.desc(), Order.id.desc())
        )
        return list(orders)

    async def get_address(self, customer_id: UUID, address_id: UUID) -> Address | None:
        return await self.session.scalar(
            select(Address).where(Address.id == address_id, Address.user_id == customer_id)
        )

    async def get_machine_models(self, model_ids: set[UUID]) -> dict[UUID, MachineModel]:
        if not model_ids:
            return {}
        models = await self.session.scalars(
            select(MachineModel).where(MachineModel.id.in_(model_ids))
        )
        return {model.id: model for model in models}

    async def lock_expired_batch(self, now: datetime, *, batch_size: int) -> list[Order]:
        orders = await self.session.scalars(
            select(Order)
            .where(
                Order.state == OrderState.PENDING_PAYMENT,
                Order.payment_deadline <= now,
            )
            .order_by(Order.payment_deadline, Order.id)
            .limit(batch_size)
            .options(*self._loaded())
            .with_for_update(of=Order, skip_locked=True)
        )
        return list(orders)

    async def create(
        self,
        *,
        order_id: UUID,
        customer_id: UUID,
        source_cart_id: UUID,
        order_number: str,
        subtotal_agorot: int,
        shipping_agorot: int,
        total_agorot: int,
        address_snapshot: dict[str, object],
        payment_deadline: datetime,
        checkout_idempotency_key: str,
        checkout_fingerprint: str,
        items: list[dict[str, object]],
    ) -> Order:
        order = Order(
            id=order_id,
            customer_id=customer_id,
            source_cart_id=source_cart_id,
            order_number=order_number,
            state=OrderState.PENDING_PAYMENT,
            subtotal_agorot=subtotal_agorot,
            shipping_agorot=shipping_agorot,
            total_agorot=total_agorot,
            currency="ILS",
            address_snapshot=address_snapshot,
            payment_deadline=payment_deadline,
            checkout_idempotency_key=checkout_idempotency_key,
            checkout_fingerprint=checkout_fingerprint,
            shipment=None,
            items=[OrderItem(**item) for item in items],
            history=[
                OrderStatusHistory(
                    from_state=None,
                    to_state=OrderState.PENDING_PAYMENT,
                    actor_id=customer_id,
                    source="customer",
                )
            ],
        )
        self.session.add(order)
        await self.session.flush()
        return order

    async def transition(
        self,
        order: Order,
        state: OrderState,
        *,
        actor_id: UUID | None,
        source: str,
        reason: str | None = None,
    ) -> None:
        previous = order.state
        order.state = state
        order.history.append(
            OrderStatusHistory(
                from_state=previous,
                to_state=state,
                actor_id=actor_id,
                source=source,
                reason=reason,
            )
        )
        await self.session.flush()

    async def create_shipment(
        self,
        order: Order,
        *,
        carrier: str,
        tracking_number: str,
        tracking_url: str | None,
        shipped_at: datetime,
    ) -> Shipment:
        shipment = Shipment(
            order_id=order.id,
            order=order,
            carrier=carrier,
            tracking_number=tracking_number,
            tracking_url=tracking_url,
            shipped_at=shipped_at,
        )
        order.shipment = shipment
        self.session.add(shipment)
        await self.session.flush()
        return shipment

    async def flush(self) -> None:
        await self.session.flush()
