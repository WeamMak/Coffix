from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from coffix.payments.models import PaymentState
from coffix.service.models import (
    ServiceLocationMode,
    ServiceMediaPurpose,
    ServiceNoteVisibility,
    ServiceQuoteDecision,
    ServiceRequestState,
)


class ServiceSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ServiceAddressInput(ServiceSchema):
    recipient_name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=9, max_length=24)
    street: str = Field(min_length=1, max_length=120)
    building: str = Field(min_length=1, max_length=30)
    apartment: str | None = Field(default=None, max_length=30)
    city: str = Field(min_length=1, max_length=80)
    postal_code: str | None = Field(default=None, max_length=12)
    country: Literal["IL"] = "IL"

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        from coffix.users.service import normalize_israeli_phone

        return normalize_israeli_phone(value)


class PreferredWindowInput(ServiceSchema):
    start: datetime
    end: datetime

    @model_validator(mode="after")
    def validate_window(self) -> "PreferredWindowInput":
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError("preferred window requires timezone-aware values")
        if self.end <= self.start:
            raise ValueError("preferred window end must be after start")
        return self


class ServiceRequestCreate(ServiceSchema):
    urgency_id: str = Field(default="normal", max_length=40)
    intake_version: int | None = Field(default=None, gt=0)
    service_type_id: UUID
    description: str = Field(min_length=10, max_length=4000)
    location_mode: ServiceLocationMode
    address_id: UUID | None = None
    address: ServiceAddressInput | None = None
    preferred_window: PreferredWindowInput | None = None
    media_ids: list[UUID] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def validate_location_and_media(self) -> "ServiceRequestCreate":
        has_saved_address = self.address_id is not None
        has_inline_address = self.address is not None
        if self.location_mode is ServiceLocationMode.PICKUP:
            if has_saved_address == has_inline_address:
                raise ValueError("pickup requires exactly one address source")
        elif has_saved_address or has_inline_address:
            raise ValueError("bring-in service does not accept a pickup address")
        if len(set(self.media_ids)) != len(self.media_ids):
            raise ValueError("media IDs must be unique")
        return self


class ServiceRequestSummary(ServiceSchema):
    id: UUID
    reference: str
    machine_id: UUID
    state: ServiceRequestState
    service_type_label_he: str
    diagnostic_fee_agorot: int | None
    currency: Literal["ILS"]
    location_mode: ServiceLocationMode
    allowed_actions: tuple[str, ...]
    created_at: datetime
    updated_at: datetime


ServiceIcon = Literal[
    "tool", "sun", "star", "shield", "info", "droplet", "settings", "coffee", "zap"
]
ServiceTag = Annotated[str, Field(min_length=1, max_length=60)]


class ServiceTypeCreate(ServiceSchema):
    icon_key: ServiceIcon = "tool"
    tags_he: list[ServiceTag] = Field(default_factory=list, max_length=8)
    label_he: str = Field(min_length=1, max_length=160)
    label_en: str = Field(min_length=1, max_length=160)
    diagnostic_fee_agorot: int = Field(gt=0)
    is_active: bool = True
    machine_model_ids: list[UUID] = Field(min_length=1)

    @field_validator("machine_model_ids")
    @classmethod
    def unique_model_ids(cls, value: list[UUID]) -> list[UUID]:
        if len(set(value)) != len(value):
            raise ValueError("machine model IDs must be unique")
        return value


class ServiceTypeUpdate(ServiceSchema):
    icon_key: ServiceIcon | None = None
    tags_he: list[ServiceTag] | None = Field(default=None, max_length=8)
    expected_version: int = Field(gt=0)
    label_he: str | None = Field(default=None, min_length=1, max_length=160)
    label_en: str | None = Field(default=None, min_length=1, max_length=160)
    diagnostic_fee_agorot: int | None = Field(default=None, gt=0)
    is_active: bool | None = None
    machine_model_ids: list[UUID] | None = Field(default=None, min_length=1)

    @field_validator("machine_model_ids")
    @classmethod
    def unique_model_ids(cls, value: list[UUID] | None) -> list[UUID] | None:
        if value is not None and len(set(value)) != len(value):
            raise ValueError("machine model IDs must be unique")
        return value


class ServiceTypeRead(ServiceSchema):
    icon_key: ServiceIcon
    tags_he: list[str]
    id: UUID
    label_he: str
    label_en: str
    diagnostic_fee_agorot: int
    currency: Literal["ILS"] = "ILS"
    is_active: bool
    version: int
    machine_model_ids: list[UUID]
    created_at: datetime
    updated_at: datetime


class ServiceHistoryRead(ServiceSchema):
    staff_name: str | None = None
    from_state: ServiceRequestState | None
    to_state: ServiceRequestState
    source: str
    reason: str | None
    created_at: datetime


