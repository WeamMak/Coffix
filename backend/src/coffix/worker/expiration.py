import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from coffix.carts.repository import CartRepository
from coffix.core.clock import Clock
from coffix.core.database import SessionFactory
from coffix.inventory.repository import InventoryRepository
from coffix.inventory.service import InventoryService


@dataclass(frozen=True, slots=True)
class ExpirationSummary:
    scanned_count: int
    expired_count: int
    released_reservation_count: int
    released_quantity: int


class CartExpirationService:
    def __init__(
        self,
        carts: CartRepository,
        inventory: InventoryService,
    ) -> None:
        self.carts = carts
        self.inventory = inventory

    async def expire_carts(self, now: datetime, batch_size: int) -> ExpirationSummary:
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")
        carts = await self.carts.lock_expired_batch(now, batch_size=batch_size)
        expired_count = 0
        released_count = 0
        released_quantity = 0
        for cart in carts:
            released = await self.inventory.release_cart(cart.id)
            released_count += released.affected_count
            released_quantity += released.quantity
            expired_count += int(cart.expire(now))
        if carts:
            await self.carts.flush()
        return ExpirationSummary(
            scanned_count=len(carts),
            expired_count=expired_count,
            released_reservation_count=released_count,
            released_quantity=released_quantity,
        )


async def run_expiration_pass(
    session_factory: SessionFactory,
    *,
    clock: Clock,
    batch_size: int,
) -> ExpirationSummary:
    async with session_factory() as session, session.begin():
        service = CartExpirationService(
            CartRepository(session),
            InventoryService(InventoryRepository(session), clock=clock),
        )
        return await service.expire_carts(clock.now(), batch_size)


async def run_expiration_loop(
    session_factory: SessionFactory,
    *,
    clock: Clock,
    stop_event: asyncio.Event,
    interval_seconds: float = 30,
    batch_size: int = 100,
    on_pass: Callable[[ExpirationSummary], None] | None = None,
) -> None:
    if interval_seconds <= 0:
        raise ValueError("interval_seconds must be positive")
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")

    while not stop_event.is_set():
        summary = await run_expiration_pass(
            session_factory,
            clock=clock,
            batch_size=batch_size,
        )
        if on_pass is not None:
            on_pass(summary)
        if stop_event.is_set():
            return
        if summary.expired_count == batch_size:
            continue
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
