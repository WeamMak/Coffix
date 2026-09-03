from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from coffix.carts.models import CartStatus


class CartSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CartItemAdd(CartSchema):
    sku_id: UUID
    quantity: int = Field(ge=1)


class CartItemSet(CartSchema):
    quantity: int = Field(ge=1)


class CartItemRead(CartSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    sku_id: UUID
    sku_code: str
    product_id: UUID
    name_he: str
    attributes: dict[str, str]
    quantity: int
    unit_price_agorot: int
    line_total_agorot: int
    stock_quantity: int | None
    is_active: bool
    image_url: str | None
    image_alt_he: str | None


class CartRead(CartSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    status: CartStatus
    items: list[CartItemRead]
    subtotal_agorot: int
    shipping_agorot: int
    total_agorot: int
    total_quantity: int
    currency: Literal["ILS"]
    last_activity_at: datetime
    expires_at: datetime
    version: int
