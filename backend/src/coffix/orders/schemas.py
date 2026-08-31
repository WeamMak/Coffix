from datetime import datetime
from typing import Annotated, Literal, Self
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, Strict, field_validator, model_validator

from coffix.orders.models import OrderState
from coffix.payments.models import PaymentState, RefundState

StrictNonNegativeInt = Annotated[int, Strict(), Field(ge=0)]


class CheckoutAddress(BaseModel):
    model_config = ConfigDict(extra="forbid")

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


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    address_id: UUID | None = None
    address: CheckoutAddress | None = None

    @model_validator(mode="after")
    def exactly_one_address(self) -> Self:
        if (self.address_id is None) == (self.address is None):
            raise ValueError("provide exactly one saved or one-time address")
        return self


class OrderAddressRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    recipient_name: str
    phone_e164: str
    street: str
    building: str
    apartment: str | None
    city: str
    postal_code: str | None
    country: Literal["IL"]


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    sku_id: UUID
    product_id: UUID
    product_name_he: str
    sku_code: str
    attributes: dict[str, str]
    unit_price_agorot: int
    quantity: int
    line_total_agorot: int
    currency: Literal["ILS"]
    machine_model_id: UUID | None


class OrderHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    from_state: OrderState | None
    to_state: OrderState
    source: str
    reason: str | None
    created_at: datetime | None


class ShipmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    carrier: str
    tracking_number: str
    tracking_url: str | None
    shipped_at: datetime
    delivered_at: datetime | None


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    order_number: str
    state: OrderState
    items: tuple[OrderItemRead, ...]
    subtotal_agorot: int
    shipping_agorot: int
    total_agorot: int
    currency: Literal["ILS"]
    address: OrderAddressRead
    payment_deadline: datetime
    history: tuple[OrderHistoryRead, ...]
    shipment: ShipmentRead | None
    allowed_actions: tuple[str, ...]
    created_at: datetime | None


class PaymentIntentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    payment_id: UUID
    provider_payment_id: str
    client_secret: str
    state: PaymentState


class CheckoutRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    order: OrderRead
    payment: PaymentIntentRead


class ConfirmedReasonCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reason: str = Field(min_length=3, max_length=1000)
    confirm_order_number: str = Field(min_length=5, max_length=32)


class ShipOrderCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    carrier: str = Field(min_length=1, max_length=120)
    tracking_number: str = Field(min_length=1, max_length=160)
    tracking_url: str | None = Field(default=None, max_length=2048)

    @field_validator("tracking_url")
    @classmethod
    def validate_tracking_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("tracking_url must be an absolute HTTP(S) URL")
        return value


class RefundRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    refund_id: UUID
    provider_refund_id: str
    payment_id: UUID
    amount_agorot: int
    currency: str
    state: RefundState
