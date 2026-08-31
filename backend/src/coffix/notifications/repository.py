from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from coffix.notifications.models import (
    DeliveryState,
    DevicePlatform,
    DeviceToken,
    Notification,
    NotificationDelivery,
    OutboxEvent,
)


class NotificationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_for_recipient(
        self,
        recipient_id: UUID,
        *,
        limit: int,
        offset: int,
    ) -> list[Notification]:
        notifications = await self.session.scalars(
            select(Notification)
            .where(Notification.recipient_id == recipient_id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(notifications)

    async def unread_count(self, recipient_id: UUID) -> int:
        return int(
            await self.session.scalar(
                select(func.count(Notification.id)).where(
                    Notification.recipient_id == recipient_id,
                    Notification.read_at.is_(None),
                )
            )
            or 0
        )

    async def get_owned_for_update(
        self,
        notification_id: UUID,
        recipient_id: UUID,
    ) -> Notification | None:
        return await self.session.scalar(
            select(Notification)
            .where(
                Notification.id == notification_id,
                Notification.recipient_id == recipient_id,
            )
            .with_for_update()
        )

    async def register_device_token(
        self,
        *,
        user_id: UUID,
        token: str,
        platform: DevicePlatform,
        registered_at: datetime,
    ) -> DeviceToken:
        token_id = await self.session.scalar(
            insert(DeviceToken)
            .values(
                user_id=user_id,
                token=token,
                platform=platform,
                is_active=True,
                invalidated_at=None,
                last_registered_at=registered_at,
            )
            .on_conflict_do_update(
                index_elements=[DeviceToken.token],
                set_={
                    "user_id": user_id,
                    "platform": platform,
                    "is_active": True,
                    "invalidated_at": None,
                    "last_registered_at": registered_at,
                    "updated_at": registered_at,
                },
            )
            .returning(DeviceToken.id)
        )
        assert token_id is not None
        token_record = await self.session.get(DeviceToken, token_id)
        assert token_record is not None
        return token_record

    async def create_notification(
        self,
        *,
        event_id: UUID,
        recipient_id: UUID,
        notification_type: str,
        title_he: str,
        body_he: str,
        related_entity_type: str,
        related_entity_id: UUID,
        available_at: datetime,
    ) -> Notification:
        notification_id = await self.session.scalar(
            insert(Notification)
            .values(
                event_id=event_id,
                recipient_id=recipient_id,
                type=notification_type,
                title_he=title_he,
                body_he=body_he,
                related_entity_type=related_entity_type,
                related_entity_id=related_entity_id,
            )
            .on_conflict_do_nothing(
                index_elements=[Notification.event_id, Notification.recipient_id]
            )
            .returning(Notification.id)
        )
        if notification_id is None:
            notification_id = await self.session.scalar(
                select(Notification.id).where(
                    Notification.event_id == event_id,
                    Notification.recipient_id == recipient_id,
                )
            )
        assert notification_id is not None
        token_ids = list(
            await self.session.scalars(
                select(DeviceToken.id).where(
                    DeviceToken.user_id == recipient_id,
                    DeviceToken.is_active.is_(True),
                )
            )
        )
        if token_ids:
            await self.session.execute(
                insert(NotificationDelivery)
                .values(
                    [
                        {
                            "notification_id": notification_id,
                            "device_token_id": token_id,
                            "channel": "push",
                            "state": DeliveryState.PENDING,
                            "attempt_count": 0,
                            "next_attempt_at": available_at,
                        }
                        for token_id in token_ids
                    ]
                )
                .on_conflict_do_nothing(
                    index_elements=[
                        NotificationDelivery.notification_id,
                        NotificationDelivery.device_token_id,
                    ]
                )
            )
        notification = await self.session.get(Notification, notification_id)
        assert notification is not None
        return notification


class OutboxRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def claim_batch(
        self,
        *,
        now: datetime,
        batch_size: int,
        lease_timeout: timedelta,
    ) -> list[UUID]:
        stale_before = now - lease_timeout
        events = list(
            await self.session.scalars(
                select(OutboxEvent)
                .where(
                    OutboxEvent.processed_at.is_(None),
                    OutboxEvent.dead_lettered_at.is_(None),
                    OutboxEvent.available_at <= now,
                    or_(
                        OutboxEvent.claimed_at.is_(None),
                        OutboxEvent.claimed_at <= stale_before,
                    ),
                )
                .order_by(OutboxEvent.available_at, OutboxEvent.id)
                .limit(batch_size)
                .with_for_update(skip_locked=True)
            )
        )
        for event in events:
            event.claimed_at = now
            event.attempt_count += 1
        await self.session.flush()
        return [event.id for event in events]

    async def get_claimed_for_update(self, event_id: UUID) -> OutboxEvent | None:
        return await self.session.scalar(
            select(OutboxEvent)
            .where(
                OutboxEvent.id == event_id,
                OutboxEvent.processed_at.is_(None),
                OutboxEvent.dead_lettered_at.is_(None),
                OutboxEvent.claimed_at.is_not(None),
            )
            .with_for_update()
        )

    async def mark_processed(self, event: OutboxEvent, *, now: datetime) -> None:
        event.processed_at = now
        event.claimed_at = None
        event.last_error_code = None
        event.last_error = None
        await self.session.flush()

    async def mark_failed(
        self,
        event: OutboxEvent,
        *,
        now: datetime,
        max_attempts: int,
        error_code: str,
        retry_delay: timedelta,
    ) -> bool:
        event.claimed_at = None
        event.last_error_code = error_code[:120]
        event.last_error = "Notification event processing failed"
        if event.attempt_count >= max_attempts:
            event.dead_lettered_at = now
            dead_lettered = True
        else:
            event.available_at = now + retry_delay
            dead_lettered = False
        await self.session.flush()
        return dead_lettered


class NotificationDeliveryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def claim_batch(
        self,
        *,
        now: datetime,
        batch_size: int,
        lease_timeout: timedelta,
    ) -> list[UUID]:
        stale_before = now - lease_timeout
        deliveries = list(
            await self.session.scalars(
                select(NotificationDelivery)
                .where(
                    NotificationDelivery.state.in_(
                        [DeliveryState.PENDING, DeliveryState.RETRY]
                    ),
                    NotificationDelivery.next_attempt_at <= now,
                    or_(
                        NotificationDelivery.claimed_at.is_(None),
                        NotificationDelivery.claimed_at <= stale_before,
                    ),
                )
                .order_by(NotificationDelivery.next_attempt_at, NotificationDelivery.id)
                .limit(batch_size)
                .with_for_update(skip_locked=True)
            )
        )
        for delivery in deliveries:
            delivery.claimed_at = now
            delivery.attempt_count += 1
        await self.session.flush()
        return [delivery.id for delivery in deliveries]

    async def get_with_message(self, delivery_id: UUID) -> NotificationDelivery | None:
        return await self.session.scalar(
            select(NotificationDelivery)
            .where(NotificationDelivery.id == delivery_id)
            .options(
                selectinload(NotificationDelivery.notification),
                selectinload(NotificationDelivery.device_token),
            )
        )

    async def get_for_update(self, delivery_id: UUID) -> NotificationDelivery | None:
        return await self.session.scalar(
            select(NotificationDelivery)
            .where(NotificationDelivery.id == delivery_id)
            .options(
                selectinload(NotificationDelivery.notification),
                selectinload(NotificationDelivery.device_token),
            )
            .with_for_update(of=NotificationDelivery)
        )

    async def mark_sent(
        self,
        delivery: NotificationDelivery,
        *,
        now: datetime,
        provider_message_id: str | None,
    ) -> None:
        delivery.state = DeliveryState.SENT
        delivery.claimed_at = None
        delivery.provider_message_id = provider_message_id
        delivery.last_error_code = None
        delivery.sent_at = now
        await self.session.flush()

    async def mark_invalid_token(
        self,
        delivery: NotificationDelivery,
        *,
        now: datetime,
        error_code: str,
    ) -> None:
        delivery.state = DeliveryState.DEAD_LETTER
        delivery.claimed_at = None
        delivery.last_error_code = error_code[:120]
        delivery.dead_lettered_at = now
        delivery.device_token.is_active = False
        delivery.device_token.invalidated_at = now
        await self.session.flush()

    async def mark_retryable_failure(
        self,
        delivery: NotificationDelivery,
        *,
        now: datetime,
        error_code: str,
        max_attempts: int,
        retry_delay: timedelta,
    ) -> bool:
        delivery.claimed_at = None
        delivery.last_error_code = error_code[:120]
        if delivery.attempt_count >= max_attempts:
            delivery.state = DeliveryState.DEAD_LETTER
            delivery.dead_lettered_at = now
            dead_lettered = True
        else:
            delivery.state = DeliveryState.RETRY
            delivery.next_attempt_at = now + retry_delay
            dead_lettered = False
        await self.session.flush()
        return dead_lettered
