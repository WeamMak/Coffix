from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol
from uuid import UUID

from coffix.api.errors import ApiError
from coffix.catalog.models import ProductSku
from coffix.core.clock import Clock
from coffix.core.types import CartId, OrderId
from coffix.inventory.repository import InventoryRepository


class InventoryConflict(ApiError):
    def __init__(self, code: str, title: str) -> None:
        super().__init__(status=409, code=code, title=title)


@dataclass(frozen=True, slots=True)
class ReservationResult:
    is_tracked: bool
    quantity: int
    reserved_quantity: int
    available_quantity: int | None


@dataclass(frozen=True, slots=True)
class ReservationMutationResult:
    affected_count: int
    quantity: int


InventoryMetricKind = Literal["reserve", "release", "conflict"]


@dataclass(frozen=True, slots=True)
class InventoryMetricEvent:
    kind: InventoryMetricKind
    quantity: int = 0
    code: str | None = None


class InventoryMetrics(Protocol):
    def record(self, event: InventoryMetricEvent) -> None: ...


class NoopInventoryMetrics:
    def record(self, event: InventoryMetricEvent) -> None:
        del event


def calculate_reservation(
    *,
    stock_quantity: int | None,
    reserved_by_others: int,
    current_quantity: int,
    desired_quantity: int,
) -> ReservationResult:
    if desired_quantity < 0:
        raise ValueError("desired_quantity must be non-negative")
    if current_quantity < 0 or reserved_by_others < 0:
        raise ValueError("reservation quantities must be non-negative")
    if stock_quantity is None:
        return ReservationResult(
            is_tracked=False,
            quantity=desired_quantity,
            reserved_quantity=0,
            available_quantity=None,
        )

    available_to_owner = stock_quantity - reserved_by_others
    if desired_quantity > available_to_owner:
        raise InventoryConflict("INSUFFICIENT_STOCK", "Insufficient stock")
    return ReservationResult(
        is_tracked=True,
        quantity=desired_quantity,
        reserved_quantity=desired_quantity,
        available_quantity=available_to_owner - desired_quantity,
    )


