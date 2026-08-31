from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from coffix.notifications.models import DevicePlatform


class DeviceTokenRegistration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=1, max_length=512)
    platform: DevicePlatform


class DeviceTokenRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    platform: DevicePlatform
    is_active: bool
    last_registered_at: datetime


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: str
    title_he: str
    body_he: str
    related_entity_type: str
    related_entity_id: UUID | None
    read_at: datetime | None
    created_at: datetime


class UnreadCountRead(BaseModel):
    unread_count: int
