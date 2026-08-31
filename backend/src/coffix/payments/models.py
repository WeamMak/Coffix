from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from coffix.core.database import Base
from coffix.payments.providers import ProviderResource


class PaymentPhase(StrEnum):
    ORDER = "order"
    DIAGNOSTIC = "diagnostic"
    ADDITIONAL = "additional"


class PaymentState(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FAILED = "failed"


class RefundState(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FAILED = "failed"


payment_phase_type = SqlEnum(
    PaymentPhase,
    name="payment_phase",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda phases: [phase.value for phase in phases],
)
payment_state_type = SqlEnum(
    PaymentState,
    name="payment_state",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda states: [state.value for state in states],
)
refund_state_type = SqlEnum(
    RefundState,
    name="refund_state",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda states: [state.value for state in states],
)
provider_resource_type = SqlEnum(
    ProviderResource,
    name="provider_resource",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda resources: [resource.value for resource in resources],
)


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("phase IN ('order', 'diagnostic', 'additional')", name="valid_phase"),
        CheckConstraint("amount_agorot > 0", name="positive_amount"),
        CheckConstraint("currency = 'ILS'", name="currency_is_ils"),
        CheckConstraint("state IN ('pending', 'confirmed', 'failed')", name="valid_state"),
        UniqueConstraint("provider", "provider_payment_id", name="provider_payment_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(index=True)
    phase: Mapped[PaymentPhase] = mapped_column(payment_phase_type)
    amount_agorot: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="ILS", server_default="ILS")
    provider: Mapped[str] = mapped_column(String(30))
    provider_payment_id: Mapped[str | None] = mapped_column(String(255))
    provider_client_secret: Mapped[str | None] = mapped_column(Text)
    state: Mapped[PaymentState] = mapped_column(
        payment_state_type, default=PaymentState.PENDING, server_default=PaymentState.PENDING.value
    )
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True)
    request_fingerprint: Mapped[str] = mapped_column(String(64))
    failure_code: Mapped[str | None] = mapped_column(String(120))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    refunds: Mapped[list["Refund"]] = relationship(back_populates="payment")

    def apply_state(self, state: PaymentState, now: datetime) -> bool:
        if self.state is PaymentState.CONFIRMED:
            return False
        if self.state is PaymentState.FAILED and state is not PaymentState.CONFIRMED:
            return False
        if self.state is state:
            return False
        self.state = state
        if state is PaymentState.CONFIRMED:
            self.confirmed_at = now
            self.failure_code = None
        elif state is PaymentState.FAILED:
            self.failed_at = now
        return True


class Refund(Base):
    __tablename__ = "refunds"
    __table_args__ = (
        CheckConstraint("amount_agorot > 0", name="positive_amount"),
        CheckConstraint("currency = 'ILS'", name="currency_is_ils"),
        CheckConstraint("state IN ('pending', 'confirmed', 'failed')", name="valid_state"),
        UniqueConstraint("provider", "provider_refund_id", name="provider_refund_id"),
        UniqueConstraint("payment_id", name="payment_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    payment_id: Mapped[UUID] = mapped_column(
        ForeignKey("payments.id", ondelete="RESTRICT"), index=True
    )
    amount_agorot: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="ILS", server_default="ILS")
    reason: Mapped[str] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(30))
    provider_refund_id: Mapped[str | None] = mapped_column(String(255))
    state: Mapped[RefundState] = mapped_column(
        refund_state_type, default=RefundState.PENDING, server_default=RefundState.PENDING.value
    )
    requested_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True)
    request_fingerprint: Mapped[str] = mapped_column(String(64))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    payment: Mapped[Payment] = relationship(back_populates="refunds")

    def apply_state(self, state: RefundState, now: datetime) -> bool:
        if self.state is RefundState.CONFIRMED:
            return False
        if self.state is RefundState.FAILED and state is not RefundState.CONFIRMED:
            return False
        if self.state is state:
            return False
        self.state = state
        if state is RefundState.CONFIRMED:
            self.confirmed_at = now
        elif state is RefundState.FAILED:
            self.failed_at = now
        return True


class ProviderEventRecord(Base):
    __tablename__ = "provider_events"
    __table_args__ = (
        CheckConstraint("resource IN ('payment', 'refund', 'ignored')", name="valid_resource"),
        UniqueConstraint("provider", "external_event_id", name="provider_external_event"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    provider: Mapped[str] = mapped_column(String(30))
    external_event_id: Mapped[str] = mapped_column(String(255))
    event_type: Mapped[str] = mapped_column(String(255))
    resource: Mapped[ProviderResource] = mapped_column(provider_resource_type)
    provider_object_id: Mapped[str] = mapped_column(String(255))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    processing_result: Mapped[str | None] = mapped_column(String(60))
    result_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default="{}"
    )
    error_metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
