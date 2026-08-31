from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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
    diagnostic_fee_agorot: int
    currency: Literal["ILS"]
    location_mode: ServiceLocationMode
    allowed_actions: tuple[str, ...]
    created_at: datetime
    updated_at: datetime


class ServiceTypeCreate(ServiceSchema):
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


class ServiceRequestRead(ServiceSchema):
    id: UUID
    reference: str
    machine_id: UUID
    service_type_id: UUID
    service_type_label_he: str
    state: ServiceRequestState
    diagnostic_fee_agorot: int
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
