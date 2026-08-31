from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from coffix.core.clock import FakeClock
from coffix.notifications.adapters.fake import FakePushProvider
from coffix.notifications.models import (
    DeliveryState,
    DevicePlatform,
    DeviceToken,
    Notification,
    NotificationDelivery,
    OutboxEvent,
)
from coffix.notifications.providers import PushResult, PushResultStatus
from coffix.users.models import Role
from coffix.users.repository import UserRepository
from coffix.worker.notifications import run_notification_delivery_pass
from coffix.worker.outbox import run_outbox_pass

NOW = datetime(2026, 8, 31, 20, 0, tzinfo=UTC)


@pytest.mark.asyncio
async def test_outbox_is_idempotent_recovers_stale_claims_and_creates_in_app_without_push(
    migrated_database_url: str,
) -> None:
    engine = create_async_engine(migrated_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    clock = FakeClock(NOW)
    try:
        async with factory() as session, session.begin():
            users = UserRepository(session)
            customer = await users.create(phone_e164="+972501235801", role=Role.CUSTOMER)
            no_device = await users.create(phone_e164="+972501235802", role=Role.CUSTOMER)
            token = DeviceToken(
                user_id=customer.id,
                token="outbox-device",
                platform=DevicePlatform.ANDROID,
                is_active=True,
                last_registered_at=NOW,
            )
            shipped = OutboxEvent(
                event_type="order.shipped",
                aggregate_type="order",
                aggregate_id=customer.id,
                payload={"customer_id": str(customer.id)},
                available_at=NOW,
            )
            stale = OutboxEvent(
                event_type="order.delivered",
                aggregate_type="order",
                aggregate_id=customer.id,
                payload={"customer_id": str(customer.id)},
                available_at=NOW,
                claimed_at=NOW,
                attempt_count=1,
            )
            mandatory = OutboxEvent(
                event_type="service.request.completed",
                aggregate_type="service_request",
                aggregate_id=no_device.id,
                payload={"customer_id": str(no_device.id)},
                available_at=NOW,
            )
            session.add_all([token, shipped, stale, mandatory])
            await session.flush()

        first = await run_outbox_pass(factory, clock=clock, batch_size=10)
        assert first.claimed_count == 2
        assert first.processed_count == 2

        async with factory() as session, session.begin():
            shipped.processed_at = None
            shipped.claimed_at = None
            merged = await session.merge(shipped)
            await session.flush()
            assert merged.processed_at is None

        duplicate = await run_outbox_pass(factory, clock=clock, batch_size=10)
        assert duplicate.processed_count == 1
        async with factory() as session:
            notification_count = await session.scalar(select(func.count(Notification.id)))
            delivery_count = await session.scalar(select(func.count(NotificationDelivery.id)))
        assert notification_count == 2
        assert delivery_count == 1

        clock.advance(timedelta(seconds=301))
        restarted = await run_outbox_pass(factory, clock=clock, batch_size=10)
        assert restarted.processed_count == 1
        async with factory() as session:
            notification_count = await session.scalar(select(func.count(Notification.id)))
            delivery_count = await session.scalar(select(func.count(NotificationDelivery.id)))
        assert notification_count == 3
        assert delivery_count == 2
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_push_delivery_retries_deactivates_invalid_tokens_and_dead_letters(
    migrated_database_url: str,
) -> None:
    engine = create_async_engine(migrated_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    clock = FakeClock(NOW)
    provider = FakePushProvider()
    try:
        async with factory() as session, session.begin():
            customer = await UserRepository(session).create(
                phone_e164="+972501235803", role=Role.CUSTOMER
            )
            tokens = [
                DeviceToken(
                    user_id=customer.id,
                    token=token,
                    platform=DevicePlatform.ANDROID,
                    is_active=True,
                    last_registered_at=NOW,
                )
                for token in ("retry-device", "invalid-device", "dead-device")
            ]
            event = OutboxEvent(
                event_type="order.shipped",
                aggregate_type="order",
                aggregate_id=customer.id,
                payload={"customer_id": str(customer.id)},
                available_at=NOW,
            )
            session.add_all([*tokens, event])
        await run_outbox_pass(factory, clock=clock, batch_size=10)

        provider.queue_result(
            "retry-device",
            PushResult(status=PushResultStatus.RETRYABLE_FAILURE, error_code="UNAVAILABLE"),
        )
        provider.queue_result(
            "invalid-device",
            PushResult(status=PushResultStatus.INVALID_TOKEN, error_code="UNREGISTERED"),
        )
        for _ in range(5):
            provider.queue_result(
                "dead-device",
                PushResult(status=PushResultStatus.RETRYABLE_FAILURE, error_code="UNAVAILABLE"),
            )

        first = await run_notification_delivery_pass(
            factory,
            provider=provider,
            clock=clock,
            batch_size=10,
        )
        assert first.claimed_count == 3
        assert first.sent_count == 0
        assert first.retry_count == 2
        assert first.dead_letter_count == 1

        async with factory() as session:
            rows = list(
                    await session.scalars(
                        select(NotificationDelivery)
                        .options(selectinload(NotificationDelivery.device_token))
                        .order_by(NotificationDelivery.id)
                )
            )
            by_token = {row.device_token.token: row for row in rows}
            invalid_token = await session.scalar(
                select(DeviceToken).where(DeviceToken.token == "invalid-device")
            )
        assert by_token["retry-device"].state is DeliveryState.RETRY
        assert by_token["retry-device"].next_attempt_at == NOW + timedelta(seconds=30)
        assert by_token["invalid-device"].state is DeliveryState.DEAD_LETTER
        assert invalid_token is not None and invalid_token.is_active is False
        assert invalid_token.invalidated_at == NOW

        early = await run_notification_delivery_pass(
            factory,
            provider=provider,
            clock=clock,
            batch_size=10,
        )
        assert early.claimed_count == 0

        for delay in (30, 60, 120, 240):
            clock.advance(timedelta(seconds=delay))
            await run_notification_delivery_pass(
                factory,
                provider=provider,
                clock=clock,
                batch_size=10,
            )

        async with factory() as session:
            rows = list(
                await session.scalars(
                    select(NotificationDelivery).options(
                        selectinload(NotificationDelivery.device_token)
                    )
                )
            )
            by_token = {row.device_token.token: row for row in rows}
        assert by_token["retry-device"].state is DeliveryState.SENT
        assert by_token["retry-device"].attempt_count == 2
        assert by_token["dead-device"].state is DeliveryState.DEAD_LETTER
        assert by_token["dead-device"].attempt_count == 5
        assert by_token["dead-device"].dead_lettered_at == clock.now()
        assert by_token["dead-device"].last_error_code == "UNAVAILABLE"
    finally:
        await engine.dispose()
