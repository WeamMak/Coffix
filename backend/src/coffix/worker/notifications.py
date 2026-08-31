import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta

from coffix.core.clock import Clock
from coffix.core.database import SessionFactory
from coffix.notifications.providers import (
    PushMessage,
    PushProvider,
    PushResult,
    PushResultStatus,
)
from coffix.notifications.repository import NotificationDeliveryRepository

logger = logging.getLogger(__name__)

DELIVERY_LEASE = timedelta(minutes=5)
MAX_DELIVERY_ATTEMPTS = 5
BASE_RETRY_SECONDS = 30
MAX_RETRY_SECONDS = 3600


@dataclass(frozen=True, slots=True)
class DeliveryPassSummary:
    claimed_count: int
    sent_count: int
    retry_count: int
    dead_letter_count: int


async def run_notification_delivery_pass(
    session_factory: SessionFactory,
    *,
    provider: PushProvider,
    clock: Clock,
    batch_size: int = 100,
) -> DeliveryPassSummary:
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    now = clock.now()
    async with session_factory() as session, session.begin():
        delivery_ids = await NotificationDeliveryRepository(session).claim_batch(
            now=now,
            batch_size=batch_size,
            lease_timeout=DELIVERY_LEASE,
        )

    sent_count = 0
    retry_count = 0
    dead_letter_count = 0
    for delivery_id in delivery_ids:
        async with session_factory() as session:
            delivery = await NotificationDeliveryRepository(session).get_with_message(delivery_id)
            if delivery is None:
                continue
            notification = delivery.notification
            token = delivery.device_token
            message = PushMessage(
                delivery_id=delivery.id,
                notification_id=notification.id,
                device_token=token.token,
                title=notification.title_he,
                body=notification.body_he,
                data={
                    "notification_id": str(notification.id),
                    "type": notification.type,
                    "related_entity_type": notification.related_entity_type,
                    "related_entity_id": (
                        str(notification.related_entity_id)
                        if notification.related_entity_id is not None
                        else ""
                    ),
                },
            )
        try:
            result = await provider.send(message)
        except Exception as exc:
            logger.warning(
                "Push delivery failed",
                extra={"delivery_id": str(delivery_id), "error_code": type(exc).__name__},
            )
            result = PushResult(
                status=PushResultStatus.RETRYABLE_FAILURE,
                error_code=type(exc).__name__,
            )
        async with session_factory() as session, session.begin():
            repository = NotificationDeliveryRepository(session)
            delivery = await repository.get_for_update(delivery_id)
            if delivery is None:
                continue
            if result.status is PushResultStatus.SENT:
                await repository.mark_sent(
                    delivery,
                    now=now,
                    provider_message_id=result.provider_message_id,
                )
                sent_count += 1
            elif result.status is PushResultStatus.INVALID_TOKEN:
                await repository.mark_invalid_token(
                    delivery,
                    now=now,
                    error_code=result.error_code or "INVALID_TOKEN",
                )
                dead_letter_count += 1
            else:
                retry_seconds = min(
                    BASE_RETRY_SECONDS * (2 ** max(delivery.attempt_count - 1, 0)),
                    MAX_RETRY_SECONDS,
                )
                dead = await repository.mark_retryable_failure(
                    delivery,
                    now=now,
                    error_code=result.error_code or "PUSH_RETRYABLE_FAILURE",
                    max_attempts=MAX_DELIVERY_ATTEMPTS,
                    retry_delay=timedelta(seconds=retry_seconds),
                )
                dead_letter_count += int(dead)
                retry_count += int(not dead)
    return DeliveryPassSummary(
        claimed_count=len(delivery_ids),
        sent_count=sent_count,
        retry_count=retry_count,
        dead_letter_count=dead_letter_count,
    )


async def run_notification_delivery_loop(
    session_factory: SessionFactory,
    *,
    provider: PushProvider,
    clock: Clock,
    stop_event: asyncio.Event,
    interval_seconds: float = 2,
    batch_size: int = 100,
    on_pass: Callable[[DeliveryPassSummary], None] | None = None,
) -> None:
    if interval_seconds <= 0:
        raise ValueError("interval_seconds must be positive")
    while not stop_event.is_set():
        summary = await run_notification_delivery_pass(
            session_factory,
            provider=provider,
            clock=clock,
            batch_size=batch_size,
        )
        if on_pass is not None:
            on_pass(summary)
        if summary.claimed_count == batch_size:
            continue
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
