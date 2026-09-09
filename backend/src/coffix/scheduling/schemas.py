from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from coffix.service.schemas import ServiceRequestRead


class SchedulingSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AppointmentConfirmation(SchedulingSchema):
    technician_id: UUID
    start: datetime
    end: datetime
    allow_overlap: bool = False

    @model_validator(mode="after")
    def validate_window(self) -> "AppointmentConfirmation":
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError("appointment requires timezone-aware values")
        if self.end <= self.start:
            raise ValueError("appointment end must be after start")
        return self


class AssignmentChange(SchedulingSchema):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    technician_id: UUID
    expected_technician_id: UUID
    reason: str = Field(min_length=3, max_length=500)
    allow_overlap: bool = False


class ScheduleOverlapWarning(SchedulingSchema):
    request_id: UUID
    reference: str
    start: datetime
    end: datetime


class AppointmentConfirmationRead(SchedulingSchema):
    service_request: ServiceRequestRead
    overlap_warnings: list[ScheduleOverlapWarning]
