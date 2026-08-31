from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from coffix.service.schemas import ServiceRequestRead


class SchedulingSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AppointmentConfirmation(SchedulingSchema):
    technician_id: UUID
    start: datetime
    end: datetime

    @model_validator(mode="after")
    def validate_window(self) -> "AppointmentConfirmation":
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError("appointment requires timezone-aware values")
        if self.end <= self.start:
            raise ValueError("appointment end must be after start")
        return self


class ScheduleOverlapWarning(SchedulingSchema):
    request_id: UUID
    reference: str
    start: datetime
    end: datetime


class AppointmentConfirmationRead(SchedulingSchema):
    service_request: ServiceRequestRead
    overlap_warnings: list[ScheduleOverlapWarning]