class ServiceNoteRead(ServiceSchema):
    id: UUID
    author_id: UUID
    visibility: ServiceNoteVisibility
    body: str
    created_at: datetime


class ServiceMediaRead(ServiceSchema):
    id: UUID
    media_id: UUID
    uploader_id: UUID
    purpose: ServiceMediaPurpose
    note_id: UUID | None
    created_at: datetime


class ServiceQuoteRead(ServiceSchema):
    id: UUID
    amount_agorot: int
    currency: Literal["ILS"]
    explanation: str
    decision: ServiceQuoteDecision
    decided_at: datetime | None
    created_at: datetime


class ServiceTechnicianRead(ServiceSchema):
    display_name: str | None
    phone_e164: str


class ServiceRequestRead(ServiceSchema):
    assigned_technician: ServiceTechnicianRead | None = None
    reviewed_by: ServiceTechnicianRead | None = None
    diagnostic_base_fee_agorot: int | None
    urgency_id: str
    urgency_name_he: str
    urgency_description_he: str
    urgency_surcharge_percent: int
    response_hours: int
    id: UUID
    reference: str
    machine_id: UUID
    service_type_id: UUID
    service_type_label_he: str
    state: ServiceRequestState
    diagnostic_fee_agorot: int | None
    currency: Literal["ILS"]
    description: str
    location_mode: ServiceLocationMode
    address_snapshot: dict[str, Any]
    preferred_window_start: datetime | None
    preferred_window_end: datetime | None
    confirmed_appointment_start: datetime | None
    confirmed_appointment_end: datetime | None
    assigned_technician_id: UUID | None
    history: list[ServiceHistoryRead]
    notes: list[ServiceNoteRead]
    media: list[ServiceMediaRead]
    quotes: list[ServiceQuoteRead]
    allowed_actions: tuple[str, ...]
    created_at: datetime
    updated_at: datetime


class ServicePaymentIntentRead(ServiceSchema):
    payment_id: UUID
    provider_payment_id: str
    client_secret: str
    state: PaymentState


class ServiceQuoteCreate(ServiceSchema):
    amount_agorot: int = Field(gt=0, le=100_000_000)
    explanation: str = Field(min_length=1, max_length=4000)


class ServiceQuoteDecisionInput(ServiceSchema):
    decision: Literal[ServiceQuoteDecision.ACCEPTED, ServiceQuoteDecision.DECLINED]


class ServiceOperationalAction(ServiceSchema):
    action: Literal["receive", "start_diagnosis", "ready_for_return", "complete"]


class TechnicianNoteCreate(ServiceSchema):
    body: str = Field(min_length=1, max_length=4000)


class TechnicianMediaCreate(ServiceSchema):
    media_id: UUID


class DiagnosticFeeInput(ServiceSchema):
    amount_agorot: int = Field(gt=0, le=100_000_000)


class UrgencyOption(ServiceSchema):
    id: str = Field(pattern=r"^[a-z][a-z0-9_-]{0,39}$")
    name_he: str = Field(min_length=1, max_length=80)
    description_he: str = Field(min_length=1, max_length=160)
    surcharge_percent: int = Field(ge=0, le=1000)


class IntakeSlot(ServiceSchema):
    start: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")

    @model_validator(mode="after")
    def ordered(self) -> "IntakeSlot":
        if self.end <= self.start:
            raise ValueError("slot end must be after start on the same day")
        return self


class IntakeSettings(ServiceSchema):
    version: int = Field(default=1, gt=0)
    urgencies: list[UrgencyOption] = Field(min_length=1, max_length=12)
    weekdays: list[Annotated[int, Field(ge=0, le=6)]] = Field(max_length=7)
    slots: list[IntakeSlot] = Field(max_length=12)
    horizon_days: int = Field(default=14, ge=1, le=60)
    response_hours: int = Field(default=4, ge=1, le=168)

    @model_validator(mode="after")
    def unique_choices(self) -> "IntakeSettings":
        if len({item.id for item in self.urgencies}) != len(self.urgencies):
            raise ValueError("urgency IDs must be unique")
        if len(set(self.weekdays)) != len(self.weekdays):
            raise ValueError("weekdays must be unique (Monday=0, Sunday=6)")
        slots = sorted(self.slots, key=lambda item: item.start)
        if any(a.end > b.start for a, b in zip(slots, slots[1:])):
            raise ValueError("preferred slots must not overlap")
        return self


class ServiceIntakeOptionsRead(ServiceSchema):
    version: int
    urgencies: list[UrgencyOption]
    preferred_windows: list[PreferredWindowInput]
    response_hours: int
    service_types: list[ServiceTypeRead]
    shop_address: dict[str, Any]
    max_media_files: int
    max_image_bytes: int
    max_video_bytes: int
