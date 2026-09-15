from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, Strict, field_validator


class ShopAddress(BaseModel):
    # Legacy bootstrap addresses can be incomplete. Ignore internal legacy fields in projections.
    street: str | None = None
    building: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: Literal["IL"] = "IL"


class ShopAddressUpdate(ShopAddress):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    street: str = Field(min_length=1, max_length=120)
    building: str = Field(min_length=1, max_length=30)
    city: str = Field(min_length=1, max_length=80)
    postal_code: str | None = Field(default=None, pattern=r"^[0-9]{5}(?:[0-9]{2})?$")

    @field_validator("postal_code", mode="before")
    @classmethod
    def empty_postal_code(cls, value: object) -> object:
        return value.strip() or None if isinstance(value, str) else value


class ShopSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    version: int
    shipping_fee_agorot: int
    shop_address: ShopAddress
    phone: str | None
    whatsapp: str | None
    email: str | None
    opening_hours: str | None


class ShopSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    version: Annotated[int, Strict(), Field(ge=1)]
    shipping_fee_agorot: Annotated[int, Strict(), Field(ge=0, le=2147483647)]
    shop_address: ShopAddressUpdate
    phone: str | None = Field(pattern=r"^\+[1-9][0-9]{7,14}$")
    whatsapp: str | None = Field(pattern=r"^\+[1-9][0-9]{7,14}$")
    email: EmailStr | None = Field(max_length=254)
    opening_hours: str | None = Field(max_length=1000)

    @field_validator("phone", "whatsapp", "email", "opening_hours", mode="before")
    @classmethod
    def empty_optional(cls, value: object) -> object:
        return value.strip() or None if isinstance(value, str) else value
