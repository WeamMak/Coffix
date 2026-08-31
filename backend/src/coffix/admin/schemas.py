from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from coffix.catalog.schemas import CategoryRead, MachineModelRead, ProductRead
from coffix.service.schemas import ServiceTypeRead
from coffix.users.models import Role


class AdminSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DashboardRead(AdminSchema):
    users_by_role: dict[str, int]
    orders_by_state: dict[str, int]
    service_requests_by_state: dict[str, int]
    failed_deliveries: int
    pending_outbox_events: int
    low_stock_skus: int


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
