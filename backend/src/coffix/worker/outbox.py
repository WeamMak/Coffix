import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta

from coffix.core.clock import Clock
from coffix.core.database import SessionFactory
from coffix.notifications.repository import NotificationRepository, OutboxRepository
from coffix.notifications.service import NotificationEvent, notification_drafts_for

logger = logging.getLogger(__name__)

OUTBOX_LEASE = timedelta(minutes=5)
MAX_OUTBOX_ATTEMPTS = 5
BASE_RETRY_SECONDS = 30


@dataclass(frozen=True, slots=True)
class OutboxPassSummary:
    claimed_count: int
    processed_count: int
    retry_count: int
    dead_letter_count: int


async def run_outbox_pass(
    session_factory: SessionFactory,
    *,
    clock: Clock,
    batch_size: int = 100,
) -> OutboxPassSummary:
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    now = clock.now()
    async with session_factory() as session, session.begin():
        event_ids = await OutboxRepository(session).claim_batch(
            now=now,
            batch_size=batch_size,
            lease_timeout=OUTBOX_LEASE,
        )

    processed_count = 0
    retry_count = 0
    dead_letter_count = 0
    for event_id in event_ids:
        try:
            async with session_factory() as session, session.begin():
                outbox = OutboxRepository(session)
                event = await outbox.get_claimed_for_update(event_id)
                if event is None:
                    continue
                drafts = notification_drafts_for(
                    NotificationEvent(
                        id=event.id,
                        event_type=event.event_type,
                        aggregate_type=event.aggregate_type,
                        aggregate_id=event.aggregate_id,
                        payload=dict(event.payload),
                    )
                )
                notifications = NotificationRepository(session)
                for draft in drafts:
                    await notifications.create_notification(
                        event_id=draft.event_id,
                        recipient_id=draft.recipient_id,
                        notification_type=draft.type,
                        title_he=draft.title_he,
                        body_he=draft.body_he,
                        related_entity_type=draft.related_entity_type,
                        related_entity_id=draft.related_entity_id,
                        available_at=now,
                    )
                await outbox.mark_processed(event, now=now)
                processed_count += 1
        except Exception as exc:
            error_code = type(exc).__name__
            logger.warning(
                "Outbox notification event failed",
                extra={"event_id": str(event_id), "error_code": error_code},
            )
            async with session_factory() as session, session.begin():
                outbox = OutboxRepository(session)
                event = await outbox.get_claimed_for_update(event_id)
                if event is None:
                    continue
                delay = timedelta(
                    seconds=BASE_RETRY_SECONDS * (2 ** max(event.attempt_count - 1, 0))
                )
                dead = await outbox.mark_failed(
                    event,
                    now=now,
                    max_attempts=MAX_OUTBOX_ATTEMPTS,
                    error_code=error_code,
                    retry_delay=delay,
                )
                dead_letter_count += int(dead)
                retry_count += int(not dead)
    return OutboxPassSummary(
        claimed_count=len(event_ids),
        processed_count=processed_count,
        retry_count=retry_count,
        dead_letter_count=dead_letter_count,
    )


async def run_outbox_loop(
    session_factory: SessionFactory,
    *,
    clock: Clock,
    stop_event: asyncio.Event,
    interval_seconds: float = 2,
    batch_size: int = 100,
    on_pass: Callable[[OutboxPassSummary], None] | None = None,
) -> None:
    if interval_seconds <= 0:
        raise ValueError("interval_seconds must be positive")
    while not stop_event.is_set():
        summary = await run_outbox_pass(session_factory, clock=clock, batch_size=batch_size)
        if on_pass is not None:
            on_pass(summary)
        if summary.claimed_count == batch_size:
            continue
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
