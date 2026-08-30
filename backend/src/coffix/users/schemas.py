from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from coffix.users.models import Role


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    phone_e164: str
    role: Role
    display_name: str | None
    is_active: bool


class AddressCreate(BaseModel):
    recipient_name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=9, max_length=24)
    street: str = Field(min_length=1, max_length=120)
    building: str = Field(min_length=1, max_length=30)
    apartment: str | None = Field(default=None, max_length=30)
    city: str = Field(min_length=1, max_length=80)
    postal_code: str | None = Field(default=None, max_length=12)
    country: Literal["IL"] = "IL"
    is_default: bool = False

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        from coffix.users.service import normalize_israeli_phone

        return normalize_israeli_phone(value)


class AddressUpdate(BaseModel):
    recipient_name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, min_length=9, max_length=24)
    street: str | None = Field(default=None, min_length=1, max_length=120)
    building: str | None = Field(default=None, min_length=1, max_length=30)
    apartment: str | None = Field(default=None, max_length=30)
    city: str | None = Field(default=None, min_length=1, max_length=80)
    postal_code: str | None = Field(default=None, max_length=12)
    country: Literal["IL"] | None = None
    is_default: bool | None = None

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        from coffix.users.service import normalize_israeli_phone

        return normalize_israeli_phone(value)


class AddressRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    recipient_name: str
    phone_e164: str
    street: str
    building: str
    apartment: str | None
    city: str
    postal_code: str | None
    country: Literal["IL"]
    is_default: bool
    created_at: datetime
    updated_at: datetime
