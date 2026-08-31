from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from coffix.machines.models import MachineSource


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
    created_at: datetime
    updated_at: datetime