class InventoryService:
    def __init__(
        self,
        repository: InventoryRepository,
        *,
        clock: Clock,
        metrics: InventoryMetrics | None = None,
    ) -> None:
        self.repository = repository
        self.clock = clock
        self.metrics = metrics or NoopInventoryMetrics()

    async def reserve(
        self,
        cart_id: CartId,
        sku_id: UUID,
        desired_quantity: int,
        expires_at: datetime,
    ) -> ReservationResult:
        if desired_quantity < 0:
            raise ValueError("desired_quantity must be non-negative")

        locked = await self.repository.lock_sku(sku_id)
        if locked is None:
            raise ApiError(status=404, code="SKU_NOT_FOUND", title="SKU not found")
        sku, product_is_active = locked
        now = self.clock.now()
        current = await self.repository.get_active_cart_reservation(cart_id, sku_id)
        if current is not None and current.expires_at <= now:
            self._conflict("RESERVATION_EXPIRED")
            raise InventoryConflict("RESERVATION_EXPIRED", "Reservation has expired")
        current_quantity = current.quantity if current is not None else 0
        if (not sku.is_active or not product_is_active) and desired_quantity > current_quantity:
            self._conflict("SKU_INACTIVE")
            raise InventoryConflict("SKU_INACTIVE", "SKU is inactive")
        if desired_quantity > 0 and expires_at <= now:
            self._conflict("RESERVATION_EXPIRED")
            raise InventoryConflict("RESERVATION_EXPIRED", "Reservation has expired")

        reserved_by_others = await self.repository.reserved_quantity_for_sku(
            sku_id,
            now=now,
            excluding_reservation_id=current.id if current is not None else None,
        )
        try:
            result = calculate_reservation(
                stock_quantity=sku.stock_quantity,
                reserved_by_others=reserved_by_others,
                current_quantity=current_quantity,
                desired_quantity=desired_quantity,
            )
        except InventoryConflict as conflict:
            self._conflict(conflict.code)
            raise

        if not result.is_tracked:
            if current is not None and current.release(now):
                await self.repository.flush()
                self._released(current.quantity)
            return result

        if desired_quantity == 0:
            if current is not None and current.release(now):
                await self.repository.flush()
                self._released(current.quantity)
            return result

        previous_quantity = current.quantity if current is not None else 0
        if current is None:
            await self.repository.create_cart_reservation(
                cart_id=cart_id,
                sku_id=sku_id,
                quantity=desired_quantity,
                expires_at=expires_at,
            )
        else:
            current.quantity = desired_quantity
            current.expires_at = expires_at
            await self.repository.flush()
        quantity_change = desired_quantity - previous_quantity
        if quantity_change > 0:
            self._reserved(quantity_change)
        elif quantity_change < 0:
            self._released(-quantity_change)
        return result

    async def release_cart(self, cart_id: CartId) -> ReservationMutationResult:
        now = self.clock.now()
        reservations = await self.repository.active_cart_reservations(cart_id)
        released_quantity = sum(reservation.quantity for reservation in reservations)
        affected = sum(reservation.release(now) for reservation in reservations)
        if affected:
            await self.repository.flush()
            self._released(released_quantity)
        return ReservationMutationResult(affected_count=affected, quantity=released_quantity)

    async def transfer_to_order(
        self,
        cart_id: CartId,
        order_id: OrderId,
        expires_at: datetime,
    ) -> ReservationMutationResult:
        now = self.clock.now()
        reservations = await self.repository.active_cart_reservations(cart_id)
        if any(reservation.expires_at <= now for reservation in reservations):
            self._conflict("RESERVATION_EXPIRED")
            raise InventoryConflict("RESERVATION_EXPIRED", "Reservation has expired")
        if reservations and expires_at <= now:
            self._conflict("RESERVATION_EXPIRED")
            raise InventoryConflict("RESERVATION_EXPIRED", "Reservation has expired")

        quantity = sum(reservation.quantity for reservation in reservations)
        for reservation in reservations:
            reservation.cart_id = None
            reservation.order_id = order_id
            reservation.expires_at = expires_at
        if reservations:
            await self.repository.flush()
        return ReservationMutationResult(affected_count=len(reservations), quantity=quantity)

    async def consume_order(self, order_id: OrderId) -> ReservationMutationResult:
        now = self.clock.now()
        reservations = await self.repository.active_order_reservations(order_id)
        if any(reservation.expires_at <= now for reservation in reservations):
            self._conflict("RESERVATION_EXPIRED")
            raise InventoryConflict("RESERVATION_EXPIRED", "Reservation has expired")

        quantity = sum(reservation.quantity for reservation in reservations)
        for reservation in reservations:
            sku = await self._locked_sku(reservation.sku_id)
            if sku.stock_quantity is not None:
                if sku.stock_quantity < reservation.quantity:
                    self._conflict("INSUFFICIENT_STOCK")
                    raise InventoryConflict("INSUFFICIENT_STOCK", "Insufficient stock")
                sku.stock_quantity -= reservation.quantity
            reservation.consume(now)
        if reservations:
            await self.repository.flush()
        return ReservationMutationResult(affected_count=len(reservations), quantity=quantity)

    async def release_order(self, order_id: OrderId) -> ReservationMutationResult:
        now = self.clock.now()
        reservations = await self.repository.active_order_reservations(order_id)
        released_quantity = sum(reservation.quantity for reservation in reservations)
        affected = sum(reservation.release(now) for reservation in reservations)
        if affected:
            await self.repository.flush()
            self._released(released_quantity)
        return ReservationMutationResult(affected_count=affected, quantity=released_quantity)

    async def _locked_sku(self, sku_id: UUID) -> ProductSku:
        locked = await self.repository.lock_sku(sku_id)
        if locked is None:
            raise ApiError(status=404, code="SKU_NOT_FOUND", title="SKU not found")
        return locked[0]

    def _reserved(self, quantity: int) -> None:
        self.metrics.record(InventoryMetricEvent(kind="reserve", quantity=quantity))

    def _released(self, quantity: int) -> None:
        self.metrics.record(InventoryMetricEvent(kind="release", quantity=quantity))

    def _conflict(self, code: str) -> None:
        self.metrics.record(InventoryMetricEvent(kind="conflict", code=code))
