from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffix.core.database import Base


class DevicePlatform(StrEnum):
    IOS = "ios"
    ANDROID = "android"


class DeliveryState(StrEnum):
    PENDING = "pending"
    RETRY = "retry"
    SENT = "sent"
    DEAD_LETTER = "dead_letter"


device_platform_type = SqlEnum(
    DevicePlatform,
    name="device_platform",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda platforms: [platform.value for platform in platforms],
)
delivery_state_type = SqlEnum(
    DeliveryState,
    name="notification_delivery_state",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda states: [state.value for state in states],
)


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    __table_args__ = (
        CheckConstraint("attempt_count >= 0", name="non_negative_attempt_count"),
        Index("ix_outbox_events_pending", "processed_at", "available_at"),
        Index("ix_outbox_events_aggregate", "aggregate_type", "aggregate_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    event_type: Mapped[str] = mapped_column(String(120))
    aggregate_type: Mapped[str] = mapped_column(String(60))
    aggregate_id: Mapped[UUID] = mapped_column(index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dead_lettered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error_code: Mapped[str | None] = mapped_column(String(120))
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint("event_id", "recipient_id", name="event_recipient"),
        Index("ix_notifications_recipient_created", "recipient_id", "created_at"),
        Index(
            "ix_notifications_recipient_unread",
            "recipient_id",
            "read_at",
            "created_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    event_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("outbox_events.id", ondelete="RESTRICT"), index=True
    )
    recipient_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(120))
    title_he: Mapped[str] = mapped_column(String(200))
    body_he: Mapped[str] = mapped_column(Text)
    related_entity_type: Mapped[str] = mapped_column(String(60))
    related_entity_id: Mapped[UUID | None] = mapped_column(index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    deliveries: Mapped[list["NotificationDelivery"]] = relationship(
        back_populates="notification",
        cascade="all, delete-orphan",
    )


class DeviceToken(Base):
    __tablename__ = "device_tokens"
    __table_args__ = (
        CheckConstraint("platform IN ('ios', 'android')", name="valid_platform"),
        Index("ix_device_tokens_user_active", "user_id", "is_active"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token: Mapped[str] = mapped_column(String(512), unique=True)
    platform: Mapped[DevicePlatform] = mapped_column(device_platform_type)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    invalidated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class NotificationDelivery(Base):
    __tablename__ = "notification_deliveries"
    __table_args__ = (
        CheckConstraint("channel = 'push'", name="valid_channel"),
        CheckConstraint(
            "state IN ('pending', 'retry', 'sent', 'dead_letter')",
            name="valid_state",
        ),
        CheckConstraint("attempt_count >= 0", name="non_negative_attempt_count"),
        UniqueConstraint("notification_id", "device_token_id", name="notification_device"),
        Index("ix_notification_deliveries_due", "state", "next_attempt_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    notification_id: Mapped[UUID] = mapped_column(
        ForeignKey("notifications.id", ondelete="CASCADE"), index=True
    )
    device_token_id: Mapped[UUID] = mapped_column(
        ForeignKey("device_tokens.id", ondelete="CASCADE"), index=True
    )
    channel: Mapped[str] = mapped_column(String(20), default="push", server_default="push")
    state: Mapped[DeliveryState] = mapped_column(
        delivery_state_type,
        default=DeliveryState.PENDING,
        server_default=DeliveryState.PENDING.value,
    )
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_message_id: Mapped[str | None] = mapped_column(String(255))
    last_error_code: Mapped[str | None] = mapped_column(String(120))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dead_lettered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    notification: Mapped[Notification] = relationship(back_populates="deliveries")
    device_token: Mapped[DeviceToken] = relationship()


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_target_created", "target_type", "target_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    actor_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    action: Mapped[str] = mapped_column(String(120), index=True)
    target_type: Mapped[str] = mapped_column(String(60))
    target_id: Mapped[UUID | None] = mapped_column()
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    request_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default="{}"
    )
    correlation_id: Mapped[str | None] = mapped_column(String(128), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
