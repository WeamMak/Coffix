from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from coffix.catalog.schemas import (
    CategoryRead,
    CategoryUpdate,
    MachineModelRead,
    ProductRead,
    ProductUpdate,
    SkuRead,
    SkuUpdate,
)
from coffix.orders.models import OrderState
from coffix.service.models import ServiceRequestState
from coffix.service.schemas import ServiceTypeRead
from coffix.users.models import Role


class AdminSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DashboardRead(AdminSchema):
    product_revenue_agorot: int
    open_services: int
    awaiting_payment_orders: int
    awaiting_payment_services: int
    todays_appointments: list["DashboardAppointmentRead"]
    users_by_role: dict[str, int]
    orders_by_state: dict[str, int]
    service_requests_by_state: dict[str, int]
    failed_deliveries: int
    pending_outbox_events: int
    failed_outbox_events: int
    low_stock_skus: int


class DashboardAppointmentRead(AdminSchema):
    id: UUID
    reference: str
    technician_name: str | None
    start: datetime
    end: datetime


class UserAccessUpdate(AdminSchema):
    role: Role | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> "UserAccessUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one access field is required")
        return self


class AdminUserRead(AdminSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    phone_e164: str
    role: Role
    display_name: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class StockCorrection(AdminSchema):
    quantity: int | None = Field(default=None, ge=0)
    expected_quantity: int | None = Field(default=None, ge=0)
    reason: str = Field(min_length=3, max_length=500)


class InventoryRead(AdminSchema):
    id: UUID
    sku_code: str
    product_name_he: str
    stock_quantity: int | None
    reserved_quantity: int
    available_quantity: int | None
    is_active: bool


class OrderQueueRead(AdminSchema):
    id: UUID
    order_number: str
    customer_id: UUID
    state: str
    total_agorot: int
    created_at: datetime
    updated_at: datetime


class ServiceQueueRead(AdminSchema):
    id: UUID
    reference: str
    customer_id: UUID
    assigned_technician_id: UUID | None
    state: str
    created_at: datetime
    updated_at: datetime


class DeliveryFailureRead(AdminSchema):
    can_retry: bool = False
    id: UUID
    notification_id: UUID
    state: str
    attempt_count: int
    last_error_code: str | None
    next_attempt_at: datetime
    dead_lettered_at: datetime | None


class AuditLogRead(AdminSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    actor_id: UUID | None
    action: str
    target_type: str
    target_id: UUID | None
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    ip_address: str | None
    request_metadata: dict[str, Any]
    correlation_id: str | None
    created_at: datetime


class ConfigurationRead(AdminSchema):
    categories: list[CategoryRead]
    products: list[ProductRead]
    machine_models: list[MachineModelRead]
    service_types: list[ServiceTypeRead]
    shipping_fee_agorot: int
    shop_address: dict[str, Any]


# Admin edit tokens reuse the database timestamp, preserving its microseconds.
# Clients must return the token verbatim; writes compare it under a row lock.
class AdminCategoryRead(CategoryRead):
    version: datetime = Field(validation_alias="updated_at")


class AdminCategoryUpdate(CategoryUpdate):
    version: datetime


class AdminSkuRead(SkuRead):
    version: datetime = Field(validation_alias="updated_at")


class AdminSkuUpdate(SkuUpdate):
    version: datetime


class AdminProductRead(ProductRead):
    version: datetime = Field(validation_alias="updated_at")
    skus: list[AdminSkuRead]


class AdminProductUpdate(ProductUpdate):
    version: datetime


class AdminProductPage(AdminSchema):
    items: list[AdminProductRead]
    page: int
    limit: int
    total: int


class AdminListParams(AdminSchema):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)
    q: str = Field(default="", max_length=160)
    active: bool | None = None


class AdminProductParams(AdminListParams):
    category_id: UUID | None = None
    featured: bool | None = None


class AdminOrderParams(AdminSchema):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)
    q: str = Field(default="", max_length=160)
    state: OrderState | None = None


class AdminServiceParams(AdminSchema):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)
    q: str = Field(default="", max_length=160)
    state: ServiceRequestState | None = None
    technician_id: UUID | None = None


class AdminUserParams(AdminListParams):
    role: Role | None = None


class AuditParams(AdminSchema):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=100, ge=1, le=500)
    action: str = Field(default="", max_length=120)
    target_type: str = Field(default="", max_length=60)
    target_id: UUID | None = None
    actor_id: UUID | None = None
    from_time: datetime | None = None
    to_time: datetime | None = None

    @model_validator(mode="after")
    def valid_period(self) -> "AuditParams":
        if any(
            value is not None and value.tzinfo is None for value in (self.from_time, self.to_time)
        ):
            raise ValueError("Audit times require a timezone")
        if self.from_time and self.to_time and self.to_time <= self.from_time:
            raise ValueError("Audit end must follow start")
        return self
