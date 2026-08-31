from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from coffix.machines.models import MachineSource


class MachineSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MachineCreate(MachineSchema):
    machine_model_id: UUID
    serial_number: str = Field(min_length=1, max_length=160)
    purchase_date: date | None = None
    media_id: UUID | None = None


class MachineSerialUpdate(MachineSchema):
    serial_number: str = Field(min_length=1, max_length=160)


class MachineModelSummary(MachineSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    manufacturer: str
    model_name: str


class MachineServiceHistoryRead(MachineSchema):
    service_request_id: UUID
    reference: str
    state: str
    service_type_label_he: str
    created_at: datetime
    updated_at: datetime


class RegisteredMachineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    customer_id: UUID
    machine_model_id: UUID
    serial_number: str | None
    serial_pending: bool
    source: MachineSource
    source_order_item_id: UUID | None
    source_unit_index: int | None
    purchase_date: date | None
    warranty_start_date: date | None
    warranty_end_date: date | None
    warranty_months: int | None
    model: MachineModelSummary
    media_ids: list[UUID]
    service_history: list[MachineServiceHistoryRead]
    created_at: datetime
    updated_at: datetime
