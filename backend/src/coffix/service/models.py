from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffix.core.database import Base


class ServiceRequestState(StrEnum):
    AWAITING_DIAGNOSTIC_PAYMENT = "awaiting_diagnostic_payment"
    AWAITING_ADMIN_REVIEW = "awaiting_admin_review"
    SCHEDULED = "scheduled"
    RECEIVED = "received"
    DIAGNOSING = "diagnosing"
    AWAITING_ADDITIONAL_DECISION = "awaiting_additional_decision"
    AWAITING_ADDITIONAL_PAYMENT = "awaiting_additional_payment"
    REPAIR_IN_PROGRESS = "repair_in_progress"
    READY_FOR_RETURN = "ready_for_return"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


service_request_state_type = SqlEnum(
    ServiceRequestState,
    name="service_request_state",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda states: [state.value for state in states],
)


class ServiceLocationMode(StrEnum):
    BRING_IN = "bring_in"
    PICKUP = "pickup"


class ServiceQuoteDecision(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class ServiceNoteVisibility(StrEnum):
    INTERNAL = "internal"
    CUSTOMER = "customer"


class ServiceMediaPurpose(StrEnum):
    ISSUE = "issue"
    DIAGNOSIS = "diagnosis"
    REPAIR = "repair"


service_location_mode_type = SqlEnum(
    ServiceLocationMode,
    name="service_location_mode",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda modes: [mode.value for mode in modes],
)
service_quote_decision_type = SqlEnum(
    ServiceQuoteDecision,
    name="service_quote_decision",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda decisions: [decision.value for decision in decisions],
)
service_note_visibility_type = SqlEnum(
    ServiceNoteVisibility,
    name="service_note_visibility",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda visibilities: [visibility.value for visibility in visibilities],
)
service_media_purpose_type = SqlEnum(
    ServiceMediaPurpose,
    name="service_media_purpose",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda purposes: [purpose.value for purpose in purposes],
)


class ServiceType(Base):
    __tablename__ = "service_types"
    __table_args__ = (
        CheckConstraint("diagnostic_fee_agorot > 0", name="positive_diagnostic_fee"),
        CheckConstraint("version > 0", name="positive_version"),
        UniqueConstraint("label_en", name="label_en"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    label_he: Mapped[str] = mapped_column(String(160))
    label_en: Mapped[str] = mapped_column(String(160))
    diagnostic_fee_agorot: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    model_links: Mapped[list["ServiceTypeMachineModel"]] = relationship(
        back_populates="service_type",
        cascade="all, delete-orphan",
    )


class ServiceTypeMachineModel(Base):
    __tablename__ = "service_type_machine_models"
    __table_args__ = (
        UniqueConstraint("service_type_id", "machine_model_id", name="service_type_model"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    service_type_id: Mapped[UUID] = mapped_column(
        ForeignKey("service_types.id", ondelete="CASCADE"), index=True
    )
    machine_model_id: Mapped[UUID] = mapped_column(
        ForeignKey("machine_models.id", ondelete="RESTRICT"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    service_type: Mapped[ServiceType] = relationship(back_populates="model_links")


class ServiceRequest(Base):
    __tablename__ = "service_requests"
    __table_args__ = (
        CheckConstraint(
            "state IN ('awaiting_diagnostic_payment', 'awaiting_admin_review', "
            "'scheduled', 'received', 'diagnosing', 'awaiting_additional_decision', "
            "'awaiting_additional_payment', 'repair_in_progress', 'ready_for_return', "
            "'completed', 'cancelled')",
            name="valid_state",
        ),
        CheckConstraint(
            "location_mode IN ('bring_in', 'pickup')",
            name="valid_location_mode",
        ),
        CheckConstraint("diagnostic_fee_agorot > 0", name="positive_diagnostic_fee"),
        CheckConstraint("currency = 'ILS'", name="currency_is_ils"),
        CheckConstraint(
            "(preferred_window_start IS NULL AND preferred_window_end IS NULL) OR "
            "(preferred_window_start IS NOT NULL AND preferred_window_end > "
            "preferred_window_start)",
            name="valid_preferred_window",
        ),
        CheckConstraint(
            "(confirmed_appointment_start IS NULL AND confirmed_appointment_end IS NULL) OR "
            "(confirmed_appointment_start IS NOT NULL AND confirmed_appointment_end > "
            "confirmed_appointment_start)",
            name="valid_confirmed_appointment",
        ),
        Index("ix_service_requests_customer_created", "customer_id", "created_at"),
        Index("ix_service_requests_machine_created", "machine_id", "created_at"),
        Index("ix_service_requests_state_created", "state", "created_at"),
        Index("ix_service_requests_state_updated", "state", "updated_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    reference: Mapped[str] = mapped_column(String(32), unique=True)
    customer_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    machine_id: Mapped[UUID] = mapped_column(
        ForeignKey("registered_machines.id", ondelete="RESTRICT"), index=True
    )
    service_type_id: Mapped[UUID] = mapped_column(
        ForeignKey("service_types.id", ondelete="RESTRICT"), index=True
    )
    diagnostic_payment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("payments.id", ondelete="RESTRICT"), unique=True
    )
    assigned_technician_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    state: Mapped[ServiceRequestState] = mapped_column(
        service_request_state_type,
        default=ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
        server_default=ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT.value,
    )
    diagnostic_fee_agorot: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="ILS", server_default="ILS")
    description: Mapped[str] = mapped_column(Text)
    location_mode: Mapped[ServiceLocationMode] = mapped_column(service_location_mode_type)
    address_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB)
    preferred_window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    preferred_window_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_appointment_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_appointment_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    service_type: Mapped[ServiceType] = relationship()
    history: Mapped[list["ServiceStatusHistory"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        order_by=lambda: (ServiceStatusHistory.created_at, ServiceStatusHistory.id),
    )
    notes: Mapped[list["ServiceNote"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        order_by=lambda: (ServiceNote.created_at, ServiceNote.id),
    )
    media: Mapped[list["ServiceMedia"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        order_by=lambda: (ServiceMedia.created_at, ServiceMedia.id),
    )
    quotes: Mapped[list["ServiceQuote"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        order_by=lambda: (ServiceQuote.created_at, ServiceQuote.id),
    )


class ServiceQuote(Base):
    __tablename__ = "service_quotes"
    __table_args__ = (
        CheckConstraint("amount_agorot > 0", name="positive_amount"),
        CheckConstraint("currency = 'ILS'", name="currency_is_ils"),
        CheckConstraint(
            "decision IN ('pending', 'accepted', 'declined')",
            name="valid_decision",
        ),
        Index(
            "uq_service_quotes_one_pending",
            "request_id",
            unique=True,
            postgresql_where=text("decision = 'pending'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(
        ForeignKey("service_requests.id", ondelete="CASCADE"), index=True
    )
    admin_author_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    additional_payment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("payments.id", ondelete="RESTRICT"), unique=True
    )
    amount_agorot: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="ILS", server_default="ILS")
    explanation: Mapped[str] = mapped_column(Text)
    decision: Mapped[ServiceQuoteDecision] = mapped_column(
        service_quote_decision_type,
        default=ServiceQuoteDecision.PENDING,
        server_default=ServiceQuoteDecision.PENDING.value,
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    request: Mapped[ServiceRequest] = relationship(back_populates="quotes")


class ServiceNote(Base):
    __tablename__ = "service_notes"
    __table_args__ = (
        CheckConstraint(
            "visibility IN ('internal', 'customer')",
            name="valid_visibility",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(
        ForeignKey("service_requests.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    visibility: Mapped[ServiceNoteVisibility] = mapped_column(service_note_visibility_type)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped[ServiceRequest] = relationship(back_populates="notes")


class ServiceMedia(Base):
    __tablename__ = "service_media"
    __table_args__ = (
        CheckConstraint(
            "purpose IN ('issue', 'diagnosis', 'repair')",
            name="valid_purpose",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(
        ForeignKey("service_requests.id", ondelete="CASCADE"), index=True
    )
    note_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("service_notes.id", ondelete="SET NULL"), index=True
    )
    media_id: Mapped[UUID] = mapped_column(
        ForeignKey("media_objects.id", ondelete="RESTRICT"), unique=True
    )
    uploader_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    purpose: Mapped[ServiceMediaPurpose] = mapped_column(service_media_purpose_type)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped[ServiceRequest] = relationship(back_populates="media")


class ServiceStatusHistory(Base):
    __tablename__ = "service_status_history"
    __table_args__ = (
        Index("ix_service_status_history_request_created", "request_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(
        ForeignKey("service_requests.id", ondelete="CASCADE"), index=True
    )
    from_state: Mapped[ServiceRequestState | None] = mapped_column(service_request_state_type)
    to_state: Mapped[ServiceRequestState] = mapped_column(service_request_state_type)
    actor_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    source: Mapped[str] = mapped_column(String(30))
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped[ServiceRequest] = relationship(back_populates="history")


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
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
